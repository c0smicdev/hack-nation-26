/**
 * Translates the UI text in src/locales/en/*.json into every other language with Claude, by
 * meaning rather than word for word, and writes src/locales/<language>/<namespace>.json.
 *
 *   npm run i18n:translate             # only new or changed English text
 *   npm run i18n:translate -- de fr    # only these languages
 *   npm run i18n:translate -- --all    # everything again
 *
 * src/locales/translated-from.json remembers the English each translation was made from, so a
 * reworded English string gets translated again. Reads ANTHROPIC_API_KEY from .env.local.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"

import Anthropic from "@anthropic-ai/sdk"

const LOCALES = "src/locales"
const META = `${LOCALES}/translated-from.json`
const MODEL = process.env.SOCRATES_TRANSLATE_MODEL ?? "claude-opus-5-5"
/** Keys per request: enough context for consistent wording, small enough to stay reliable. */
const CHUNK = 60

/** How to address the user: what feels natural in a friendly workplace app. */
const LANGUAGES: Record<string, { name: string; style: string }> = {
  de: { name: "German", style: "Informal 'du', as modern German workplace software does." },
  fr: { name: "French", style: "Formal 'vous'." },
  es: {
    name: "Spanish",
    style: "Informal 'tú', neutral Spanish understood in Spain and Latin America.",
  },
  it: { name: "Italian", style: "Informal 'tu'." },
  pt: { name: "Brazilian Portuguese", style: "'Você'." },
  nl: { name: "Dutch", style: "Informal 'je'." },
  pl: { name: "Polish", style: "Informal second person, as modern Polish apps do." },
  tr: { name: "Turkish", style: "Polite 'siz'." },
  hi: {
    name: "Hindi",
    style: "'आप', everyday Hindi; keep common English IT terms people actually use.",
  },
  zh: { name: "Simplified Chinese", style: "'你', concise mainland Chinese UI wording." },
  ja: {
    name: "Japanese",
    style: "Polite です/ます for sentences; short noun phrases for buttons and labels.",
  },
  ko: { name: "Korean", style: "Polite 해요체 for sentences; short labels for buttons." },
}

const SYSTEM = `You translate the user interface of Socrates, an AI apprentice for the workplace: it watches an expert do a real task on their screen, asks why at the right moments, turns it into a workflow, and later guides a new hire through it by voice.

Translate by meaning, not word for word: write what a native-speaking product writer would put in this exact spot of the app. Keep the tone friendly, clear and brief, and keep buttons and labels as short as the English. Use the same term for the same concept everywhere.

Rules:
- Keep placeholders like {{name}} and {{count}} exactly as they are (same names, same braces), and tags like <strong>…</strong> or <link>…</link> around the matching words.
- Never translate the name "Socrates". Keep established terms people use untranslated in that language (for example ERP, PO, capex/opex where accountants say so).
- Translate product terms too (only "Socrates" stays as it is), and always the same way: "workflow" (a documented way of doing a task), "debrief" (questions after the task), "teach-back" (Socrates explains the task back to be confirmed), "supervised run" (a new hire does the task while Socrates stands by), "off the record", "heads-up", and the coaching styles "Silent observer", "Balanced", "Active coach".
- The key path tells you where the text appears; use it as context.
- Plural entries give the English forms and the plural categories the target language needs: return one form per requested category, each using {{count}} where the English does.`

type Flat = Record<string, string>
type Meta = Record<string, Record<string, Record<string, string>>>

function flatten(value: unknown, prefix = "", out: Flat = {}): Flat {
  if (typeof value === "string") out[prefix] = value
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, out)
    }
  }
  return out
}

function unflatten(flat: Flat) {
  const root: Record<string, unknown> = {}
  for (const [path, text] of Object.entries(flat)) {
    const parts = path.split(".")
    let node = root
    for (const part of parts.slice(0, -1)) node = (node[part] ??= {}) as Record<string, unknown>
    node[parts.at(-1)!] = text
  }
  return root
}

const PLURAL = /_(zero|one|two|few|many|other)$/
const readJson = <T>(file: string, fallback: T): T =>
  existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : fallback
const writeJson = (file: string, value: unknown) =>
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)

function loadEnv() {
  if (!existsSync(".env.local")) return
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = /^(\w+)=(.*)$/.exec(line)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
  }
}

/** One unit to translate: a plain string, or a plural group the target language needs forms for. */
type Item =
  | { kind: "text"; key: string; english: string }
  | { kind: "plural"; key: string; forms: Flat; categories: string[] }

/** The English an item was translated from, for change detection. */
const source = (item: Item) => (item.kind === "text" ? item.english : JSON.stringify(item.forms))

function itemsFor(english: Flat, language: string): Item[] {
  const categories = new Intl.PluralRules(language).resolvedOptions().pluralCategories
  const items: Item[] = []
  const groups = new Map<string, Flat>()
  for (const [key, text] of Object.entries(english)) {
    const match = PLURAL.exec(key)
    if (!match) {
      items.push({ kind: "text", key, english: text })
      continue
    }
    const base = key.slice(0, -match[0].length)
    if (!groups.has(base)) {
      groups.set(base, {})
      items.push({ kind: "plural", key: base, forms: groups.get(base)!, categories })
    }
    groups.get(base)![match[1]] = text
  }
  return items
}

const outputKeys = (item: Item) =>
  item.kind === "text" ? [item.key] : item.categories.map((c) => `${item.key}_${c}`)

async function translate(client: Anthropic, language: string, namespace: string, items: Item[]) {
  const { name, style } = LANGUAGES[language]
  const keys = items.flatMap(outputKeys)
  const listing = items.map((item) =>
    item.kind === "text"
      ? { key: item.key, english: item.english }
      : {
          key: item.key,
          plural: true,
          englishForms: item.forms,
          returnKeys: outputKeys(item),
        },
  )
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Target language: ${name}. Form of address: ${style}\nScreen area: ${namespace}\n\nReturn every key below with its ${name} text (plural groups: one key per returnKeys entry).\n\n${JSON.stringify(listing, null, 2)}`,
      },
    ],
    output_config: {
      effort: "medium",
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: Object.fromEntries(keys.map((key) => [key, { type: "string" }])),
          required: keys,
          additionalProperties: false,
        },
      },
    },
  })
  const block = response.content.find((b) => b.type === "text")
  if (!block || block.type !== "text") throw new Error(`${language}/${namespace}: no answer`)
  const out = JSON.parse(block.text) as Flat
  // Placeholders must survive: a missing {{count}} would show raw text or drop the number.
  for (const item of items) {
    const english = item.kind === "text" ? item.english : Object.values(item.forms).join(" ")
    const needed = english.match(/\{\{\w+\}\}/g) ?? []
    for (const key of outputKeys(item)) {
      if (typeof out[key] !== "string") throw new Error(`${language}/${namespace}: missing ${key}`)
      const missing = needed.filter((p) => p !== "{{count}}" && !out[key].includes(p))
      if (missing.length)
        throw new Error(`${language}/${namespace}: ${key} lost ${missing.join(" ")}`)
    }
  }
  return out
}

async function translateLanguage(client: Anthropic, language: string, all: boolean, meta: Meta) {
  const namespaces = readdirSync(`${LOCALES}/en`).filter((f) => f.endsWith(".json"))
  mkdirSync(`${LOCALES}/${language}`, { recursive: true })
  let count = 0
  for (const file of namespaces) {
    const namespace = file.replace(/\.json$/, "")
    const english = flatten(readJson(`${LOCALES}/en/${file}`, {}))
    const target = flatten(readJson(`${LOCALES}/${language}/${file}`, {}))
    const done = ((meta[language] ??= {})[namespace] ??= {})
    const items = itemsFor(english, language)
    const todo = items.filter(
      (item) =>
        all || done[item.key] !== source(item) || outputKeys(item).some((k) => !(k in target)),
    )
    for (let i = 0; i < todo.length; i += CHUNK) {
      const chunk = todo.slice(i, i + CHUNK)
      Object.assign(target, await translate(client, language, namespace, chunk))
      for (const item of chunk) done[item.key] = source(item)
    }
    // Same key order as English; keys English no longer has are dropped.
    const ordered: Flat = {}
    for (const item of items) for (const key of outputKeys(item)) ordered[key] = target[key]
    writeJson(`${LOCALES}/${language}/${file}`, unflatten(ordered))
    for (const key of Object.keys(done))
      if (!items.some((item) => item.key === key)) delete done[key]
    count += todo.length
  }
  console.log(`${language}: ${count} translated`)
}

async function main() {
  loadEnv()
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Set ANTHROPIC_API_KEY in .env.local")
  const args = process.argv.slice(2)
  const all = args.includes("--all")
  const picked = args.filter((a) => !a.startsWith("--"))
  const unknown = picked.filter((l) => !(l in LANGUAGES))
  if (unknown.length) throw new Error(`Unknown language(s): ${unknown.join(", ")}`)
  const languages = picked.length ? picked : Object.keys(LANGUAGES)

  const client = new Anthropic()
  const meta = readJson<Meta>(META, {})
  const results = await Promise.allSettled(
    languages.map((l) => translateLanguage(client, l, all, meta)),
  )
  writeJson(META, meta)
  const failed = results.flatMap((r) => (r.status === "rejected" ? [String(r.reason)] : []))
  if (failed.length) throw new Error(failed.join("\n"))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

import { waitUntil } from "@vercel/functions"
import { z } from "zod"

import type { Language, Quote, WorkMap } from "../src/lib/api/types.js"
import { languageName } from "./language.js"
import { models, prompt, structured, text } from "./llm.js"
import { store } from "./store.js"

/**
 * Workflows are stored in the language the expert recorded them in. A reader who picked another
 * language gets a translated copy: translated by meaning (prompts/translate-workflow.md), with
 * every quote keeping the expert's exact words in `original`. Copies are cached per workflow
 * version, so a workflow is translated once per language until it changes.
 */

/** How long a request waits for a translation before answering "pending" (the UI polls). */
const WAIT_MS = 2500

const Out = z.object({
  title: z.string(),
  summary: z.string(),
  domain: z.string(),
  trigger: z.string(),
  steps: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      decision: z.string(),
      caption: z.string(),
      guardrails: z.array(
        z.object({ id: z.string(), rule: z.string(), escalateTo: z.string().nullable() }),
      ),
      edgeCases: z.array(z.object({ id: z.string(), when: z.string(), then: z.string() })),
    }),
  ),
  debrief: z.array(z.object({ id: z.string(), question: z.string() })),
  teachBack: z.string().nullable(),
  quotes: z.array(z.string()),
})

interface Cached {
  updatedAt: string
  /** Undefined when translating failed: the reader gets the original instead of waiting forever. */
  map?: WorkMap
}

// Survives Vite's server-module reloads, like the store itself.
const state = ((
  globalThis as { __socratesTranslations?: TranslationState }
).__socratesTranslations ??= { cache: new Map(), inFlight: new Map(), readers: new Set() })

interface TranslationState {
  cache: Map<string, Cached>
  inFlight: Map<string, Promise<Cached>>
  /** Languages someone reads workflows in, so new workflows get ready in them right away. */
  readers: Set<Language>
}

const sourceOf = (map: WorkMap): Language => map.language ?? "en"
const keyOf = (map: WorkMap, language: Language) => `${map.id}:${language}`

/** Every quote in a workflow, in a fixed order (the model translates them as one list). */
function quotesOf(map: WorkMap): Quote[] {
  return [
    ...map.steps.flatMap((s) => [
      s.reason,
      ...s.guardrails.map((g) => g.quote),
      ...s.edgeCases.map((e) => e.quote),
    ]),
    ...map.debrief.map((d) => d.answer),
    ...(map.teachBack?.corrections ?? []),
  ].filter((q): q is Quote => !!q)
}

async function translateMap(map: WorkMap, language: Language): Promise<WorkMap> {
  const quotes = quotesOf(map)
  const source = {
    title: map.title,
    summary: map.summary,
    domain: map.domain,
    trigger: map.trigger,
    steps: map.steps.map((s) => ({
      id: s.id,
      title: s.title,
      decision: s.decision,
      caption: s.screen.caption,
      guardrails: s.guardrails.map((g) => ({
        id: g.id,
        rule: g.rule,
        escalateTo: g.escalateTo ?? null,
      })),
      edgeCases: s.edgeCases.map((e) => ({ id: e.id, when: e.when, then: e.then })),
    })),
    debrief: map.debrief.map((d) => ({ id: d.id, question: d.question })),
    teachBack: map.teachBack?.summary ?? null,
    quotes: quotes.map((q) => q.text),
  }
  const out = await structured({
    model: models.translate,
    effort: "low",
    system: prompt("translate-workflow", { language: languageName(language) }),
    schema: Out,
    content: [text(JSON.stringify(source, null, 2))],
  })

  // Matched by id, so a step the model skipped or reordered keeps its original text.
  const steps = new Map(out.steps.map((s) => [s.id, s]))
  const debrief = new Map(out.debrief.map((d) => [d.id, d.question]))
  const translated = new Map(
    quotes.map((q, i) => [q, out.quotes.length === quotes.length ? out.quotes[i] : q.text]),
  )
  const quote = (q: Quote | undefined): Quote | undefined => {
    if (!q) return q
    const value = translated.get(q) ?? q.text
    return value === q.text ? q : { ...q, text: value, original: q.text }
  }

  return {
    ...map,
    title: out.title,
    summary: out.summary,
    domain: out.domain,
    trigger: out.trigger,
    steps: map.steps.map((s) => {
      const t = steps.get(s.id)
      const rules = new Map(t?.guardrails.map((g) => [g.id, g]))
      const cases = new Map(t?.edgeCases.map((e) => [e.id, e]))
      return {
        ...s,
        title: t?.title ?? s.title,
        decision: t?.decision ?? s.decision,
        screen: { ...s.screen, caption: t?.caption ?? s.screen.caption },
        reason: quote(s.reason),
        guardrails: s.guardrails.map((g) => ({
          ...g,
          rule: rules.get(g.id)?.rule ?? g.rule,
          escalateTo: g.escalateTo && (rules.get(g.id)?.escalateTo ?? g.escalateTo),
          quote: quote(g.quote),
        })),
        edgeCases: s.edgeCases.map((e) => ({
          ...e,
          when: cases.get(e.id)?.when ?? e.when,
          then: cases.get(e.id)?.then ?? e.then,
          quote: quote(e.quote),
        })),
      }
    }),
    debrief: map.debrief.map((d) => ({
      ...d,
      question: debrief.get(d.id) ?? d.question,
      answer: quote(d.answer),
    })),
    teachBack: map.teachBack && {
      ...map.teachBack,
      summary: out.teachBack ?? map.teachBack.summary,
      corrections: map.teachBack.corrections.map((c) => quote(c)!),
    },
    language,
    translatedFrom: sourceOf(map),
  }
}

/** Starts (or joins) the translation of this version of `map` into `language`. */
function start(map: WorkMap, language: Language): Promise<Cached> {
  const key = keyOf(map, language)
  const running = state.inFlight.get(key)
  if (running) return running
  const { updatedAt } = map
  const job = translateMap(map, language)
    .then((translated): Cached => ({ updatedAt, map: translated }))
    .catch((error: unknown): Cached => {
      console.warn(`[translate] ${map.id} → ${language} failed:`, error)
      return { updatedAt }
    })
    .then((result) => {
      state.cache.set(key, result)
      return result
    })
    .finally(() => state.inFlight.delete(key))
  state.inFlight.set(key, job)
  // On Vercel, keep translating after the response went out; locally this does nothing.
  waitUntil(job)
  return job
}

const fresh = (map: WorkMap, language: Language) => {
  const hit = state.cache.get(keyOf(map, language))
  return hit?.updatedAt === map.updatedAt ? hit : undefined
}

/** `map` for a reader of `language`: translated, or marked pending while it's being prepared. */
export async function localize(map: WorkMap, language: Language | undefined): Promise<WorkMap> {
  if (!language || language === sourceOf(map)) return map
  state.readers.add(language)
  const hit = fresh(map, language) ?? (await waitBriefly(start(map, language)))
  if (!hit) return { ...map, translationPending: true }
  return hit.map ?? map
}

const waitBriefly = <T>(job: Promise<T>) =>
  Promise.race([job, new Promise<undefined>((resolve) => setTimeout(resolve, WAIT_MS))])

/** Someone switched to `language`: translate every workflow into it before they open one. */
export function prepareLanguage(language: Language | undefined) {
  if (!language) return
  state.readers.add(language)
  for (const map of store.workMaps) {
    if (language !== sourceOf(map) && !fresh(map, language)) void start(map, language)
  }
}

/** A workflow was saved: translate it into every language someone reads. */
export async function prepareWorkMap(map: WorkMap) {
  await Promise.all(
    [...state.readers]
      .filter((language) => language !== sourceOf(map))
      .map((language) => start(map, language)),
  )
}

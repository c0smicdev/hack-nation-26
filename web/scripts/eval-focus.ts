/**
 * Scores the focus boxes the app draws on step screenshots against hand-labeled ground truth.
 *
 *   npm run eval:focus
 *
 * Runs server/focus.ts (the code the capture pipeline uses) on every case in eval/focus/labels.json.
 * A case passes if the predicted box's centre lies inside a labeled box; for "screen" cases
 * (the caption is about the whole screen) no box passes too. Exits 1 below 80% overall or on
 * "element" cases. Needs ANTHROPIC_API_KEY in .env.local.
 */
import { readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import { createServer } from "vite"

import type { locateFocus as LocateFocus } from "../server/focus.ts"
import type { models as Models } from "../server/llm.ts"
import type { Rect } from "../src/lib/api/types.ts"

interface Case {
  frame: string
  caption: string
  kind: "element" | "screen"
  boxes: Rect[]
}

interface Result extends Case {
  predicted: Rect | null
  pass: boolean
}

const DIR = "eval/focus"
const THRESHOLD = 0.8
const PARALLEL = 4

// Vite resolves server/'s `.js` import specifiers and loads .env.local, exactly like `npm run dev`.
const vite = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
  logLevel: "error",
})
const { locateFocus } = (await vite.ssrLoadModule("/server/focus.ts")) as {
  locateFocus: typeof LocateFocus
}
const { models } = (await vite.ssrLoadModule("/server/llm.ts")) as { models: typeof Models }

const { cases } = JSON.parse(readFileSync(path.join(DIR, "labels.json"), "utf8")) as {
  cases: Case[]
}

async function score(c: Case): Promise<Result> {
  const predicted = await locateFocus(readFileSync(path.join(DIR, c.frame)), c.caption)
  if (!predicted) return { ...c, predicted: null, pass: c.kind === "screen" }
  const x = predicted.x + predicted.width / 2
  const y = predicted.y + predicted.height / 2
  const pass = c.boxes.some(
    (b) => x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height,
  )
  return { ...c, predicted, pass }
}

const results: Result[] = []
for (let i = 0; i < cases.length; i += PARALLEL) {
  results.push(...(await Promise.all(cases.slice(i, i + PARALLEL).map(score))))
}
await vite.close()

for (const r of results) {
  const p = r.predicted
  const box = p
    ? `${p.x.toFixed(2)},${p.y.toFixed(2)} ${p.width.toFixed(2)}×${p.height.toFixed(2)}`
    : "none"
  console.log(
    `${r.pass ? "PASS" : "FAIL"} ${r.kind.padEnd(7)} ${box.padEnd(22)} ${r.caption.slice(0, 90)}`,
  )
}

const elements = results.filter((r) => r.kind === "element")
const overall = results.filter((r) => r.pass).length / results.length
const element = elements.filter((r) => r.pass).length / elements.length
const out = path.join(os.tmpdir(), "socrates-eval-focus.json")
writeFileSync(out, JSON.stringify({ model: models.focus, results }, null, 2))
console.log(
  `\nmodel ${models.focus}\noverall ${(overall * 100).toFixed(1)}% (${results.length})` +
    `  element ${(element * 100).toFixed(1)}% (${elements.length})  → ${out}`,
)
process.exit(overall >= THRESHOLD && element >= THRESHOLD ? 0 : 1)

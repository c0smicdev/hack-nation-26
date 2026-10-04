import type { Guardrail, ID, LiveStep, WorkMap } from "@/lib/api"

/**
 * workflow → Mermaid, deterministically. Steps become nodes (judgment steps are
 * decision diamonds), guardrails hang off their step as side notes. The LLM
 * never writes Mermaid itself: it breaks the syntax too easily.
 *
 * Node ids come from step / guardrail / edge case ids, not positions, so a step
 * inserted during the debrief doesn't renumber (and re-highlight) everything after it.
 */

/** Mermaid-safe label: no quotes, brackets or newlines; short enough to read. */
function label(text: string, max = 70) {
  const clean = text
    .replace(/["`]/g, "'")
    .replace(/[<>{}[\]|#;]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

const GUARDRAIL_PREFIX: Record<Guardrail["kind"], string> = {
  limit: "Limit",
  stop_and_ask: "Stop and ask",
  never: "Never",
}

/** Mermaid node id for a step (or guardrail / edge case) id. */
export const nodeId = (id: ID) => `n_${id.replace(/[^A-Za-z0-9_]/g, "_")}`

export interface ChartOptions {
  /** Steps, guardrails and edge cases that just changed: highlighted for a moment. */
  changed?: ReadonlySet<ID>
  /** Steps with an open question: marked with "?". */
  open?: ReadonlySet<ID>
}

function stepNode(id: string, kind: "routine" | "judgment", text: string, open: boolean) {
  // Diamonds grow with their text, so judgment labels stay shorter.
  const body = `${label(text, kind === "judgment" ? 44 : 70)}${open ? " ?" : ""}`
  return kind === "judgment" ? `  ${id}{"${body}"}` : `  ${id}["${body}"]`
}

/** Edge into a step; the edge out of a judgment carries what the expert decided there. */
function stepEdge(from: string, to: string, prev?: { kind: string; decision: string }) {
  return prev?.kind === "judgment"
    ? `  ${from} -- "${label(prev.decision, 40)}" --> ${to}`
    : `  ${from} --> ${to}`
}

export function workMapToMermaid(map: WorkMap, opts: ChartOptions = {}) {
  const lines = ["flowchart TD", `  start(["${label(`When: ${map.trigger}`, 80)}"])`]
  const classes = (id: ID, node: string, kind: string) => {
    lines.push(`  class ${node} ${kind}`)
    if (opts.open?.has(id)) lines.push(`  class ${node} open`)
    if (opts.changed?.has(id)) lines.push(`  class ${node} changed`)
  }

  map.steps.forEach((step, i) => {
    const id = nodeId(step.id)
    lines.push(stepNode(id, step.kind, `${i + 1}. ${step.title}`, !!opts.open?.has(step.id)))
    classes(step.id, id, step.kind)
    const prev = map.steps[i - 1]
    lines.push(stepEdge(prev ? nodeId(prev.id) : "start", id, prev))

    step.guardrails.forEach((g) => {
      const gid = nodeId(g.id)
      const who = g.kind === "stop_and_ask" && g.escalateTo ? ` (${g.escalateTo})` : ""
      lines.push(`  ${gid}[/"${GUARDRAIL_PREFIX[g.kind]}${label(who, 40)}: ${label(g.rule, 60)}"/]`)
      classes(g.id, gid, "guardrail")
      lines.push(`  ${id} -.- ${gid}`)
    })
    step.edgeCases.forEach((e) => {
      const eid = nodeId(e.id)
      lines.push(`  ${eid}(["If ${label(e.when, 45)} → ${label(e.then, 45)}"])`)
      classes(e.id, eid, "edge")
      lines.push(`  ${id} -.- ${eid}`)
    })
  })
  const last = map.steps.at(-1)
  if (last) lines.push(`  ${nodeId(last.id)} --> done(["Done"])`)

  lines.push(...CLASS_DEFS)
  return lines.join("\n")
}

const CLASS_DEFS = [
  "  classDef routine fill:#f8fafc,stroke:#94a3b8,color:#0f172a",
  "  classDef judgment fill:#eef2ff,stroke:#6366f1,color:#1e1b4b",
  "  classDef guardrail fill:#fff7ed,stroke:#f97316,color:#7c2d12",
  "  classDef edge fill:#f0fdf4,stroke:#22c55e,color:#14532d",
  // Decided differently than the saved workflow: the most valuable thing to ask about.
  "  classDef deviation fill:#fef2f2,stroke:#ef4444,color:#7f1d1d",
  "  classDef current stroke-width:3px",
  "  classDef pending fill:none,stroke:#cbd5e1,stroke-dasharray:4 4,color:#94a3b8",
  // Not fully understood yet: an open question points at it.
  "  classDef open stroke:#ca8a04,stroke-dasharray:5 3",
  // Just added or edited; the caller drops it again after a few seconds.
  "  classDef changed stroke:#16a34a,stroke-width:4px",
]

/**
 * Steps recorded so far → Mermaid, for the graph that grows during recording.
 * Same shapes as the workflow; while recording, a dashed node marks what's next.
 */
export function liveStepsToMermaid(steps: LiveStep[], opts: Pick<ChartOptions, "changed"> = {}) {
  const lines = ["flowchart TD", '  start(["Start"])']
  steps.forEach((step, i) => {
    const id = nodeId(step.id)
    lines.push(stepNode(id, step.kind, step.title, !!step.openQuestion))
    lines.push(`  class ${id} ${step.deviation ? "deviation" : step.kind}`)
    if (step.openQuestion) lines.push(`  class ${id} open`)
    if (opts.changed?.has(step.id)) lines.push(`  class ${id} changed`)
    const prev = steps[i - 1]
    lines.push(stepEdge(prev ? nodeId(prev.id) : "start", id, prev))
    if (step.guardrailNoted) {
      // The expert named a limit here; the debrief turns it into the actual rule.
      lines.push(
        `  ${id}_g[/"Guardrail noted"/]`,
        `  class ${id}_g guardrail`,
        `  ${id} -.- ${id}_g`,
      )
    }
  })
  const last = steps.length ? nodeId(steps[steps.length - 1].id) : "start"
  if (steps.length) lines.push(`  class ${last} current`)
  lines.push('  next(["…"])', "  class next pending", `  ${last} -.-> next`, ...CLASS_DEFS)
  return lines.join("\n")
}

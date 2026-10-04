import type { ID, LiveStep, WorkMap } from "@/lib/api"
import { i18n } from "@/lib/i18n"

/**
 * workflow → Mermaid, deterministically. Steps become nodes (judgment steps are
 * decision hexagons: diamonds balloon with their text), guardrails hang off their step as side notes. The LLM
 * never writes Mermaid itself: it breaks the syntax too easily.
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

export const stepNodeId = (index: number) => `step${index}`

/** Where a new hire is in the Work Map while they run it (Supervise). */
export interface MapProgress {
  currentStepId?: ID
  doneStepIds?: ID[]
  /** Steps Socrates warned about. */
  flaggedStepIds?: ID[]
}

export function workMapToMermaid(map: WorkMap, progress?: MapProgress) {
  // Fixed labels are translated per call, so the chart follows the UI language.
  const t = i18n.t.bind(i18n)
  const when = label(t("workMaps:flowchart.when", { trigger: map.trigger }), 80)
  const lines = ["flowchart TD", `  start(["${when}"])`]
  map.steps.forEach((step, i) => {
    const id = stepNodeId(i)
    const text = `${i + 1}. ${label(step.title)}`
    lines.push(step.kind === "judgment" ? `  ${id}{{"${text}"}}` : `  ${id}["${text}"]`)
    lines.push(`  class ${id} ${step.kind}`)
    // Later classes win, so the order is done → flagged → here.
    if (progress?.doneStepIds?.includes(step.id)) lines.push(`  class ${id} done`)
    if (progress?.flaggedStepIds?.includes(step.id)) lines.push(`  class ${id} flagged`)
    if (progress?.currentStepId === step.id) lines.push(`  class ${id} here`)

    const from = i === 0 ? "start" : stepNodeId(i - 1)
    const prev = map.steps[i - 1]
    // Label the edge out of a judgment with what the expert decided there.
    lines.push(
      prev?.kind === "judgment"
        ? `  ${from} -- "${label(prev.decision, 40)}" --> ${id}`
        : `  ${from} --> ${id}`,
    )

    step.guardrails.forEach((g, j) => {
      const gid = `${id}g${j}`
      const who = g.kind === "stop_and_ask" && g.escalateTo ? ` (${label(g.escalateTo, 40)})` : ""
      const prefix = label(t(`workMaps:flowchart.guardrail.${g.kind}`))
      lines.push(`  ${gid}[/"${prefix}${who}: ${label(g.rule, 60)}"/]`)
      lines.push(`  class ${gid} guardrail`)
      lines.push(`  ${id} -.- ${gid}`)
    })
    step.edgeCases.forEach((e, j) => {
      const eid = `${id}e${j}`
      const text = t("workMaps:flowchart.edgeCase", {
        when: label(e.when, 45),
        then: label(e.then, 45),
      })
      lines.push(`  ${eid}(["${label(text, 120)}"])`)
      lines.push(`  class ${eid} edge`)
      lines.push(`  ${id} -.- ${eid}`)
    })
  })
  if (map.steps.length) {
    const done = label(t("workMaps:flowchart.done"))
    lines.push(`  ${stepNodeId(map.steps.length - 1)} --> done(["${done}"])`)
  }
  lines.push("  class start terminal")
  if (map.steps.length) lines.push("  class done terminal")

  lines.push(...CLASS_DEFS)
  return lines.join("\n")
}

// Brand palette (docs/brand-guidelines.md): Mist nodes, Mint + Forest for judgment,
// a muted amber only where the expert said to stop.
const CLASS_DEFS = [
  "  classDef terminal fill:#064420,stroke:#064420,color:#f6f8f7",
  "  classDef routine fill:#f6f8f7,stroke:#c9d3ce,color:#1a2620",
  "  classDef judgment fill:#e4efe7,stroke:#064420,color:#064420",
  "  classDef guardrail fill:#fbf4e8,stroke:#d4a35a,color:#6b4613",
  "  classDef edge fill:#eef5f0,stroke:#7fb291,stroke-dasharray:5 3,color:#1a2620",
  "  classDef current stroke:#064420,stroke-width:2.5px",
  "  classDef pending fill:none,stroke:#b6c2bc,stroke-dasharray:4 4,color:#66706b",
  "  classDef done fill:#e4efe7,stroke:#7fb291,color:#3d5a48",
  "  classDef flagged stroke:#d4a35a,stroke-width:3px",
  "  classDef here stroke:#064420,stroke-width:3.5px",
]

/**
 * Steps recorded so far → Mermaid, for the graph that grows during recording.
 * Same shapes as the workflow; while recording, a dashed node marks what's next.
 */
export function liveStepsToMermaid(steps: LiveStep[]) {
  const lines = ["flowchart TD", `  start(["${label(i18n.t("workMaps:flowchart.start"))}"])`]
  steps.forEach((step, i) => {
    const id = stepNodeId(i)
    const text = label(step.title)
    lines.push(step.kind === "judgment" ? `  ${id}{{"${text}"}}` : `  ${id}["${text}"]`)
    lines.push(`  class ${id} ${step.kind}`)
    const from = i === 0 ? "start" : stepNodeId(i - 1)
    const prev = steps[i - 1]
    lines.push(
      prev?.kind === "judgment"
        ? `  ${from} -- "${label(prev.decision, 40)}" --> ${id}`
        : `  ${from} --> ${id}`,
    )
  })
  const last = steps.length ? stepNodeId(steps.length - 1) : "start"
  lines.push("  class start terminal")
  if (steps.length) lines.push(`  class ${last} current`)
  lines.push('  next(["…"])', "  class next pending", `  ${last} -.-> next`, ...CLASS_DEFS)
  return lines.join("\n")
}

import type { Guardrail, WorkMap } from "@/lib/api"

/**
 * Work Map → Mermaid, deterministically. Steps become nodes (judgment steps are
 * decision diamonds), guardrails hang off their step as side notes. The LLM
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

const GUARDRAIL_PREFIX: Record<Guardrail["kind"], string> = {
  limit: "Limit",
  stop_and_ask: "Stop and ask",
  never: "Never",
}

export const stepNodeId = (index: number) => `step${index}`

export function workMapToMermaid(map: WorkMap) {
  const lines = ["flowchart TD", `  start(["${label(`When: ${map.trigger}`, 80)}"])`]
  map.steps.forEach((step, i) => {
    const id = stepNodeId(i)
    // Diamonds grow with their text, so judgment labels stay shorter.
    const text = `${i + 1}. ${label(step.title, step.kind === "judgment" ? 44 : 70)}`
    lines.push(step.kind === "judgment" ? `  ${id}{"${text}"}` : `  ${id}["${text}"]`)
    lines.push(`  class ${id} ${step.kind}`)

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
      const who = g.kind === "stop_and_ask" && g.escalateTo ? ` (${g.escalateTo})` : ""
      lines.push(`  ${gid}[/"${GUARDRAIL_PREFIX[g.kind]}${label(who, 40)}: ${label(g.rule, 60)}"/]`)
      lines.push(`  class ${gid} guardrail`)
      lines.push(`  ${id} -.- ${gid}`)
    })
    step.edgeCases.forEach((e, j) => {
      const eid = `${id}e${j}`
      lines.push(`  ${eid}(["If ${label(e.when, 45)} → ${label(e.then, 45)}"])`)
      lines.push(`  class ${eid} edge`)
      lines.push(`  ${id} -.- ${eid}`)
    })
  })
  if (map.steps.length) lines.push(`  ${stepNodeId(map.steps.length - 1)} --> done(["Done"])`)

  lines.push(
    "  classDef routine fill:#f8fafc,stroke:#94a3b8,color:#0f172a",
    "  classDef judgment fill:#eef2ff,stroke:#6366f1,color:#1e1b4b",
    "  classDef guardrail fill:#fff7ed,stroke:#f97316,color:#7c2d12",
    "  classDef edge fill:#f0fdf4,stroke:#22c55e,color:#14532d",
  )
  return lines.join("\n")
}

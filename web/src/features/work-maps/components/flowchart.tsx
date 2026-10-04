import { useTranslation } from "react-i18next"

import { MermaidDiagram } from "@/components/mermaid-diagram"
import type { ID, WorkMap } from "@/lib/api"

import { stepNodeId, workMapToMermaid } from "../flowchart"

/** Clickable flowchart of a workflow. Clicking a step selects it in the document. */
export function Flowchart({
  workMap,
  onSelectStep,
}: {
  workMap: WorkMap
  onSelectStep: (id: ID) => void
}) {
  // Not memoized: the chart's fixed labels (start, done, guardrail kinds) are translated, and
  // useTranslation re-renders on a language switch. The string is cheap to build.
  useTranslation()
  const chart = workMapToMermaid(workMap)
  const clicks = Object.fromEntries(
    workMap.steps.map((step, i) => [stepNodeId(i), () => onSelectStep(step.id)]),
  )
  return (
    <MermaidDiagram
      chart={chart}
      onNodeClick={clicks}
      maxHeight="70svh"
      className="rounded-xl border bg-background p-4"
    />
  )
}

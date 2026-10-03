import { useMemo } from "react"

import { MermaidDiagram } from "@/components/mermaid-diagram"
import type { ID, WorkMap } from "@/lib/api"

import { stepNodeId, workMapToMermaid } from "../flowchart"

/** Clickable flowchart of a Work Map. Clicking a step selects it in the document. */
export function Flowchart({
  workMap,
  onSelectStep,
}: {
  workMap: WorkMap
  onSelectStep: (id: ID) => void
}) {
  const chart = useMemo(() => workMapToMermaid(workMap), [workMap])
  const clicks = Object.fromEntries(
    workMap.steps.map((step, i) => [stepNodeId(i), () => onSelectStep(step.id)]),
  )
  return (
    <MermaidDiagram
      chart={chart}
      onNodeClick={clicks}
      className="rounded-xl border bg-background p-4"
    />
  )
}

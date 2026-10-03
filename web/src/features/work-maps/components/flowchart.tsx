import { useEffect, useId, useRef, useState } from "react"

import { Skeleton } from "@/components/ui/skeleton"
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
  const container = useRef<HTMLDivElement>(null)
  const renderId = `flow-${useId().replace(/:/g, "")}`
  const [error, setError] = useState<string>()
  const [ready, setReady] = useState(false)
  const select = useRef(onSelectStep)
  useEffect(() => {
    select.current = onSelectStep
  })

  useEffect(() => {
    let cancelled = false
    async function render() {
      // Mermaid is large; only load it when a flowchart is shown.
      const { default: mermaid } = await import("mermaid")
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "neutral",
        // Measure labels in the font they render in, or Mermaid clips them.
        themeVariables: {
          fontSize: "14px",
          fontFamily: getComputedStyle(document.body).fontFamily,
        },
        flowchart: { useMaxWidth: false, wrappingWidth: 260, nodeSpacing: 36, rankSpacing: 44 },
      })
      const { svg } = await mermaid.render(renderId, workMapToMermaid(workMap))
      if (cancelled || !container.current) return
      container.current.innerHTML = svg
      workMap.steps.forEach((step, i) => {
        const node = container.current?.querySelector<SVGGElement>(
          `g.node[id*="-${stepNodeId(i)}-"]`,
        )
        if (!node) return
        node.style.cursor = "pointer"
        node.addEventListener("click", () => select.current(step.id))
      })
      setReady(true)
    }
    render().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
    return () => {
      cancelled = true
    }
  }, [workMap, renderId])

  if (error) return <p className="text-sm text-destructive">Couldn't draw the flowchart: {error}</p>
  return (
    <div className="overflow-x-auto rounded-xl border bg-background p-4">
      {!ready && <Skeleton className="h-64" />}
      <div ref={container} className="mx-auto w-fit [&_svg]:max-w-none" />
    </div>
  )
}

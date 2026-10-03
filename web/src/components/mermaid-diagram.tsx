import { useEffect, useId, useRef, useState } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

let renders = 0

/**
 * Renders Mermaid source. `onNodeClick` maps node ids (as written in the source)
 * to click handlers. Re-renders in place when `chart` changes, keeping the old
 * drawing until the new one is ready so a growing graph doesn't flicker.
 */
export function MermaidDiagram({
  chart,
  onNodeClick,
  className,
}: {
  chart: string
  onNodeClick?: Record<string, () => void>
  className?: string
}) {
  const container = useRef<HTMLDivElement>(null)
  const baseId = `mermaid-${useId().replace(/:/g, "")}`
  const [error, setError] = useState<string>()
  const [ready, setReady] = useState(false)
  const clicks = useRef(onNodeClick)
  useEffect(() => {
    clicks.current = onNodeClick
  })

  useEffect(() => {
    let cancelled = false
    async function render() {
      // Mermaid is large; only load it when a diagram is shown.
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
      const { svg } = await mermaid.render(`${baseId}-${++renders}`, chart)
      if (cancelled || !container.current) return
      container.current.innerHTML = svg
      for (const nodeId of Object.keys(clicks.current ?? {})) {
        // Mermaid ids look like "<renderId>-flowchart-<nodeId>-<n>".
        const node = container.current.querySelector<SVGGElement>(`g.node[id*="-${nodeId}-"]`)
        if (!node) continue
        node.style.cursor = "pointer"
        node.addEventListener("click", () => clicks.current?.[nodeId]?.())
      }
      setError(undefined)
      setReady(true)
    }
    render().catch((e: unknown) => {
      if (!cancelled) setError(e instanceof Error ? e.message : String(e))
    })
    return () => {
      cancelled = true
    }
  }, [chart, baseId])

  return (
    <div className={cn("overflow-auto", className)}>
      {error && <p className="text-sm text-destructive">Couldn't draw the diagram: {error}</p>}
      {!ready && !error && <Skeleton className="h-64" />}
      <div ref={container} className="mx-auto w-fit [&_svg]:max-w-none" />
    </div>
  )
}

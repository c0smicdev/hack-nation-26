import { Maximize2, Minimize2 } from "lucide-react"
import { useCallback, useEffect, useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

let renders = 0

/**
 * Renders Mermaid source. `onNodeClick` maps node ids (as written in the source)
 * to click handlers. Re-renders in place when `chart` changes, keeping the old
 * drawing until the new one is ready so a growing graph doesn't flicker.
 *
 * The drawing is scaled down (never up) to fit its box. Without `maxHeight`,
 * `className` must give the box a definite height; with it, the box takes the
 * drawing's height up to that CSS length. A toggle switches to actual size with
 * scrolling when fitting shrank it.
 */
export function MermaidDiagram({
  chart,
  onNodeClick,
  maxHeight,
  className,
}: {
  chart: string
  onNodeClick?: Record<string, () => void>
  /** CSS length, e.g. "70svh". */
  maxHeight?: string
  className?: string
}) {
  const { t } = useTranslation("common")
  const viewport = useRef<HTMLDivElement>(null)
  const container = useRef<HTMLDivElement>(null)
  const baseId = `mermaid-${useId().replace(/:/g, "")}`
  const [error, setError] = useState<string>()
  const [ready, setReady] = useState(false)
  const [canZoom, setCanZoom] = useState(false)
  const [actualSize, setActualSize] = useState(false)
  const actualSizeRef = useRef(actualSize)
  const clicks = useRef(onNodeClick)
  useEffect(() => {
    clicks.current = onNodeClick
  })

  const fit = useCallback(() => {
    const svg = container.current?.querySelector("svg")
    const box = viewport.current
    if (!svg || !box) return
    const { width, height } = svg.viewBox.baseVal
    if (!width || !height) return
    if (maxHeight) {
      const widthScale = Math.min(1, box.clientWidth / width)
      box.style.height = `min(${maxHeight}, ${Math.ceil(height * widthScale)}px)`
    }
    const scale = Math.min(1, box.clientWidth / width, box.clientHeight / height)
    setCanZoom(scale < 0.99)
    const shown = actualSizeRef.current ? 1 : scale
    // Floor so a fitted drawing never overflows by a rounding pixel.
    svg.setAttribute("width", String(Math.floor(width * shown)))
    svg.setAttribute("height", String(Math.floor(height * shown)))
  }, [maxHeight])

  useEffect(() => {
    actualSizeRef.current = actualSize
    fit()
  }, [actualSize, fit])

  useEffect(() => {
    const box = viewport.current
    if (!box) return
    const observer = new ResizeObserver(fit)
    observer.observe(box)
    return () => observer.disconnect()
  }, [fit])

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
      // Size before paint, or a new drawing flashes at full size.
      fit()
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
  }, [chart, baseId, fit])

  return (
    <div className={cn("relative", className)}>
      {/* Fitted: nothing to scroll. Auto margins center the drawing but collapse when it overflows. */}
      <div
        ref={viewport}
        className={cn("flex size-full", actualSize ? "overflow-auto" : "overflow-hidden")}
      >
        {error && (
          <p className="text-sm text-destructive">
            {t("mermaidDiagram.error", { message: error })}
          </p>
        )}
        {!ready && !error && <Skeleton className="h-64 w-full" />}
        <div ref={container} className="m-auto" />
      </div>
      {canZoom && (
        <Button
          variant="outline"
          size="sm"
          className="absolute right-3 bottom-3"
          onClick={() => setActualSize((on) => !on)}
        >
          {actualSize ? <Minimize2 /> : <Maximize2 />}
          {actualSize ? t("mermaidDiagram.fitToView") : t("mermaidDiagram.actualSize")}
        </Button>
      )}
    </div>
  )
}

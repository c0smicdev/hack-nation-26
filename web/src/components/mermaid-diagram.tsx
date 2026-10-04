import { Minus, Plus, Scan } from "lucide-react"
import { useCallback, useEffect, useId, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

let renders = 0

const MIN_SCALE = 0.15
const MAX_SCALE = 3
/** Room kept around a fitted drawing, in px. */
const FIT_PADDING = 48
/** A press that moves less than this is a click, not a drag. */
const DRAG_THRESHOLD = 4

interface View {
  x: number
  y: number
  scale: number
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/**
 * Renders Mermaid source on a canvas you can drag to pan and scroll (or pinch)
 * to zoom. `onNodeClick` maps node ids (as written in the source) to click
 * handlers. Re-renders in place when `chart` changes, keeping the old drawing
 * until the new one is ready so a growing graph doesn't flicker.
 *
 * The drawing starts fitted to its box (never scaled up) and stays fitted while
 * the graph grows, until the user moves it. Without `maxHeight`, `className`
 * must give the box a definite height; with it, the box takes the drawing's
 * height up to that CSS length.
 */
export function MermaidDiagram({
  chart,
  onNodeClick,
  focusNodeId,
  maxHeight,
  scrollToZoom = true,
  className,
}: {
  chart: string
  onNodeClick?: Record<string, () => void>
  /** Node id to bring into view whenever it changes, e.g. the learner's step. */
  focusNodeId?: string
  /** CSS length, e.g. "70svh". */
  maxHeight?: string
  /**
   * Zoom on a plain scroll. Turn off when the diagram sits in a scrolling page,
   * so scrolling past it still scrolls the page; Ctrl/⌘ + scroll and pinch still zoom.
   */
  scrollToZoom?: boolean
  className?: string
}) {
  const viewport = useRef<HTMLDivElement>(null)
  const container = useRef<HTMLDivElement>(null)
  const baseId = `mermaid-${useId().replace(/:/g, "")}`
  const [error, setError] = useState<string>()
  const [ready, setReady] = useState(false)
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 })
  const [dragging, setDragging] = useState(false)
  /** Ease jumps (buttons, fit, focus); direct manipulation must track the pointer. */
  const [animate, setAnimate] = useState(false)
  /** Once the user pans or zooms, stop re-fitting under their hands. */
  const moved = useRef(false)
  const clicks = useRef(onNodeClick)
  useEffect(() => {
    clicks.current = onNodeClick
  })

  const size = useCallback(() => {
    const svg = container.current?.querySelector("svg")
    const { width = 0, height = 0 } = svg?.viewBox.baseVal ?? {}
    return { width, height }
  }, [])

  const fit = useCallback(() => {
    const box = viewport.current
    const { width, height } = size()
    if (!box || !width || !height) return
    const widthScale = Math.min(1, (box.clientWidth - FIT_PADDING * 2) / width)
    if (maxHeight) {
      box.style.height = `min(${maxHeight}, ${Math.ceil(height * widthScale + FIT_PADDING * 2)}px)`
      // In a page, a tall graph would shrink to unreadable; fit the width, start at the top
      // and let the user drag down.
      if (height * widthScale > box.clientHeight - FIT_PADDING * 2) {
        setView({
          scale: widthScale,
          x: (box.clientWidth - width * widthScale) / 2,
          y: FIT_PADDING,
        })
        return
      }
    }
    const scale = clamp(
      Math.min(
        1,
        (box.clientWidth - FIT_PADDING * 2) / width,
        (box.clientHeight - FIT_PADDING * 2) / height,
      ),
      MIN_SCALE,
      MAX_SCALE,
    )
    setView({
      scale,
      x: (box.clientWidth - width * scale) / 2,
      y: (box.clientHeight - height * scale) / 2,
    })
  }, [maxHeight, size])

  const refit = useCallback(() => {
    moved.current = false
    setAnimate(true)
    fit()
  }, [fit])

  /** Zoom by `factor` around a point given in viewport pixels (default: the center). */
  const zoom = useCallback((factor: number, at?: { x: number; y: number }, smooth = false) => {
    const box = viewport.current
    if (!box) return
    moved.current = true
    setAnimate(smooth)
    const px = at?.x ?? box.clientWidth / 2
    const py = at?.y ?? box.clientHeight / 2
    setView((v) => {
      const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE)
      const k = scale / v.scale
      return { scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k }
    })
  }, [])

  useEffect(() => {
    const box = viewport.current
    if (!box) return
    const observer = new ResizeObserver(() => {
      if (!moved.current) fit()
    })
    observer.observe(box)
    return () => observer.disconnect()
  }, [fit])

  // React's onWheel is passive, so it can't stop the page from scrolling or zooming.
  useEffect(() => {
    const box = viewport.current
    if (!box) return
    function onWheel(e: WheelEvent) {
      // Trackpad pinches arrive as wheel events with ctrlKey set.
      if (!scrollToZoom && !e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const rect = box!.getBoundingClientRect()
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
      zoom(Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.0015)), {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      })
    }
    box.addEventListener("wheel", onWheel, { passive: false })
    return () => box.removeEventListener("wheel", onWheel)
  }, [scrollToZoom, zoom])

  // Drag to pan, two fingers to pinch. Pointer capture keeps the drag alive outside the box.
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const press = useRef<{ x: number; y: number; dragged: boolean }>(undefined)
  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    press.current = { x: e.clientX, y: e.clientY, dragged: false }
  }
  function onPointerMove(e: React.PointerEvent) {
    const last = pointers.current.get(e.pointerId)
    if (!last || !press.current) return
    if (
      !press.current.dragged &&
      Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) < DRAG_THRESHOLD
    )
      return
    if (!press.current.dragged) {
      press.current.dragged = true
      viewport.current?.setPointerCapture(e.pointerId)
      setDragging(true)
    }
    const others = [...pointers.current].filter(([id]) => id !== e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    moved.current = true
    if (others.length === 1) {
      const other = others[0][1]
      const before = Math.hypot(last.x - other.x, last.y - other.y)
      const after = Math.hypot(e.clientX - other.x, e.clientY - other.y)
      const rect = viewport.current!.getBoundingClientRect()
      if (before > 0)
        zoom(after / before, {
          x: (e.clientX + other.x) / 2 - rect.left,
          y: (e.clientY + other.y) / 2 - rect.top,
        })
      return
    }
    setAnimate(false)
    const dx = e.clientX - last.x
    const dy = e.clientY - last.y
    setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }))
  }
  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size === 0) setDragging(false)
  }
  // A drag that ends on a node must not also click it.
  function onClickCapture(e: React.MouseEvent) {
    if (press.current?.dragged) e.stopPropagation()
    press.current = undefined
  }

  // Bring the focused node to the center, keeping the zoom.
  useEffect(() => {
    if (!ready || !focusNodeId) return
    const box = viewport.current
    const node = container.current?.querySelector<SVGGElement>(`g.node[id*="-${focusNodeId}-"]`)
    if (!box || !node) return
    const boxRect = box.getBoundingClientRect()
    const nodeRect = node.getBoundingClientRect()
    const dx = boxRect.left + boxRect.width / 2 - (nodeRect.left + nodeRect.width / 2)
    const dy = boxRect.top + boxRect.height / 2 - (nodeRect.top + nodeRect.height / 2)
    // Leave it alone if it's comfortably visible already.
    if (Math.abs(dx) < boxRect.width / 3 && Math.abs(dy) < boxRect.height / 3) return
    moved.current = true
    setAnimate(true)
    setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }))
  }, [focusNodeId, ready, chart])

  useEffect(() => {
    let cancelled = false
    async function render() {
      // Mermaid is large; only load it when a diagram is shown.
      const { default: mermaid } = await import("mermaid")
      const font = getComputedStyle(document.body).fontFamily
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "base",
        look: "neo",
        // Brand palette (docs/brand-guidelines.md). Measure labels in the font they
        // render in, or Mermaid clips them.
        themeVariables: {
          fontSize: "14px",
          fontFamily: font,
          primaryColor: "#f6f8f7",
          primaryBorderColor: "#c9d3ce",
          primaryTextColor: "#1a2620",
          lineColor: "#9aa59f",
          textColor: "#1a2620",
          edgeLabelBackground: "#edf1ef",
          clusterBkg: "#edf1ef",
          clusterBorder: "#dde4e0",
        },
        themeCSS: THEME_CSS,
        flowchart: {
          useMaxWidth: false,
          wrappingWidth: 260,
          nodeSpacing: 40,
          rankSpacing: 52,
          padding: 14,
          curve: "basis",
        },
      })
      const { svg } = await mermaid.render(`${baseId}-${++renders}`, chart)
      if (cancelled || !container.current) return
      container.current.innerHTML = svg
      const drawing = container.current.querySelector("svg")
      if (drawing) {
        // Natural size; the canvas transform does the scaling.
        const { width, height } = drawing.viewBox.baseVal
        drawing.setAttribute("width", String(width))
        drawing.setAttribute("height", String(height))
        drawing.style.maxWidth = "none"
      }
      // Fit before paint, or a new drawing flashes at full size.
      if (!moved.current) fit()
      for (const nodeId of Object.keys(clicks.current ?? {})) {
        // Mermaid ids look like "<renderId>-flowchart-<nodeId>-<n>".
        const node = container.current.querySelector<SVGGElement>(`g.node[id*="-${nodeId}-"]`)
        if (!node) continue
        node.classList.add("clickable")
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

  // A dot grid that moves with the drawing, so the canvas reads as draggable.
  const grid = 20 * view.scale
  return (
    <div
      className={cn("relative", className)}
      style={{
        backgroundImage: "radial-gradient(circle, #d3dcd7 1px, transparent 1.2px)",
        backgroundSize: `${grid}px ${grid}px`,
        backgroundPosition: `${view.x}px ${view.y}px`,
        transition: animate
          ? "background-position 300ms ease-out, background-size 300ms ease-out"
          : undefined,
      }}
    >
      <div
        ref={viewport}
        className={cn(
          "relative size-full touch-none overflow-hidden select-none",
          dragging ? "cursor-grabbing" : "cursor-grab",
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={onClickCapture}
        onDoubleClick={(e) => {
          if (!(e.target as Element).closest(".clickable")) refit()
        }}
      >
        {error && (
          <p className="p-4 text-sm text-destructive">Couldn't draw the diagram: {error}</p>
        )}
        {!ready && !error && <Skeleton className="h-64 w-full" />}
        <div
          ref={container}
          className={cn(
            "absolute top-0 left-0 origin-top-left",
            animate && "transition-transform duration-300 ease-out",
          )}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
        />
      </div>
      {ready && (
        <div className="absolute right-3 bottom-3 flex items-center gap-0.5 rounded-lg border bg-background/90 p-0.5 shadow-sm backdrop-blur">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom out"
            onClick={() => zoom(1 / 1.25, undefined, true)}
          >
            <Minus />
          </Button>
          <span className="w-11 text-center text-xs text-muted-foreground tabular-nums">
            {Math.round(view.scale * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom in"
            onClick={() => zoom(1.25, undefined, true)}
          >
            <Plus />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Fit to view" onClick={refit}>
            <Scan />
          </Button>
        </div>
      )}
    </div>
  )
}

/** Softer, rounder nodes on top of Mermaid's "neo" look; class colors come from the source. */
const THEME_CSS = `
  .node rect, .node polygon, .node path { stroke-width: 1.25px; }
  .node rect { rx: 10px; ry: 10px; }
  .node .label, .edgeLabel { font-weight: 450; }
  .edgeLabel, .edgeLabel rect { background-color: transparent; fill: transparent; }
  .edgeLabel p {
    padding: 2px 8px; border: 1px solid #dde4e0; border-radius: 999px;
    background-color: #f6f8f7; color: #66706b; font-size: 12px;
  }
  .flowchart-link { stroke-width: 1.5px; }
  .clickable { cursor: pointer; }
  .clickable > rect, .clickable > polygon, .clickable > path { transition: filter 150ms; }
  .clickable:hover > rect, .clickable:hover > polygon, .clickable:hover > path {
    filter: drop-shadow(0 3px 8px rgb(6 68 32 / 0.18));
  }
`

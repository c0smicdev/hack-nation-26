import { ChevronRight } from "lucide-react"
import { useEffect, useRef } from "react"

import { Badge } from "@/components/ui/badge"
import type { ID, LiveStep, SessionEvent } from "@/lib/api"
import { formatTimestamp, pluralize } from "@/lib/format"
import { cn } from "@/lib/utils"

import { EventFeed } from "./event-feed"

/**
 * "Your steps" while recording: one item per step, stamped with when it began
 * (time since recording started). Opening an item shows the session events from
 * that step until the next one: what Socrates saw, asked and heard.
 */
export function LiveStepList({
  steps,
  events,
  openId,
  onToggle,
}: {
  steps: LiveStep[]
  events: SessionEvent[]
  openId?: ID
  onToggle: (id: ID) => void
}) {
  const openRef = useRef<HTMLLIElement>(null)
  useEffect(() => {
    openRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [openId])

  const before = steps.length ? events.filter((e) => e.at < steps[0].at) : events

  return (
    <ol className="divide-y">
      {before.length > 0 && (
        <li className="px-4 py-3">
          <p className="pb-2 text-xs font-medium text-muted-foreground">Getting started</p>
          <EventFeed events={before} order="oldest" />
        </li>
      )}
      {!steps.length && (
        <li className="px-4 py-6 text-sm text-muted-foreground">
          Start working. Your steps appear here as Socrates understands them.
        </li>
      )}
      {steps.map((step, i) => {
        const open = step.id === openId
        const current = i === steps.length - 1
        const end = steps[i + 1]?.at ?? Infinity
        const own = events.filter((e) => e.at >= step.at && e.at < end)
        return (
          <li key={step.id} ref={open ? openRef : undefined}>
            <button
              type="button"
              onClick={() => onToggle(step.id)}
              aria-expanded={open}
              className={cn(
                "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50",
                open && "bg-muted/50",
              )}
            >
              <span className="w-11 shrink-0 pt-0.5 font-mono text-xs text-muted-foreground tabular-nums">
                {formatTimestamp(step.at)}
              </span>
              <span className="min-w-0 flex-1 space-y-1">
                <span className="flex items-center gap-2 text-sm font-medium">
                  {current && (
                    <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-primary" />
                  )}
                  <span className="min-w-0">{step.title}</span>
                </span>
                <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {step.kind === "judgment" && <Badge variant="secondary">Decision</Badge>}
                  {step.deviation && <Badge variant="destructive">Differs from memory</Badge>}
                  {pluralize(own.length, "event")}
                </span>
              </span>
              <ChevronRight
                className={cn(
                  "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
                  open && "rotate-90",
                )}
              />
            </button>
            {open && (
              <div className="space-y-3 bg-muted/30 px-4 pt-1 pb-4">
                {step.decision !== step.title && (
                  <p className="pl-[3.75rem] text-sm">{step.decision}</p>
                )}
                <EventFeed events={own} order="oldest" />
                {step.screenshotUrl && (
                  <img
                    src={step.screenshotUrl}
                    alt={`Screen during: ${step.title}`}
                    className="w-full rounded-md border"
                  />
                )}
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

import { ChevronRight, Eye, MessageSquareQuote } from "lucide-react"
import { useEffect, useRef } from "react"

import { Badge } from "@/components/ui/badge"
import type { ID, LiveStep } from "@/lib/api"
import { formatTimestamp, pluralize } from "@/lib/format"
import { cn } from "@/lib/utils"

/**
 * "Your steps" while recording: one item per subtask, stamped with when it began
 * (time since recording started). Opening an item shows everything Socrates has
 * gathered about it so far; the list grows as the expert keeps working.
 */
export function LiveStepList({
  steps,
  openId,
  onToggle,
}: {
  steps: LiveStep[]
  openId?: ID
  onToggle: (id: ID) => void
}) {
  const openRef = useRef<HTMLLIElement>(null)
  useEffect(() => {
    openRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [openId])

  if (!steps.length) {
    return (
      <p className="px-4 py-6 text-sm text-muted-foreground">
        Start working. Socrates groups what you do into steps here.
      </p>
    )
  }

  return (
    <ol className="divide-y">
      {steps.map((step, i) => {
        const open = step.id === openId
        const current = i === steps.length - 1
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
                  {pluralize(step.notes.length, "observation")}
                </span>
              </span>
              <ChevronRight
                className={cn(
                  "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
                  open && "rotate-90",
                )}
              />
            </button>
            {open && <StepDetail step={step} />}
          </li>
        )
      })}
    </ol>
  )
}

function StepDetail({ step }: { step: LiveStep }) {
  return (
    <div className="space-y-3 bg-muted/30 px-4 pt-1 pb-4 pl-[4.75rem] text-sm">
      {step.decision !== step.title && <p>{step.decision}</p>}
      <ul className="space-y-2">
        {step.notes.map((note, i) => (
          <li key={i} className="flex gap-2">
            {note.source === "said" ? (
              <MessageSquareQuote className="mt-0.5 size-3.5 shrink-0 text-primary" />
            ) : (
              <Eye className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0 flex-1">
              <span className={cn(note.source === "said" && "italic")}>{note.text}</span>
              <span className="ml-2 font-mono text-xs text-muted-foreground tabular-nums">
                {formatTimestamp(note.at)}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {step.screenshotUrl && (
        <img
          src={step.screenshotUrl}
          alt={`Screen during: ${step.title}`}
          className="w-full rounded-md border"
        />
      )}
    </div>
  )
}

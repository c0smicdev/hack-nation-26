import { ShieldAlert } from "lucide-react"

import type { ID, WorkMapStep } from "@/lib/api"
import { cn } from "@/lib/utils"

import { JUDGMENT_CLASS } from "../labels"

/** Clickable list of steps. Judgment calls get an amber marker. */
export function StepTimeline({
  steps,
  activeId,
  onSelect,
}: {
  steps: WorkMapStep[]
  activeId: ID
  onSelect: (id: ID) => void
}) {
  return (
    <ol className="relative space-y-1">
      <div className="absolute top-4 bottom-4 left-[1.1rem] w-px bg-border" aria-hidden />
      {steps.map((step, i) => {
        const active = step.id === activeId
        return (
          <li key={step.id} className="relative">
            <button
              type="button"
              onClick={() => onSelect(step.id)}
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg p-1.5 text-left transition-colors hover:bg-muted",
                active && "bg-muted",
              )}
            >
              <span
                className={cn(
                  "z-10 flex size-6 shrink-0 items-center justify-center rounded-full border bg-background text-xs font-medium",
                  step.kind === "judgment" && cn(JUDGMENT_CLASS, "border-transparent"),
                  active &&
                    step.kind === "routine" &&
                    "border-primary bg-primary text-primary-foreground",
                  active && "ring-2 ring-ring/40 ring-offset-1 ring-offset-background",
                )}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 pt-0.5">
                <span className={cn("block text-sm leading-snug", active && "font-medium")}>
                  {step.title}
                </span>
                {(step.kind === "judgment" || step.guardrails.length > 0) && (
                  <span className="mt-1 flex gap-2 text-xs text-muted-foreground">
                    {step.kind === "judgment" && <span>Judgment call</span>}
                    {step.guardrails.length > 0 && (
                      <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400">
                        <ShieldAlert className="size-3" />
                        {step.guardrails.length}
                      </span>
                    )}
                  </span>
                )}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

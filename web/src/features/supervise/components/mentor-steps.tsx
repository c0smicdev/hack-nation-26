import {
  Ban,
  CheckCircle2,
  ChevronRight,
  Gauge,
  Hand,
  type LucideIcon,
  ShieldAlert,
} from "lucide-react"
import { useEffect, useRef } from "react"

import { ScreenMomentView } from "@/components/screen-moment-view"
import { Badge } from "@/components/ui/badge"
import type { GuardrailKind, ID, Quote, WorkMap } from "@/lib/api"
import { cn } from "@/lib/utils"

const GUARDRAIL: Record<GuardrailKind, { label: string; icon: LucideIcon }> = {
  limit: { label: "Limit", icon: Gauge },
  stop_and_ask: { label: "Stop & ask", icon: Hand },
  never: { label: "Never", icon: Ban },
}

export function ExpertQuote({ quote }: { quote: Quote }) {
  return (
    <blockquote className="border-l-2 border-primary pl-3 text-sm leading-relaxed">
      “{quote.text}”
      <footer className="mt-1 text-xs text-muted-foreground">— {quote.speaker.name}</footer>
    </blockquote>
  )
}

/**
 * "What the mentor did": the expert's steps in order, each with their decision,
 * reason, guardrails and screen moment. Marks where the learner is.
 */
export function MentorSteps({
  map,
  currentStepId,
  completed,
  flagged,
  openId,
  onToggle,
}: {
  map: WorkMap
  currentStepId?: ID
  completed: ID[]
  flagged: ID[]
  openId?: ID
  onToggle: (id: ID) => void
}) {
  const openRef = useRef<HTMLLIElement>(null)
  useEffect(() => {
    openRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [openId])
  const expertFirst = map.expert.name.split(" ")[0]

  return (
    <ol className="divide-y">
      {map.steps.map((step, i) => {
        const open = step.id === openId
        const here = step.id === currentStepId
        const done = completed.includes(step.id)
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
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular-nums",
                  here && "border-blue-600 bg-blue-600 text-white",
                  !here && done && "border-emerald-600 text-emerald-600",
                )}
              >
                {done && !here ? <CheckCircle2 className="size-4" /> : i + 1}
              </span>
              <span className="min-w-0 flex-1 space-y-1">
                <span className="block text-sm font-medium">{step.title}</span>
                <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {here && <Badge className="bg-blue-600 text-white">You're here</Badge>}
                  {step.kind === "judgment" && <Badge variant="secondary">Decision</Badge>}
                  {flagged.includes(step.id) && (
                    <Badge variant="outline" className="border-amber-500 text-amber-700">
                      Heads-up given
                    </Badge>
                  )}
                  {step.guardrails.length > 0 && (
                    <span className="flex items-center gap-1">
                      <ShieldAlert className="size-3" /> {step.guardrails.length}
                    </span>
                  )}
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
              <div className="space-y-4 bg-muted/30 px-4 pt-1 pb-4 text-sm">
                <p>
                  <span className="text-muted-foreground">What {expertFirst} did: </span>
                  {step.decision}
                </p>
                {step.reason && <ExpertQuote quote={step.reason} />}
                {step.guardrails.length > 0 && (
                  <ul className="space-y-2">
                    {step.guardrails.map((g) => {
                      const { label, icon: Icon } = GUARDRAIL[g.kind]
                      return (
                        <li
                          key={g.id}
                          className="flex items-start gap-2 rounded-md border border-rose-500/20 bg-rose-500/5 p-2"
                        >
                          <Icon className="mt-0.5 size-4 shrink-0 text-rose-600" />
                          <span>
                            {g.rule}
                            <span className="block text-xs text-muted-foreground">
                              {label}
                              {g.escalateTo && <> · Ask: {g.escalateTo}</>}
                            </span>
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
                {step.edgeCases.length > 0 && (
                  <ul className="space-y-1">
                    {step.edgeCases.map((e) => (
                      <li key={e.id} className="text-muted-foreground">
                        <span className="text-foreground">If</span> {e.when}{" "}
                        <span className="text-foreground">→</span> {e.then}
                      </li>
                    ))}
                  </ul>
                )}
                <ScreenMomentView moment={step.screen} />
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

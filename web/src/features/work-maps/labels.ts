import { Ban, Gauge, Hand, type LucideIcon } from "lucide-react"

import type { GuardrailKind, QuoteSource, WorkMapStatus } from "@/lib/api"

/** Single source of truth for how domain enums look in the UI. */

export const STATUS: Record<WorkMapStatus, { label: string; className: string }> = {
  confirmed: {
    label: "Confirmed by expert",
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  in_debrief: {
    label: "In debrief",
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
}

export const GUARDRAIL: Record<GuardrailKind, { label: string; icon: LucideIcon }> = {
  limit: { label: "Limit", icon: Gauge },
  stop_and_ask: { label: "Stop & ask", icon: Hand },
  never: { label: "Never", icon: Ban },
}

export const QUOTE_SOURCE: Record<QuoteSource, string> = {
  narration: "while working",
  live_question: "answering a live question",
  debrief: "in the debrief",
}

/** Accent for judgment calls — keep in sync across timeline, cards and detail. */
export const JUDGMENT_CLASS = "bg-amber-500 text-white"

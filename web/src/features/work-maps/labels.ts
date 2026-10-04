import { Ban, Gauge, Hand, type LucideIcon } from "lucide-react"

import type { GuardrailKind, QuoteSource, WorkMapStatus } from "@/lib/api"
import { i18n } from "@/lib/i18n"

/** Single source of truth for how domain enums look in the UI. */

export const STATUS: Record<WorkMapStatus, { className: string }> = {
  confirmed: { className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  in_debrief: { className: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  draft: { className: "bg-muted text-muted-foreground" },
}

/** Translated at call time, so it follows the UI language. */
export const statusLabel = (status: WorkMapStatus) => i18n.t(`workMaps:status.${status}`)

export const GUARDRAIL: Record<GuardrailKind, { icon: LucideIcon }> = {
  limit: { icon: Gauge },
  stop_and_ask: { icon: Hand },
  never: { icon: Ban },
}

export const guardrailLabel = (kind: GuardrailKind) => i18n.t(`workMaps:guardrail.${kind}`)

export const quoteSourceLabel = (source: QuoteSource) => i18n.t(`workMaps:quoteSource.${source}`)

/** Accent for judgment calls — keep in sync across timeline, cards and detail. */
export const JUDGMENT_CLASS = "bg-amber-500 text-white"

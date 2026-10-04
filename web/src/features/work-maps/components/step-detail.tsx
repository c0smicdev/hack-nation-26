import { ArrowLeft, ArrowRight, GitBranch, ShieldAlert } from "lucide-react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { Guardrail, WorkMapStep } from "@/lib/api"

import { GUARDRAIL, guardrailLabel, JUDGMENT_CLASS } from "../labels"
import { QuoteBlock } from "./quote-block"
import { ScreenMomentView } from "@/components/screen-moment-view"

function Section({
  title,
  icon,
  children,
}: {
  title: string
  icon?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  )
}

function GuardrailItem({ guardrail }: { guardrail: Guardrail }) {
  const { t } = useTranslation("workMaps")
  const { icon: Icon } = GUARDRAIL[guardrail.kind]
  return (
    <li className="space-y-3 rounded-lg border border-rose-500/20 bg-rose-500/5 p-4">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-4 shrink-0 text-rose-600 dark:text-rose-400" />
        <div className="space-y-1">
          <p className="font-medium">{guardrail.rule}</p>
          <p className="text-xs text-muted-foreground">
            {guardrailLabel(guardrail.kind)}
            {guardrail.escalateTo && t("stepDetail.escalateTo", { who: guardrail.escalateTo })}
          </p>
        </div>
      </div>
      {guardrail.quote && <QuoteBlock quote={guardrail.quote} className="pl-7" />}
    </li>
  )
}

export function StepDetail({
  step,
  index,
  total,
  onPrev,
  onNext,
}: {
  step: WorkMapStep
  index: number
  total: number
  onPrev?: () => void
  onNext?: () => void
}) {
  const { t } = useTranslation("workMaps")
  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {t("stepDetail.position", { index: index + 1, total })}
          {step.kind === "judgment" && (
            <Badge className={JUDGMENT_CLASS}>{t("judgmentCall")}</Badge>
          )}
        </div>
        <h2 className="text-xl font-semibold tracking-tight">{step.title}</h2>
      </header>

      <ScreenMomentView moment={step.screen} />

      <div className="grid gap-6 md:grid-cols-2">
        <Section title={t("stepDetail.decision")}>
          <p className="text-base">{step.decision}</p>
        </Section>
        {step.reason && (
          <Section title={t("stepDetail.why")}>
            <QuoteBlock quote={step.reason} />
          </Section>
        )}
      </div>

      {step.guardrails.length > 0 && (
        <Section title={t("stepDetail.guardrails")} icon={<ShieldAlert className="size-3.5" />}>
          <ul className="space-y-2">
            {step.guardrails.map((g) => (
              <GuardrailItem key={g.id} guardrail={g} />
            ))}
          </ul>
        </Section>
      )}

      {step.edgeCases.length > 0 && (
        <Section title={t("stepDetail.edgeCases")} icon={<GitBranch className="size-3.5" />}>
          <ul className="space-y-2">
            {step.edgeCases.map((e) => (
              <li key={e.id} className="space-y-3 rounded-lg border p-4">
                <p>
                  <span className="text-muted-foreground">{t("stepDetail.if")}</span>{" "}
                  {e.when.charAt(0).toLowerCase() + e.when.slice(1)}{" "}
                  <span className="text-muted-foreground">→</span> {e.then}
                </p>
                {e.quote && <QuoteBlock quote={e.quote} />}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <footer className="flex justify-between border-t pt-4">
        <Button variant="ghost" size="sm" onClick={onPrev} disabled={!onPrev}>
          <ArrowLeft /> {t("stepDetail.previous")}
        </Button>
        <Button variant="ghost" size="sm" onClick={onNext} disabled={!onNext}>
          {t("stepDetail.next")} <ArrowRight />
        </Button>
      </footer>
    </article>
  )
}

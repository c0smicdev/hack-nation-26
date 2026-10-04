import { CircleCheck, CircleDashed, CircleHelp } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { ID, WorkMap } from "@/lib/api"

import { STATUS } from "../labels"
import { QuoteBlock } from "./quote-block"

/** What the apprentice asked after the task, and the expert-confirmed teach-back. */
export function DebriefSection({
  workMap,
  onSelectStep,
}: {
  workMap: WorkMap
  onSelectStep: (id: ID) => void
}) {
  const { t } = useTranslation("workMaps")
  const { debrief, teachBack, steps } = workMap
  const stepNumber = (id: ID) => steps.findIndex((s) => s.id === id) + 1

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{t("debrief.title")}</CardTitle>
          <CardDescription>{t("debrief.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {debrief.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("debrief.notStarted")}</p>
          ) : (
            <ul className="space-y-5">
              {debrief.map((item) => (
                <li key={item.id} className="space-y-2">
                  <div className="flex items-start gap-2">
                    {item.resolved ? (
                      <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                    ) : (
                      <CircleHelp className="mt-0.5 size-4 shrink-0 text-amber-600" />
                    )}
                    <p className="font-medium">{item.question}</p>
                  </div>
                  <div className="pl-6">
                    {item.answer ? (
                      <QuoteBlock quote={item.answer} />
                    ) : (
                      <p className="text-sm text-muted-foreground">{t("debrief.stillOpen")}</p>
                    )}
                    {item.stepId && (
                      <button
                        type="button"
                        onClick={() => onSelectStep(item.stepId!)}
                        className="mt-2 text-xs text-muted-foreground underline-offset-4 hover:underline"
                      >
                        {t("debrief.goToStep", { number: stepNumber(item.stepId) })}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {t("debrief.teachBack")}
            {teachBack?.confirmed && (
              <Badge className={STATUS.confirmed.className}>
                <CircleCheck /> {t("debrief.confirmed")}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>{t("debrief.teachBackDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {teachBack ? (
            <>
              <p className="leading-relaxed">{teachBack.summary}</p>
              {teachBack.corrections.map((c, i) => (
                <div key={i} className="space-y-2">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {t("debrief.correction")}
                  </p>
                  <QuoteBlock quote={c} />
                </div>
              ))}
            </>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CircleDashed className="size-4" /> {t("debrief.teachBackPending")}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

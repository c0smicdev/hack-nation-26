import { CircleHelp, Footprints, Scale, ShieldAlert } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router"

import { paths } from "@/app/paths"
import { Card } from "@/components/ui/card"
import type { WorkMapSummary } from "@/lib/api"
import { formatRelative } from "@/lib/format"

import { Expert } from "./expert"
import { ScreenMomentView } from "@/components/screen-moment-view"
import { StatusBadge } from "./status-badge"

export function WorkMapCard({ workMap }: { workMap: WorkMapSummary }) {
  const { t } = useTranslation("workMaps")
  return (
    <Link
      to={paths.workMap(workMap.id)}
      className="group block rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <Card className="h-full gap-0 overflow-hidden py-0 transition-shadow group-hover:shadow-md">
        <div className="relative aspect-[16/8] overflow-hidden border-b bg-muted">
          {workMap.cover && (
            <ScreenMomentView moment={workMap.cover} compact className="rounded-none border-0" />
          )}
          <StatusBadge
            status={workMap.status}
            className="absolute top-3 left-3 bg-background/95 shadow-sm"
          />
        </div>
        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{workMap.domain}</p>
            <h3 className="leading-snug font-semibold">{workMap.title}</h3>
            <p className="line-clamp-2 text-sm text-muted-foreground">{workMap.summary}</p>
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <li className="flex items-center gap-1">
              <Footprints className="size-3.5" /> {t("counts.steps", { count: workMap.stepCount })}
            </li>
            <li className="flex items-center gap-1">
              <Scale className="size-3.5" />{" "}
              {t("counts.judgmentCalls", { count: workMap.judgmentCount })}
            </li>
            <li className="flex items-center gap-1">
              <ShieldAlert className="size-3.5" />{" "}
              {t("counts.guardrails", { count: workMap.guardrailCount })}
            </li>
            {workMap.openQuestionCount > 0 && (
              <li className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
                <CircleHelp className="size-3.5" />{" "}
                {t("counts.openQuestions", { count: workMap.openQuestionCount })}
              </li>
            )}
          </ul>
          <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3">
            <Expert person={workMap.expert} />
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatRelative(workMap.updatedAt)}
            </span>
          </div>
        </div>
      </Card>
    </Link>
  )
}

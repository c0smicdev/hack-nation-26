import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import type { WorkMapStatus } from "@/lib/api"
import { cn } from "@/lib/utils"

import { STATUS } from "../labels"

export function StatusBadge({ status, className }: { status: WorkMapStatus; className?: string }) {
  const { t } = useTranslation("workMaps")
  return <Badge className={cn(STATUS[status].className, className)}>{t(`status.${status}`)}</Badge>
}

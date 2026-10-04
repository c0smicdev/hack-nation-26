import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import type { SessionStatus } from "@/lib/api"

const LABEL_KEY: Record<SessionStatus, string> = {
  intake: "sessionStatus.intake",
  live: "sessionStatus.live",
  processing: "sessionStatus.processing",
  awaiting_debrief: "sessionStatus.awaitingDebrief",
  mapped: "sessionStatus.mapped",
}

export function SessionStatusBadge({ status }: { status: SessionStatus }) {
  const { t } = useTranslation("capture")
  return (
    <Badge
      variant={
        status === "live" || status === "intake"
          ? "destructive"
          : status === "mapped"
            ? "secondary"
            : "outline"
      }
    >
      {t(LABEL_KEY[status])}
    </Badge>
  )
}

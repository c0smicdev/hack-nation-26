import { Badge } from "@/components/ui/badge"
import type { SessionStatus } from "@/lib/api"

const LABEL: Record<SessionStatus, string> = {
  live: "Live",
  processing: "Building map",
  awaiting_debrief: "Awaiting debrief",
  mapped: "Mapped",
}

export function SessionStatusBadge({ status }: { status: SessionStatus }) {
  return (
    <Badge
      variant={status === "live" ? "destructive" : status === "mapped" ? "secondary" : "outline"}
    >
      {LABEL[status]}
    </Badge>
  )
}

import { Badge } from "@/components/ui/badge"
import type { WorkMapStatus } from "@/lib/api"
import { cn } from "@/lib/utils"

import { STATUS } from "../labels"

export function StatusBadge({ status, className }: { status: WorkMapStatus; className?: string }) {
  const { label, className: tone } = STATUS[status]
  return <Badge className={cn(tone, className)}>{label}</Badge>
}

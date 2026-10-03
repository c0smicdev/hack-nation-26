import { cn } from "@/lib/utils"
import type { CaptureStatus } from "@/lib/api"

import { captureState } from "../capture-state"

export function CaptureDot({
  status,
  className,
}: {
  status: CaptureStatus | undefined
  className?: string
}) {
  const { tone } = captureState(status)
  return (
    <span className={cn("relative flex size-2.5 shrink-0", className)}>
      {tone === "live" && (
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-60" />
      )}
      <span
        className={cn(
          "relative inline-flex size-2.5 rounded-full",
          tone === "live" && "bg-red-500",
          tone === "paused" && "bg-amber-500",
          tone === "offline" && "bg-muted-foreground/40",
        )}
      />
    </span>
  )
}

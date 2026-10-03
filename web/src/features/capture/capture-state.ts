import type { CaptureStatus } from "@/lib/api"

export function captureState(status: CaptureStatus | undefined) {
  if (!status?.active) return { label: "Not capturing", tone: "offline" } as const
  if (status.offTheRecord) return { label: "Off the record", tone: "paused" } as const
  return { label: "Capturing", tone: "live" } as const
}

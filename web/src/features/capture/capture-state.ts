import type { CaptureStatus } from "@/lib/api"

export function captureState(status: CaptureStatus | undefined) {
  if (!status?.extensionConnected) return { label: "Extension offline", tone: "offline" } as const
  if (status.offTheRecord) return { label: "Off the record", tone: "paused" } as const
  return { label: "Capturing", tone: "live" } as const
}

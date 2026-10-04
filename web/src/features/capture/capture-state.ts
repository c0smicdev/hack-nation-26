import type { CaptureStatus } from "@/lib/api"
import { i18n } from "@/lib/i18n"

/** Translated at call time, so the label follows the UI language. */
export function captureState(status: CaptureStatus | undefined) {
  if (!status?.active)
    return { label: i18n.t("capture:captureState.notCapturing"), tone: "offline" } as const
  if (status.offTheRecord)
    return { label: i18n.t("capture:captureState.offTheRecord"), tone: "paused" } as const
  return { label: i18n.t("capture:captureState.capturing"), tone: "live" } as const
}

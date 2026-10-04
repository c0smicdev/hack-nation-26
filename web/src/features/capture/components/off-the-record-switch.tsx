import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { usePrivacyPause } from "@/lib/privacy/lifecycle"

import { useCaptureStatus, useSetOffTheRecord } from "../hooks"

/** Lets the expert pause capture — answers the brief's "Trust" question. */
export function OffTheRecordSwitch({ id = "off-the-record" }: { id?: string }) {
  const { data: status } = useCaptureStatus()
  const setOffTheRecord = useSetOffTheRecord()
  const locallyPaused = usePrivacyPause(status?.liveSessionId ?? "")
  const checked = setOffTheRecord.isPending
    ? (setOffTheRecord.variables ?? false)
    : locallyPaused || !!status?.offTheRecord

  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id} className="text-sm font-normal">
        Off the record
      </Label>
      <Switch
        id={id}
        checked={checked}
        disabled={!status?.active || setOffTheRecord.isPending}
        onCheckedChange={(value) => setOffTheRecord.mutate(value)}
      />
    </div>
  )
}

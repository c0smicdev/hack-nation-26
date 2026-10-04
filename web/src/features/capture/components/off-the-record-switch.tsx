import { useTranslation } from "react-i18next"

import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

import { useCaptureStatus, useSetOffTheRecord } from "../hooks"

/** Lets the expert pause capture — answers the brief's "Trust" question. */
export function OffTheRecordSwitch({ id = "off-the-record" }: { id?: string }) {
  const { t } = useTranslation("capture")
  const { data: status } = useCaptureStatus()
  const setOffTheRecord = useSetOffTheRecord()
  const checked = setOffTheRecord.isPending
    ? (setOffTheRecord.variables ?? false)
    : (status?.offTheRecord ?? false)

  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id} className="text-sm font-normal">
        {t("offTheRecordSwitch.label")}
      </Label>
      <Switch
        id={id}
        checked={checked}
        disabled={!status?.active}
        onCheckedChange={(value) => setOffTheRecord.mutate(value)}
      />
    </div>
  )
}

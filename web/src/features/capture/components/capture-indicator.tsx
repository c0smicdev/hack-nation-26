import { Link } from "react-router"

import { paths } from "@/app/paths"

import { useCaptureStatus } from "../hooks"
import { CaptureDot } from "./capture-dot"
import { captureState } from "../capture-state"
import { OffTheRecordSwitch } from "./off-the-record-switch"

/** Compact capture status for the sidebar footer. */
export function CaptureIndicator() {
  const { data: status } = useCaptureStatus()
  const { label } = captureState(status)

  return (
    <div className="space-y-3 rounded-lg border bg-background p-3 group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-2">
      <Link
        to={paths.capture()}
        className="flex items-center gap-2 text-sm font-medium"
        title={label}
      >
        <CaptureDot status={status} />
        <span className="group-data-[collapsible=icon]:hidden">{label}</span>
      </Link>
      <div className="group-data-[collapsible=icon]:hidden">
        <OffTheRecordSwitch id="sidebar-off-the-record" />
      </div>
    </div>
  )
}

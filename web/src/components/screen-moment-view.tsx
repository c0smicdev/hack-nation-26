import { Lock } from "lucide-react"
import { useTranslation } from "react-i18next"

import type { Rect, ScreenMoment } from "@/lib/api"
import { formatTimestamp } from "@/lib/format"
import { cn } from "@/lib/utils"

const toStyle = (r: Rect, pad = 0) => ({
  left: `${(r.x - pad) * 100}%`,
  top: `${(r.y - pad) * 100}%`,
  width: `${(r.width + pad * 2) * 100}%`,
  height: `${(r.height + pad * 2) * 100}%`,
})

/**
 * A screenshot with the step's focus area spotlighted and personal data covered.
 * Screenshots should already be redacted server-side — the overlays are a
 * second line of defence, not the only one.
 */
export function ScreenMomentView({
  moment,
  compact = false,
  className,
}: {
  moment: ScreenMoment
  /** Thumbnail mode: no spotlight, no caption. */
  compact?: boolean
  className?: string
}) {
  const { t } = useTranslation("common")
  return (
    <figure className={cn("overflow-hidden rounded-xl border bg-muted", className)}>
      <div className="relative overflow-hidden">
        <img
          src={moment.screenshotUrl}
          alt={moment.caption}
          className="block h-auto w-full select-none"
          draggable={false}
        />
        {moment.redactions?.map((r, i) => (
          <div
            key={i}
            className="absolute flex items-center justify-center gap-1 rounded-sm bg-neutral-900 text-[0.6rem] font-medium tracking-wide text-neutral-400 uppercase"
            style={toStyle(r, 0.003)}
          >
            {!compact && (
              <>
                <Lock className="size-3" /> {t("screenMoment.redacted")}
              </>
            )}
          </div>
        ))}
        {!compact && moment.focus && (
          <div
            className="pointer-events-none absolute rounded-md shadow-[0_0_0_9999px_rgb(0_0_0/0.35)] ring-2 ring-amber-400"
            style={toStyle(moment.focus, 0.008)}
          />
        )}
      </div>
      {!compact && (
        <figcaption className="flex items-center gap-2 border-t bg-background px-3 py-2 text-sm text-muted-foreground">
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground tabular-nums">
            {formatTimestamp(moment.at)}
          </span>
          {moment.caption}
        </figcaption>
      )}
    </figure>
  )
}

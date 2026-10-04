import { EyeOff, MessageCircleQuestion, Mic, Monitor } from "lucide-react"
import { useTranslation } from "react-i18next"

import type { SessionEvent, SessionEventKind } from "@/lib/api"
import { formatTimestamp } from "@/lib/format"
import { cn } from "@/lib/utils"

const KIND: Record<
  SessionEventKind,
  { icon: typeof Monitor; labelKey: string; className: string }
> = {
  screen: { icon: Monitor, labelKey: "eventKind.screen", className: "text-muted-foreground" },
  speech: { icon: Mic, labelKey: "eventKind.speech", className: "text-foreground" },
  question: {
    icon: MessageCircleQuestion,
    labelKey: "eventKind.question",
    className: "text-primary font-medium",
  },
  off_record: {
    icon: EyeOff,
    labelKey: "eventKind.offRecord",
    className: "text-amber-700 dark:text-amber-400",
  },
}

/** What the extension + vision model produced; newest first unless `order="oldest"`. */
export function EventFeed({
  events,
  order = "newest",
}: {
  events: SessionEvent[]
  order?: "newest" | "oldest"
}) {
  const { t } = useTranslation("capture")
  return (
    <ol className="space-y-1">
      {(order === "newest" ? [...events].reverse() : events).map((event) => {
        const { icon: Icon, labelKey, className } = KIND[event.kind]
        return (
          <li
            key={event.id}
            className={cn(
              "flex gap-3 rounded-md px-2 py-1.5 text-sm",
              event.kind === "question" && "bg-primary/5",
            )}
          >
            <span className="w-11 shrink-0 pt-px font-mono text-xs text-muted-foreground tabular-nums">
              {formatTimestamp(event.at)}
            </span>
            <Icon className={cn("mt-0.5 size-4 shrink-0", className)} aria-label={t(labelKey)} />
            <span className={cn(className, event.important && "font-medium text-foreground")}>
              {event.text}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

import { EyeOff, MessageCircleQuestion, Mic, Monitor } from "lucide-react"

import type { SessionEvent, SessionEventKind } from "@/lib/api"
import { formatTimestamp } from "@/lib/format"
import { cn } from "@/lib/utils"

const KIND: Record<SessionEventKind, { icon: typeof Monitor; label: string; className: string }> = {
  screen: { icon: Monitor, label: "Screen", className: "text-muted-foreground" },
  speech: { icon: Mic, label: "Expert", className: "text-foreground" },
  question: {
    icon: MessageCircleQuestion,
    label: "Socrates asked",
    className: "text-primary font-medium",
  },
  off_record: { icon: EyeOff, label: "Privacy", className: "text-amber-700 dark:text-amber-400" },
}

/** Newest-first list of what the extension + vision model produced. */
export function EventFeed({ events }: { events: SessionEvent[] }) {
  return (
    <ol className="space-y-1">
      {[...events].reverse().map((event) => {
        const { icon: Icon, label, className } = KIND[event.kind]
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
            <Icon className={cn("mt-0.5 size-4 shrink-0", className)} aria-label={label} />
            <span className={className}>{event.text}</span>
          </li>
        )
      })}
    </ol>
  )
}

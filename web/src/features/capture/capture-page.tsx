import { Check, ChevronRight, ShieldCheck, X } from "lucide-react"
import { Link } from "react-router"

import { paths } from "@/app/paths"
import { PageHeader } from "@/components/page-header"
import { EmptyState, ErrorState } from "@/components/query-state"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { CaptureStatus } from "@/lib/api"
import { formatDuration, formatRelative, formatTimestamp, pluralize } from "@/lib/format"

import { CaptureDot } from "./components/capture-dot"
import { captureState } from "./capture-state"
import { EventFeed } from "./components/event-feed"
import { OffTheRecordSwitch } from "./components/off-the-record-switch"
import { SessionStatusBadge } from "./components/session-status-badge"
import { useCaptureStatus, useSessionEvents, useSessions } from "./hooks"

export function CapturePage() {
  const { data: status } = useCaptureStatus()
  const sessions = useSessions()
  const live = sessions.data?.find((s) => s.id === status?.liveSessionId)
  const events = useSessionEvents(live?.id, { live: true })

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Capture"
        description="The browser extension streams screen, microphone and keystrokes. Socrates turns them into events and asks why at natural pauses."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CaptureDot status={status} />
              {live ? live.title : "No live session"}
            </CardTitle>
            {live && (
              <CardDescription>
                {live.expert.name} · {formatTimestamp(live.durationSec)} elapsed ·{" "}
                {pluralize(live.questionsAsked, "question")} asked
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="max-h-[28rem] overflow-y-auto">
            {!live ? (
              <EmptyState title="Waiting for the extension">
                Start working and capture begins automatically.
              </EmptyState>
            ) : events.data ? (
              <EventFeed events={events.data} />
            ) : (
              <Skeleton className="h-40" />
            )}
          </CardContent>
        </Card>

        <ExtensionCard status={status} />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Sessions</h2>
        {sessions.isError ? (
          <ErrorState error={sessions.error} retry={sessions.refetch} />
        ) : !sessions.data ? (
          <Skeleton className="h-48" />
        ) : (
          <Card className="py-0">
            <ul className="divide-y">
              {sessions.data.map((session) => {
                const row = (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{session.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {session.expert.name} · {formatRelative(session.startedAt)} ·{" "}
                        {formatDuration(session.durationSec)} · {session.eventCount} events
                      </p>
                    </div>
                    <SessionStatusBadge status={session.status} />
                    {session.workMapId && <ChevronRight className="size-4 text-muted-foreground" />}
                  </>
                )
                return (
                  <li key={session.id}>
                    {session.workMapId ? (
                      <Link
                        to={paths.workMap(session.workMapId)}
                        className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/50"
                      >
                        {row}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-4 px-4 py-3">{row}</div>
                    )}
                  </li>
                )
              })}
            </ul>
          </Card>
        )}
      </section>
    </div>
  )
}

function ExtensionCard({ status }: { status: CaptureStatus | undefined }) {
  const signals = [
    { label: "Screen", on: status?.signals.screen },
    { label: "Microphone", on: status?.signals.microphone },
    { label: "Keystrokes", on: status?.signals.keystrokes },
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle>Browser extension</CardTitle>
        <CardDescription>{captureState(status).label}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <ul className="space-y-2 text-sm">
          {signals.map(({ label, on }) => (
            <li key={label} className="flex items-center justify-between">
              {label}
              {on && !status?.offTheRecord ? (
                <Check className="size-4 text-emerald-600" />
              ) : (
                <X className="size-4 text-muted-foreground" />
              )}
            </li>
          ))}
        </ul>
        <OffTheRecordSwitch />
        <p className="flex gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 shrink-0" />
          Personal data (names, IBANs, emails) is redacted before frames are stored. Nothing is
          captured while off the record.
        </p>
      </CardContent>
    </Card>
  )
}

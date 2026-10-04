import { ChevronRight, ExternalLink, Loader2, Radio, ShieldCheck } from "lucide-react"
import { type FormEvent, useState } from "react"
import { Link, useNavigate } from "react-router"

import { paths } from "@/app/paths"
import { PageHeader } from "@/components/page-header"
import { ErrorState } from "@/components/query-state"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import type { CaptureSession, NewSession } from "@/lib/api"
import { useMe } from "@/lib/auth/hooks"
import { formatDuration, formatRelative } from "@/lib/format"

import { SessionStatusBadge } from "./components/session-status-badge"
import { useCreateSession, useSessions } from "./hooks"

export function CapturePage() {
  const sessions = useSessions()

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Capture"
        description="Do a real task while Socrates watches your screen. It asks why at natural pauses, closes the gaps in a short debrief, and turns it into a Work Map."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <NewSessionCard />
        <Card>
          <CardHeader>
            <CardTitle>How it works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              1. Open the mock ERP in another tab, start a session and share that tab. Tell Socrates
              what you're about to do.
            </p>
            <p>
              2. Work as usual and think out loud. Socrates asks 3–5 questions at natural pauses.
            </p>
            <p>3. Say you're done: a short spoken debrief, then Socrates explains it back.</p>
            <p className="flex gap-2 pt-2 text-xs">
              <ShieldCheck className="size-4 shrink-0" />
              Say "off the record" or flip the switch any time. Nothing is captured until you're
              back on the record.
            </p>
          </CardContent>
        </Card>
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
              {sessions.data.map((session) => (
                <li key={session.id}>
                  <SessionRow session={session} />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  )
}

function sessionLink(session: CaptureSession) {
  if (session.status === "mapped" && session.workMapId) return paths.workMap(session.workMapId)
  if (
    session.status === "intake" ||
    session.status === "live" ||
    session.status === "awaiting_debrief"
  )
    return paths.session(session.id)
  return undefined
}

function SessionRow({ session }: { session: CaptureSession }) {
  const to = sessionLink(session)
  const row = (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{session.title}</p>
        <p className="text-sm text-muted-foreground">
          {session.expert.name} · {formatRelative(session.startedAt)} ·{" "}
          {formatDuration(session.durationSec)} · {session.eventCount} events ·{" "}
          {session.questionsAsked} live questions
        </p>
      </div>
      <SessionStatusBadge status={session.status} />
      {to && <ChevronRight className="size-4 text-muted-foreground" />}
    </>
  )
  return to ? (
    <Link to={to} className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/50">
      {row}
    </Link>
  ) : (
    <div className="flex items-center gap-4 px-4 py-3">{row}</div>
  )
}

function NewSessionCard() {
  const navigate = useNavigate()
  const create = useCreateSession()
  const { data: me } = useMe()
  // Expert fields default to the signed-in user until edited (the profile loads async).
  const [edits, setForm] = useState<Partial<NewSession>>({})
  const form: NewSession = {
    expertName: me?.displayName ?? "",
    expertRole: me?.role ?? "",
    title: "Month-end supplier invoices",
    task: "Process this week's supplier invoices in the ERP before the month-end close.",
    ...edits,
  }
  const set = (key: keyof NewSession) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    const session = await create.mutateAsync(form)
    navigate(paths.session(session.id))
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Radio className="size-4" /> New session
        </CardTitle>
        <CardDescription>Who's showing what? You can refine the task by voice.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="expert">Expert</Label>
            <Input id="expert" value={form.expertName} onChange={set("expertName")} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="role">Role</Label>
            <Input id="role" value={form.expertRole} onChange={set("expertRole")} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="title">Session title</Label>
            <Input id="title" value={form.title} onChange={set("title")} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="task">What are you about to do?</Label>
            <Textarea id="task" value={form.task} onChange={set("task")} rows={2} required />
          </div>
          {create.isError && (
            <p className="text-sm text-destructive sm:col-span-2">{String(create.error)}</p>
          )}
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Loader2 className="animate-spin" />}
              Start session
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => window.open(paths.erp(), "nordwind-erp")}
            >
              <ExternalLink /> Open mock ERP
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

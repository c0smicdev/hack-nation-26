import { ChevronRight, ExternalLink, Loader2, Radio, ShieldCheck } from "lucide-react"
import { type FormEvent, useState } from "react"
import { useTranslation } from "react-i18next"
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
  const { t } = useTranslation("capture")
  const sessions = useSessions()

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader title={t("capturePage.title")} description={t("capturePage.description")} />

      <div className="grid gap-6 lg:grid-cols-3">
        <NewSessionCard />
        <Card>
          <CardHeader>
            <CardTitle>{t("capturePage.howItWorks.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>{t("capturePage.howItWorks.step1")}</p>
            <p>{t("capturePage.howItWorks.step2")}</p>
            <p>{t("capturePage.howItWorks.step3")}</p>
            <p className="flex gap-2 pt-2 text-xs">
              <ShieldCheck className="size-4 shrink-0" />
              {t("capturePage.howItWorks.offTheRecord")}
            </p>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("capturePage.sessions")}</h2>
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
  const { t } = useTranslation("capture")
  const to = sessionLink(session)
  const row = (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{session.title}</p>
        <p className="text-sm text-muted-foreground">
          {session.expert.name} · {formatRelative(session.startedAt)} ·{" "}
          {formatDuration(session.durationSec)} ·{" "}
          {t("sessionRow.events", { count: session.eventCount })} ·{" "}
          {t("sessionRow.liveQuestions", { count: session.questionsAsked })}
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
  const { t } = useTranslation("capture")
  const navigate = useNavigate()
  const create = useCreateSession()
  const { data: me } = useMe()
  // Expert fields default to the signed-in user until edited (the profile loads async).
  const [edits, setForm] = useState<Partial<NewSession>>({})
  const form: NewSession = {
    expertName: me?.displayName ?? "",
    expertRole: me?.role ?? "",
    title: t("newSession.defaultTitle"),
    task: t("newSession.defaultTask"),
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
          <Radio className="size-4" /> {t("newSession.title")}
        </CardTitle>
        <CardDescription>{t("newSession.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="expert">{t("newSession.expert")}</Label>
            <Input id="expert" value={form.expertName} onChange={set("expertName")} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="role">{t("newSession.role")}</Label>
            <Input id="role" value={form.expertRole} onChange={set("expertRole")} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="title">{t("newSession.sessionTitle")}</Label>
            <Input id="title" value={form.title} onChange={set("title")} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="task">{t("newSession.task")}</Label>
            <Textarea id="task" value={form.task} onChange={set("task")} rows={2} required />
          </div>
          {create.isError && (
            <p className="text-sm text-destructive sm:col-span-2">{String(create.error)}</p>
          )}
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Loader2 className="animate-spin" />}
              {t("newSession.start")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => window.open(paths.erp(), "nordwind-erp")}
            >
              <ExternalLink /> {t("openErp")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

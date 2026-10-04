import { ConversationProvider } from "@elevenlabs/react"
import {
  CheckCircle2,
  ChevronLeft,
  ExternalLink,
  GraduationCap,
  Loader2,
  ShieldAlert,
  Square,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Link, useParams } from "react-router"

import { paths } from "@/app/paths"
import { ErrorState } from "@/components/query-state"
import { ScreenMomentView } from "@/components/screen-moment-view"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { VoicePanel } from "@/components/voice-panel"
import { api, type DecisionVerdict, type WorkMap } from "@/lib/api"
import { useMe } from "@/lib/auth/hooks"
import { ACTION_LABEL, type ErpAction, openErpChannel } from "@/lib/erp/bridge"
import { INITIAL_INVOICES } from "@/lib/erp/data"
import { cn } from "@/lib/utils"
import { useVoiceAgent } from "@/lib/voice/use-voice-agent"

import { caseLine, workMapBrief } from "./brief"
import { useLessonWorkMap } from "./hooks"

const TUTOR = "Socrates"
const GATE_HEARTBEAT_MS = 2000

export function LessonPage() {
  const { workMapId = "" } = useParams()
  const map = useLessonWorkMap(workMapId)
  if (map.isError) return <ErrorState error={map.error} retry={map.refetch} />
  if (!map.data) return <Skeleton className="mx-auto h-[32rem] max-w-6xl" />
  return (
    <ConversationProvider>
      <Lesson map={map.data} />
    </ConversationProvider>
  )
}

interface Check {
  id: string
  invoiceId: string
  action: ErpAction
  status: "checking" | "held" | "allowed"
  verdict?: DecisionVerdict
}

interface Report {
  mastered: string[]
  practice: string[]
}

const split = (s: unknown) =>
  String(s ?? "")
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean)

/**
 * A new hire works training cases in the mock ERP while the tutor (ElevenAgents)
 * guides them. Every save is held until Claude checks it against the expert's
 * workflow, so a wrong decision is caught before it's saved.
 */
function Lesson({ map }: { map: WorkMap }) {
  const { data: me } = useMe()
  const [learnerEdit, setLearner] = useState<string>()
  // The signed-in user, unless they'd be learning their own map (e.g. Sabine in mock mode).
  const learner =
    learnerEdit ?? (me && me.id !== map.expert.id ? me.displayName.split(" ")[0] : "Alex")
  const [started, setStarted] = useState(false)
  const [checks, setChecks] = useState<Check[]>([])
  const [report, setReport] = useState<Report>()
  const expertFirst = map.expert.name.split(" ")[0]

  const agent = useVoiceAgent({
    role: "tutor",
    tools: {
      finish_lesson: ({ mastered, practice }) => {
        setReport({ mastered: split(mastered), practice: split(practice) })
        return "Shown to the learner. Summarize in two sentences and say goodbye."
      },
    },
  })
  const agentRef = useRef(agent)
  useEffect(() => {
    agentRef.current = agent
  })

  // While the lesson runs, the ERP holds every save until we answer.
  useEffect(() => {
    if (!started || report) return
    const channel = openErpChannel(async (m) => {
      const a = agentRef.current
      if (m.type === "screen" && m.invoiceId) {
        const invoice = INITIAL_INVOICES.find((i) => i.id === m.invoiceId)
        if (invoice) a.prompt(`[ERP] The learner opened ${caseLine(invoice)}.`)
      } else if (m.type === "field_change") {
        a.context(`[ERP] Invoice ${m.invoiceId}: ${m.label} changed ${m.from} → ${m.to}`)
      } else if (m.type === "save_request") {
        channel.send({ type: "save_pending", requestId: m.requestId })
        const check: Check = {
          id: m.requestId,
          invoiceId: m.invoiceId,
          action: m.action,
          status: "checking",
        }
        setChecks((c) => [check, ...c])
        let verdict: DecisionVerdict
        try {
          verdict = await api.checkDecision(map.id, { action: m.action, record: m.record })
        } catch {
          // An unavailable/privacy-blocked check is not permission to save.
          verdict = {
            allow: false,
            message: "The check could not complete. Nothing was saved. Please retry.",
          }
        }
        channel.send({
          type: "save_decision",
          requestId: m.requestId,
          allow: verdict.allow,
          message: verdict.message,
        })
        setChecks((c) =>
          c.map((x) =>
            x.id === m.requestId
              ? { ...x, status: verdict.allow ? "allowed" : "held", verdict }
              : x,
          ),
        )
        const what = `${ACTION_LABEL[m.action]} on invoice ${m.invoiceId}`
        if (verdict.allow) {
          a.prompt(`[SAVED] ${what} went through. ${verdict.message}`)
        } else {
          const quote = verdict.quote ? ` ${expertFirst}'s own words: "${verdict.quote.text}"` : ""
          a.prompt(
            `[HOLD] The learner tried: ${what}. The ERP is holding it. ${verdict.message}${quote}`,
          )
        }
      }
    })
    const beat = () => channel.send({ type: "gate", active: true, tutor: TUTOR })
    beat()
    const timer = setInterval(beat, GATE_HEARTBEAT_MS)
    return () => {
      clearInterval(timer)
      channel.send({ type: "gate", active: false, tutor: TUTOR })
      channel.close()
    }
  }, [started, report, map.id, expertFirst])

  async function start() {
    setStarted(true)
    window.open(paths.erp(), "nordwind-erp")
    await agent.start({
      learner_name: learner,
      expert_name: expertFirst,
      work_map: workMapBrief(map),
    })
  }

  function end() {
    if (!agent.prompt("[SYSTEM] The learner wants to stop. Call finish_lesson now.")) {
      const held = checks.filter((c) => c.status === "held")
      setReport({
        mastered: checks
          .filter((c) => c.status === "allowed")
          .map((c) => `${ACTION_LABEL[c.action]} on ${c.invoiceId}`),
        practice: held.map((c) => c.verdict?.message ?? `Invoice ${c.invoiceId}`),
      })
    }
  }

  const held = checks.find((c) => c.status === "held")
  const caught = checks.filter((c) => c.status === "held").length

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="space-y-3">
        <Link
          to={paths.teach()}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Teach
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              Lesson · taught in {map.expert.name}'s words
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">{map.title}</h1>
          </div>
          {started && !report && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => window.open(paths.erp(), "nordwind-erp")}>
                <ExternalLink /> Open mock ERP
              </Button>
              <Button variant="outline" onClick={end}>
                <Square /> End lesson
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-6">
          {!started && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GraduationCap className="size-4" /> Start a lesson
                </CardTitle>
                <CardDescription>
                  The mock ERP opens in a new tab: switch its list to{" "}
                  <strong>Training cases</strong>. These are cases {expertFirst} never showed. Every
                  save waits for the tutor.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="learner">Your name</Label>
                  <Input
                    id="learner"
                    value={learner}
                    onChange={(e) => setLearner(e.target.value)}
                  />
                </div>
                <Button onClick={() => void start()} disabled={!learner.trim()}>
                  Start lesson
                </Button>
              </CardContent>
            </Card>
          )}

          {report && <ReportCard report={report} caught={caught} />}

          {held?.verdict && (
            <HeldCard verdict={held.verdict} map={map} invoiceId={held.invoiceId} />
          )}

          {started && (
            <Card>
              <CardHeader>
                <CardTitle>Decisions</CardTitle>
                <CardDescription>
                  {checks.length === 0
                    ? "Work a case in the ERP. Each save is checked against the workflow first."
                    : `${checks.length} checked · ${caught} caught before saving`}
                </CardDescription>
              </CardHeader>
              {checks.length > 0 && (
                <CardContent>
                  <ul className="space-y-2">
                    {checks.map((c) => (
                      <li key={c.id} className="flex items-start gap-3 text-sm">
                        {c.status === "checking" ? (
                          <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" />
                        ) : c.status === "held" ? (
                          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
                        ) : (
                          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                        )}
                        <div>
                          <p className="font-medium">
                            {ACTION_LABEL[c.action]} · invoice {c.invoiceId}
                            <span
                              className={cn(
                                "ml-2 text-xs font-normal",
                                c.status === "held" ? "text-amber-700" : "text-muted-foreground",
                              )}
                            >
                              {c.status === "checking"
                                ? "checking…"
                                : c.status === "held"
                                  ? "held before saving"
                                  : "saved"}
                            </span>
                          </p>
                          {c.verdict && (
                            <p className="text-muted-foreground">{c.verdict.message}</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              )}
            </Card>
          )}
        </div>

        <VoicePanel
          agent={agent}
          title="Socrates · Tutor"
          placeholder="Ask the tutor…"
          className="lg:sticky lg:top-4 lg:max-h-[calc(100svh-6rem)] lg:self-start"
        />
      </div>
    </div>
  )
}

function HeldCard({
  verdict,
  map,
  invoiceId,
}: {
  verdict: DecisionVerdict
  map: WorkMap
  invoiceId: string
}) {
  const step = map.steps.find((s) => s.id === verdict.stepId)
  const guardrail = step?.guardrails.find((g) => g.id === verdict.guardrailId)
  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="size-4 text-amber-600" /> {map.expert.name.split(" ")[0]} would
          stop here
        </CardTitle>
        <CardDescription>
          Invoice {invoiceId} wasn't saved. {verdict.message}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-[1fr_16rem]">
        {verdict.screen ? (
          <ScreenMomentView moment={verdict.screen} />
        ) : (
          <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
            No screen moment for this rule.
          </div>
        )}
        <div className="space-y-3 text-sm">
          {step && (
            <p>
              <span className="text-muted-foreground">Step:</span> {step.title}
            </p>
          )}
          {guardrail && (
            <p>
              <span className="text-muted-foreground">Rule:</span> {guardrail.rule}
            </p>
          )}
          {verdict.quote && (
            <blockquote className="border-l-2 border-amber-500 pl-3 italic">
              “{verdict.quote.text}”
              <footer className="mt-1 text-xs text-muted-foreground not-italic">
                — {verdict.quote.speaker.name}
              </footer>
            </blockquote>
          )}
          {step && (
            <Link to={paths.workMap(map.id, step.id)} className="text-xs underline">
              See the step in the workflow
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function ReportCard({ report, caught }: { report: Report; caught: number }) {
  return (
    <Card className="border-emerald-600/30">
      <CardHeader>
        <CardTitle>Lesson summary</CardTitle>
        <CardDescription>{caught} wrong decision(s) caught before they were saved.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 sm:grid-cols-2">
        <div>
          <p className="mb-2 font-medium">Mastered</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {report.mastered.length ? report.mastered.map((m) => <li key={m}>{m}</li>) : <li>—</li>}
          </ul>
        </div>
        <div>
          <p className="mb-2 font-medium">Practice next</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {report.practice.length ? report.practice.map((m) => <li key={m}>{m}</li>) : <li>—</li>}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}

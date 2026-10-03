import { ConversationProvider } from "@elevenlabs/react"
import { useQueryClient } from "@tanstack/react-query"
import {
  ExternalLink,
  Flag,
  Loader2,
  MessageCircleQuestion,
  MonitorUp,
  Sparkles,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useParams } from "react-router"

import { paths } from "@/app/paths"
import { ErrorState } from "@/components/query-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { VoicePanel } from "@/components/voice-panel"
import { api, type CaptureSession, type ID, type WorkMap, type WorkMapSummary } from "@/lib/api"
import { startScreenShare } from "@/lib/capture/screen"
import { formatTimestamp, pluralize } from "@/lib/format"
import { useVoiceAgent } from "@/lib/voice/use-voice-agent"

import { DebriefPanel } from "./components/debrief-panel"
import { EventFeed } from "./components/event-feed"
import { OffTheRecordSwitch } from "./components/off-the-record-switch"
import { SessionStatusBadge } from "./components/session-status-badge"
import {
  captureKeys,
  useCaptureStatus,
  useDraftWorkMap,
  useSession,
  useSessionEvents,
  useSetOffTheRecord,
} from "./hooks"
import { useCaptureLoop } from "./use-capture-loop"

export function SessionPage() {
  const { sessionId = "" } = useParams()
  const session = useSession(sessionId)
  if (session.isError) return <ErrorState error={session.error} retry={session.refetch} />
  if (!session.data) return <Skeleton className="mx-auto h-[32rem] max-w-6xl" />
  return (
    <ConversationProvider>
      <SessionView session={session.data} />
    </ConversationProvider>
  )
}

const openErp = () => window.open(paths.erp(), "nordwind-erp")
// Event-time helpers (only ever called from handlers, never during render).
const wallClock = () => Date.now()
const secondsSince = (iso: string) => Math.round((Date.now() - Date.parse(iso)) / 1000)

/** One capture session: intake → capture → debrief → teach-back, driven by voice or by hand. */
function SessionView({ session }: { session: CaptureSession }) {
  const queryClient = useQueryClient()
  const { data: status } = useCaptureStatus()
  const setOffTheRecord = useSetOffTheRecord()
  const offRecord = !!status?.offTheRecord && status.liveSessionId === session.id
  const events = useSessionEvents(session.id, { live: session.status !== "mapped" })
  const draft = useDraftWorkMap(session.workMapId)

  const [stream, setStream] = useState<MediaStream>()
  const [video, setVideo] = useState<HTMLVideoElement | null>(null)
  const [related, setRelated] = useState<WorkMapSummary[]>()
  const [busy, setBusy] = useState<string>()
  const [finalMapId, setFinalMapId] = useState<ID>()
  const [shareError, setShareError] = useState<string>()

  // Everything the expert said, so a debrief answer is their exact words since the last question.
  const utterances = useRef<{ text: string; at: number }[]>([])
  const marker = useRef(0)
  const wordsSinceMarker = () => {
    const words = utterances.current.filter((u) => u.at >= marker.current).map((u) => u.text)
    marker.current = wallClock()
    return words.join(" ").trim()
  }

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: captureKeys.session(session.id) })
    queryClient.invalidateQueries({ queryKey: captureKeys.sessions })
  }, [queryClient, session.id])
  const setMap = (map: WorkMap) => queryClient.setQueryData(["work-maps", map.id], map)

  /* Actions shared by voice tools and buttons ------------------------- */

  async function lookupMemory(task: string) {
    const maps = await api.findRelatedWorkMaps(task)
    setRelated(maps)
    return maps
  }

  async function setBase(workMapId: ID | null) {
    await api.updateSession(session.id, { basedOnWorkMapId: workMapId })
    refresh()
  }

  async function beginCapture(goal?: string) {
    if (!stream) return false
    await api.updateSession(session.id, {
      status: "live",
      task: goal ? `${session.task} — Goal: ${goal}` : undefined,
    })
    await api.setCaptureStatus({
      signals: { screen: true, microphone: agent.mode === "voice", erp: true },
    })
    refresh()
    return true
  }

  async function finish() {
    setBusy("Building the draft Work Map")
    try {
      stream?.getTracks().forEach((t) => t.stop())
      setStream(undefined)
      const map = await api.finishCapture(session.id)
      setMap(map)
      marker.current = wallClock()
      refresh()
      return map
    } finally {
      setBusy(undefined)
    }
  }

  async function answer(itemId: ID, text: string) {
    const map = await api.answerDebrief(session.workMapId!, itemId, {
      text,
      at: secondsSince(session.startedAt),
    })
    setMap(map)
    return map
  }

  async function teachBack() {
    setBusy("Writing the teach-back")
    try {
      const map = await api.requestTeachBack(session.workMapId!)
      setMap(map)
      marker.current = wallClock()
      return map
    } finally {
      setBusy(undefined)
    }
  }

  async function reply(confirmed: boolean, correction?: string) {
    setBusy(confirmed ? "Saving to memory" : "Updating the teach-back")
    try {
      const map = await api.replyTeachBack(session.workMapId!, {
        confirmed,
        correction,
        at: secondsSince(session.startedAt),
      })
      setMap(map)
      marker.current = wallClock()
      if (map.status === "confirmed") {
        setFinalMapId(map.id)
        queryClient.invalidateQueries({ queryKey: ["work-maps"] })
        refresh()
      }
      return map
    } finally {
      setBusy(undefined)
    }
  }

  /* Voice agent (ElevenAgents) ---------------------------------------- */

  const agent = useVoiceAgent({
    role: "interviewer",
    onUserText: (text) => {
      if (offRecord) return
      utterances.current.push({ text, at: wallClock() })
      if (session.status === "intake" || session.status === "live") loop.recordSpeech(text)
    },
    tools: {
      lookup_memory: async ({ task }) => {
        const maps = await lookupMemory(String(task))
        if (!maps.length) return "No saved Work Map matches. This is a new workflow."
        return maps
          .map((m) => `[${m.id}] "${m.title}" by ${m.expert.name}: ${m.summary}`)
          .join("\n")
      },
      set_base_work_map: async ({ work_map_id }) => {
        const id = String(work_map_id)
        await setBase(id === "none" || !id ? null : id)
        return id === "none"
          ? "Noted: new workflow."
          : "Noted: this session extends that Work Map. Skip what it already explains."
      },
      start_capture: async ({ goal }) =>
        (await beginCapture(String(goal ?? "")))
          ? "Capture started. Stay quiet while they work; use skip_turn when they narrate."
          : "The screen isn't shared yet. Ask them to click 'Share screen' in the app first.",
      set_off_record: async ({ off }) => {
        const value = off === true || off === "true"
        await setOffTheRecord.mutateAsync(value)
        return value
          ? "Off the record. Nothing is captured until they say so."
          : "Back on the record."
      },
      finish_task: async () => {
        const map = await finish()
        const questions = map.debrief.filter((d) => !d.resolved)
        return [
          `Draft Work Map "${map.title}" with ${map.steps.length} steps. Debrief questions, ask one at a time:`,
          ...questions.map((d) => `[${d.id}] ${d.question}`),
        ].join("\n")
      },
      record_debrief_answer: async ({ question_id }) => {
        const words = wordsSinceMarker()
        if (!words) return "I didn't catch an answer yet. Let them answer first."
        const map = await answer(String(question_id), words)
        const next = map.debrief.find((d) => !d.resolved)
        return next
          ? `Recorded. Next question: [${next.id}] ${next.question}`
          : "All questions answered. Call get_teach_back now."
      },
      get_teach_back: async () => (await teachBack()).teachBack?.summary ?? "",
      reply_teach_back: async ({ confirmed, correction }) => {
        const yes = confirmed === true || confirmed === "true"
        const words = yes ? "" : wordsSinceMarker() || String(correction ?? "")
        const map = await reply(yes, words || undefined)
        if (map.status === "confirmed")
          return "The Work Map is saved to memory. Thank them and say goodbye."
        const open = map.debrief.filter((d) => !d.resolved)
        if (yes && open.length) {
          return `Not done yet, these are still open:\n${open.map((d) => `[${d.id}] ${d.question}`).join("\n")}`
        }
        return `Corrected explanation:\n${map.teachBack?.summary}`
      },
    },
  })

  const loop = useCaptureLoop({
    sessionId: session.id,
    startedAt: session.startedAt,
    video,
    live: session.status === "live" && !offRecord && !!stream,
    agent,
  })

  /* Screen share ------------------------------------------------------ */

  async function start() {
    setShareError(undefined)
    try {
      // getDisplayMedia needs the click's user activation, so it goes first.
      const media = await startScreenShare()
      media.getVideoTracks()[0].addEventListener("ended", () => setStream(undefined))
      setStream(media)
    } catch (e) {
      setShareError(e instanceof Error ? e.message : String(e))
      return
    }
    if (agent.mode === "idle" || agent.mode === "error") {
      await agent.start({
        expert_name: session.expert.name.split(" ")[0],
        task: session.task ?? session.title,
      })
    }
    if (session.status === "intake" && !related) void lookupMemory(session.task ?? session.title)
  }

  async function reshare() {
    const media = await startScreenShare()
    media.getVideoTracks()[0].addEventListener("ended", () => setStream(undefined))
    setStream(media)
  }

  // Stop everything when leaving the page.
  useEffect(() => () => stream?.getTracks().forEach((t) => t.stop()), [stream])

  const capturing = session.status === "intake" || session.status === "live"
  const elapsed = useElapsed(session)
  const map = draft.data

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <SessionStatusBadge status={session.status} />
            {offRecord && <Badge variant="outline">Off the record</Badge>}
            <span className="text-sm text-muted-foreground">
              {session.expert.name} · {formatTimestamp(elapsed)} ·{" "}
              {pluralize(session.questionsAsked, "question")} asked live
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{session.title}</h1>
          {session.task && <p className="max-w-3xl text-muted-foreground">{session.task}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={openErp}>
            <ExternalLink /> Open mock ERP
          </Button>
          {capturing && !stream && (
            <Button onClick={agent.mode === "idle" || agent.mode === "error" ? start : reshare}>
              <MonitorUp />{" "}
              {agent.mode === "idle" ? "Share screen & start talking" : "Share screen"}
            </Button>
          )}
          {session.status === "live" && (
            <Button variant="destructive" onClick={() => void finish()} disabled={!!busy}>
              <Flag /> Finish task
            </Button>
          )}
        </div>
      </div>
      {shareError && <p className="text-sm text-destructive">Screen share failed: {shareError}</p>}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-6">
          {session.status === "intake" && (
            <IntakeCard
              related={related}
              basedOn={session.basedOnWorkMapId}
              canStart={!!stream}
              onBase={setBase}
              onStart={() => void beginCapture()}
            />
          )}

          {loop.textQuestion && (
            <TextQuestion
              question={loop.textQuestion.question}
              onAnswer={loop.answerTextQuestion}
              onSkip={loop.dismissTextQuestion}
            />
          )}

          {capturing && (
            <Card className="@container">
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <CardTitle>What Socrates sees</CardTitle>
                  <CardDescription>
                    {loop.screen ?? "Share the mock ERP tab, then work as usual."}
                  </CardDescription>
                </div>
                <div className="w-48 shrink-0">
                  <OffTheRecordSwitch id="session-off-the-record" />
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 @2xl:grid-cols-[16rem_1fr]">
                <div className="space-y-2">
                  <div className="aspect-video overflow-hidden rounded-lg border bg-muted">
                    {stream ? (
                      <ScreenPreview stream={stream} onVideo={setVideo} />
                    ) : (
                      <div className="flex size-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
                        Not sharing
                      </div>
                    )}
                  </div>
                  <LoopStatsLine stats={loop.stats} error={loop.error} />
                  {loop.queue.length > 0 && (
                    <div className="space-y-1 rounded-lg border p-2 text-xs">
                      <p className="font-medium">Waiting for a pause</p>
                      {loop.queue.map((q) => (
                        <p key={q.id} className="text-muted-foreground">
                          {q.question}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
                <div className="max-h-[26rem] overflow-y-auto">
                  {events.data?.length ? (
                    <EventFeed events={events.data} />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Events appear here as Socrates understands what changes on screen.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {session.status === "processing" && (
            <Card>
              <CardContent className="flex items-center gap-3 py-10">
                <Loader2 className="animate-spin" /> Building the draft Work Map from what Socrates
                saw and heard…
              </CardContent>
            </Card>
          )}

          {map && (session.status === "awaiting_debrief" || session.status === "mapped") && (
            <DebriefPanel
              map={map}
              busy={busy}
              finalMapId={
                finalMapId ?? (session.status === "mapped" ? session.workMapId : undefined)
              }
              onAnswer={(itemId, text) => void answer(itemId, text)}
              onTeachBack={() => void teachBack()}
              onReply={(confirmed, correction) => void reply(confirmed, correction)}
            />
          )}
        </div>

        <VoicePanel
          agent={agent}
          title="Socrates · Interviewer"
          className="lg:sticky lg:top-4 lg:max-h-[calc(100svh-6rem)] lg:self-start"
        />
      </div>
    </div>
  )
}

/** Plays the shared screen and hands the <video> to the tick loop, which samples it. */
function ScreenPreview({
  stream,
  onVideo,
}: {
  stream: MediaStream
  onVideo: (video: HTMLVideoElement | null) => void
}) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const video = ref.current
    if (!video) return
    video.srcObject = stream
    void video.play()
    onVideo(video)
    return () => onVideo(null)
  }, [stream, onVideo])
  return <video ref={ref} muted playsInline className="size-full object-contain" />
}

function useElapsed(session: CaptureSession) {
  const live = session.status === "intake" || session.status === "live"
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!live) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [live])
  return live ? Math.max(0, (now - Date.parse(session.startedAt)) / 1000) : session.durationSec
}

function IntakeCard({
  related,
  basedOn,
  canStart,
  onBase,
  onStart,
}: {
  related?: WorkMapSummary[]
  basedOn?: ID
  canStart: boolean
  onBase: (id: ID | null) => void
  onStart: () => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4" /> Intake
        </CardTitle>
        <CardDescription>
          Tell Socrates what you're about to do. It checks its memory so it doesn't document the
          same workflow twice, then starts watching.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {related === undefined ? (
          <p className="text-sm text-muted-foreground">Memory lookup runs when you start.</p>
        ) : related.length === 0 ? (
          <p className="text-sm">No saved Work Map matches. This is a new workflow.</p>
        ) : (
          related.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{m.title}</p>
                <p className="text-sm text-muted-foreground">
                  Already shown by {m.expert.name} · {pluralize(m.stepCount, "step")}
                </p>
              </div>
              <Button
                size="sm"
                variant={basedOn === m.id ? "default" : "outline"}
                onClick={() => onBase(m.id)}
              >
                Same workflow
              </Button>
              <Button
                size="sm"
                variant={basedOn ? "outline" : "secondary"}
                onClick={() => onBase(null)}
              >
                It's new
              </Button>
            </div>
          ))
        )}
        <Button onClick={onStart} disabled={!canStart} variant="outline">
          Start capture now
        </Button>
      </CardContent>
    </Card>
  )
}

function TextQuestion({
  question,
  onAnswer,
  onSkip,
}: {
  question: string
  onAnswer: (text: string) => void
  onSkip: () => void
}) {
  const [draft, setDraft] = useState("")
  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageCircleQuestion className="size-4" /> {question}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (draft.trim()) onAnswer(draft.trim())
          }}
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Your answer"
          />
          <Button type="submit">Answer</Button>
          <Button type="button" variant="ghost" onClick={onSkip}>
            Later
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function LoopStatsLine({
  stats,
  error,
}: {
  stats: ReturnType<typeof useCaptureLoop>["stats"]
  error?: string
}) {
  return (
    <p className="text-xs text-muted-foreground">
      {stats.sent} frames analysed · {stats.skipped} unchanged · {stats.dropped} dropped
      {stats.visionMs ? ` · vision ${(stats.visionMs / 1000).toFixed(1)} s` : ""}
      {error && <span className="block text-destructive">{error}</span>}
    </p>
  )
}

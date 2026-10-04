import { ConversationProvider } from "@elevenlabs/react"
import { useQueryClient } from "@tanstack/react-query"
import {
  ChevronRight,
  ExternalLink,
  Flag,
  Keyboard,
  Loader2,
  MessageCircleQuestion,
  Mic,
  MicOff,
  MonitorUp,
  Sparkles,
} from "lucide-react"
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react"
import { Trans, useTranslation } from "react-i18next"
import { Link, useParams } from "react-router"

import { paths } from "@/app/paths"
import { MermaidDiagram } from "@/components/mermaid-diagram"
import { ErrorState } from "@/components/query-state"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  api,
  type CaptureSession,
  type ID,
  type LiveStep,
  type SessionEvent,
  type WorkMap,
  type WorkMapSummary,
} from "@/lib/api"
import { useMe } from "@/lib/auth/hooks"
import { claimStream } from "@/lib/capture/pending-stream"
import { startScreenShare } from "@/lib/capture/screen"
import { coachingStyle } from "@/lib/coaching"
import { formatTimestamp } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useVoiceAgent, type VoiceAgent } from "@/lib/voice/use-voice-agent"
import { liveStepsToMermaid, stepNodeId } from "@/features/work-maps/flowchart"

import { DebriefView } from "./components/debrief-view"
import { LeaveGuard } from "./components/leave-guard"
import { LiveStepList } from "./components/live-step-list"
import { OffTheRecordSwitch } from "./components/off-the-record-switch"
import {
  captureKeys,
  useCaptureStatus,
  useDraftWorkMap,
  useLiveSteps,
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

/** Tells the interviewer where the debrief stands, so it can ask (or teach back) by voice. */
function debriefBrief(map: WorkMap) {
  const open = map.debrief.filter((d) => !d.resolved)
  if (map.status === "confirmed") return "[SYSTEM] The workflow is already confirmed."
  if (!open.length)
    return "[SYSTEM] All debrief questions are answered. Continue with the Teach-back procedure."
  return [
    `[SYSTEM] The expert ended the task in the app, so finish_task already ran: don't call it. Draft workflow "${map.title}" with ${map.steps.length} steps. Continue with the Debrief procedure using these questions:`,
    ...open.map((d) => `[${d.id}] ${d.question}`),
  ].join("\n")
}

/**
 * One capture session. While recording: the workflow graph grows on the left,
 * the steps on the right. After "End workflow": debrief and teach-back.
 */
function SessionView({ session }: { session: CaptureSession }) {
  const { t } = useTranslation("capture")
  const queryClient = useQueryClient()
  const { data: status } = useCaptureStatus()
  const setOffTheRecord = useSetOffTheRecord()
  const offRecord = !!status?.offTheRecord && status.liveSessionId === session.id
  const recording = session.status === "intake" || session.status === "live"
  const steps = useLiveSteps(session.id, { live: recording })
  const events = useSessionEvents(session.id, { live: recording })
  const draft = useDraftWorkMap(session.workMapId)

  // Shared from the "Create workflow" click, if the browser allowed it there.
  const [stream, setStream] = useState<MediaStream | undefined>(() => claimStream(session.id))
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

  async function beginCapture(goal?: string, media = stream) {
    if (!media) return false
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

  function stopSharing() {
    stream?.getTracks().forEach((t) => t.stop())
    setStream(undefined)
  }

  async function finish() {
    setBusy(t("busy.buildingDraft"))
    try {
      stopSharing()
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
    setBusy(t("busy.writingTeachBack"))
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
    setBusy(confirmed ? t("busy.savingToMemory") : t("busy.updatingTeachBack"))
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
      if (recording) loop.recordSpeech(text)
    },
    tools: {
      lookup_memory: async ({ task }) => {
        const maps = await lookupMemory(String(task))
        if (!maps.length) return "No saved workflow matches. This is a new workflow."
        return maps
          .map((m) => `[${m.id}] "${m.title}" by ${m.expert.name}: ${m.summary}`)
          .join("\n")
      },
      set_base_work_map: async ({ work_map_id }) => {
        const id = String(work_map_id)
        await setBase(id === "none" || !id ? null : id)
        return id === "none"
          ? "Noted: new workflow."
          : "Noted: this session extends that workflow. Skip what it already explains."
      },
      start_capture: async ({ goal }) =>
        (await beginCapture(String(goal ?? "")))
          ? "Capture is running. Stay quiet while they work; use skip_turn when they narrate."
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
          `Draft workflow "${map.title}" with ${map.steps.length} steps. Debrief questions, ask one at a time:`,
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
          return "The workflow is saved to memory. Thank them and say goodbye."
        const open = map.debrief.filter((d) => !d.resolved)
        if (yes && open.length) {
          return `Not done yet, these are still open:\n${open.map((d) => `[${d.id}] ${d.question}`).join("\n")}`
        }
        return `Corrected explanation:\n${map.teachBack?.summary}`
      },
    },
  })

  // The expert recording is the signed-in user: their coaching style sets how often Socrates asks.
  const { data: me } = useMe()
  const chattiness = me?.preferences.chattiness

  const loop = useCaptureLoop({
    sessionId: session.id,
    startedAt: session.startedAt,
    video,
    live: session.status === "live" && !offRecord && !!stream,
    agent,
    chattiness,
    onSteps: (next) => queryClient.setQueryData(captureKeys.steps(session.id), next),
  })

  /* Debrief by voice -------------------------------------------------- */

  // Set when the debrief should start as soon as the voice agent is connected.
  const debriefPending = useRef(false)

  /** Ended by button, not by voice: hand the open questions to the agent so it asks them. */
  async function endWorkflow() {
    const map = await finish()
    if (!agent.prompt(debriefBrief(map))) debriefPending.current = true
  }

  /** Dynamic variables for the interviewer's prompt, first message and procedures. */
  const agentVariables = () => ({
    expert_name: session.expert.name.split(" ")[0],
    workflow: session.title,
    task: session.task ?? session.title,
    coaching_style: coachingStyle(chattiness),
  })

  /** Coming back to a debrief (or voice was off): connect, then start asking. */
  function startVoiceDebrief() {
    debriefPending.current = true
    void agent.start(agentVariables())
  }

  useEffect(() => {
    if (agent.mode !== "voice" || !debriefPending.current || !draft.data) return
    debriefPending.current = false
    marker.current = wallClock()
    agent.prompt(debriefBrief(draft.data))
  }, [agent, draft.data])

  /* Screen share: recording starts as soon as the screen is shared ----- */

  /** Runs once per shared stream: recording starts as soon as the screen is shared. */
  async function startRecording(media: MediaStream) {
    media.getVideoTracks()[0]?.addEventListener("ended", () => setStream(undefined))
    if (session.status === "intake") await beginCapture(undefined, media)
    if (agent.mode === "idle" || agent.mode === "error") {
      await agent.start(agentVariables())
    }
    if (!related) void lookupMemory(session.task ?? session.title)
  }

  async function share() {
    setShareError(undefined)
    try {
      // getDisplayMedia needs the click's user activation, so it goes first.
      setStream(await startScreenShare())
    } catch (e) {
      setShareError(e instanceof Error ? e.message : String(e))
    }
  }

  const started = useRef<MediaStream>(undefined)
  const startRef = useRef(startRecording)
  useEffect(() => {
    startRef.current = startRecording
  })
  useEffect(() => {
    if (!stream || started.current === stream) return
    started.current = stream
    void startRef.current(stream)
  }, [stream])

  // Stop sharing when leaving the page. Deferred, so StrictMode's test unmount doesn't.
  const streamRef = useRef(stream)
  useEffect(() => {
    streamRef.current = stream
  })
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      setTimeout(() => {
        if (!mounted.current) streamRef.current?.getTracks().forEach((t) => t.stop())
      }, 0)
    }
  }, [])

  const elapsed = useElapsed(session)

  if (recording) {
    return (
      <RecordingView
        session={session}
        steps={steps.data ?? []}
        events={events.data ?? []}
        elapsed={elapsed}
        offRecord={offRecord}
        agent={agent}
        stream={stream}
        onVideo={setVideo}
        shareError={shareError}
        onShare={() => void share()}
        onEnd={() => void endWorkflow()}
        ending={!!busy}
        related={related}
        basedOn={session.basedOnWorkMapId}
        onBase={(id) => void setBase(id)}
        textQuestion={
          loop.textQuestion && (
            <TextQuestion
              question={loop.textQuestion.question}
              onAnswer={loop.answerTextQuestion}
              onSkip={loop.dismissTextQuestion}
            />
          )
        }
        loopError={loop.error}
        onAbandon={() => {
          stopSharing()
          agent.stop()
        }}
      />
    )
  }

  return (
    <DebriefView
      session={session}
      map={draft.data}
      steps={steps.data ?? []}
      events={events.data ?? []}
      elapsed={elapsed}
      agent={agent}
      agentStatus={<SocratesStatus agent={agent} />}
      busy={busy}
      finalMapId={finalMapId ?? (session.status === "mapped" ? session.workMapId : undefined)}
      onStartVoice={startVoiceDebrief}
      onAnswer={(itemId, text) => void answer(itemId, text)}
      onTeachBack={() => void teachBack()}
      onReply={(confirmed, correction) => void reply(confirmed, correction)}
    />
  )
}

/* Recording ------------------------------------------------------------ */

function RecordingView({
  session,
  steps,
  events,
  elapsed,
  offRecord,
  agent,
  stream,
  onVideo,
  shareError,
  onShare,
  onEnd,
  ending,
  related,
  basedOn,
  onBase,
  textQuestion,
  loopError,
  onAbandon,
}: {
  session: CaptureSession
  steps: LiveStep[]
  events: SessionEvent[]
  elapsed: number
  offRecord: boolean
  agent: VoiceAgent
  stream?: MediaStream
  onVideo: (video: HTMLVideoElement | null) => void
  shareError?: string
  onShare: () => void
  onEnd: () => void
  ending: boolean
  related?: WorkMapSummary[]
  basedOn?: ID
  onBase: (id: ID | null) => void
  textQuestion?: ReactNode
  loopError?: string
  onAbandon: () => void
}) {
  const { t } = useTranslation("capture")
  const [openId, setOpenId] = useState<ID>()
  // Not memoized: the labels are translated, and the diagram only redraws when the text changes.
  const chart = liveStepsToMermaid(steps)
  const clicks = Object.fromEntries(
    steps.map((step, i) => [stepNodeId(i), () => setOpenId(step.id)]),
  )
  const match = related?.[0]

  return (
    // Full-bleed under the app header: cancel <main>'s padding.
    <div className="-m-4 flex h-[calc(100svh-3.5rem)] flex-col md:-m-8">
      <LeaveGuard active onLeave={onAbandon} />

      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3 md:px-6">
        <nav className="flex min-w-0 items-center gap-1.5 text-sm">
          <Link to={paths.library()} className="text-muted-foreground hover:text-foreground">
            {t("breadcrumbWorkflows")}
          </Link>
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate font-semibold">{session.title}</span>
        </nav>
        <span className="flex items-center gap-2 text-sm tabular-nums">
          <span
            className={cn(
              "size-2.5 rounded-full",
              !stream ? "bg-muted-foreground/40" : offRecord ? "bg-amber-500" : "bg-red-500",
              stream && !offRecord && "animate-pulse",
            )}
          />
          {!stream
            ? t("recording.notRecording")
            : offRecord
              ? t("recording.paused")
              : t("recording.recording")}{" "}
          · {formatTimestamp(elapsed)}
        </span>
        <SocratesStatus agent={agent} />
        <div className="ml-auto flex items-center gap-4">
          <div className="w-40">
            <OffTheRecordSwitch id="session-off-the-record" />
          </div>
          <Button variant="outline" size="sm" onClick={openErp}>
            <ExternalLink /> {t("openErp")}
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[1fr_24rem]">
        {/* Left: the workflow, growing as you go */}
        <section className="relative min-h-80 overflow-hidden bg-muted/20">
          <div className="absolute inset-x-4 top-4 z-10 space-y-3">
            {match && basedOn === undefined && (
              <MemoryMatch map={match} onSame={() => onBase(match.id)} onNew={() => onBase(null)} />
            )}
            {textQuestion}
          </div>
          {stream ? (
            <MermaidDiagram chart={chart} onNodeClick={clicks} className="size-full pt-12" />
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-4 p-8 text-center">
              <MonitorUp className="size-10 text-muted-foreground" />
              <div className="space-y-1">
                <p className="font-medium">{t("recording.shareTitle")}</p>
                <p className="max-w-sm text-sm text-muted-foreground">{t("recording.shareHint")}</p>
              </div>
              <Button onClick={onShare}>
                <MonitorUp /> {t("recording.shareScreen")}
              </Button>
              {shareError && <p className="text-sm text-destructive">{shareError}</p>}
            </div>
          )}
        </section>

        {/* Right: your steps */}
        <aside className="flex min-h-0 flex-col border-t lg:border-t-0 lg:border-l">
          <div className="flex items-center gap-3 border-b px-4 py-3">
            {stream && (
              <div className="aspect-video w-20 shrink-0 overflow-hidden rounded border bg-muted">
                <ScreenPreview stream={stream} onVideo={onVideo} />
              </div>
            )}
            <div className="min-w-0">
              <h2 className="font-semibold">{t("yourSteps")}</h2>
              <p className="text-xs text-muted-foreground">
                {loopError ? (
                  <span className="text-destructive">{loopError}</span>
                ) : (
                  t("recording.stepsSoFar", { count: steps.length })
                )}
              </p>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <LiveStepList
              steps={steps}
              events={events}
              openId={openId}
              onToggle={(id) => setOpenId((open) => (open === id ? undefined : id))}
            />
          </div>
          <div className="flex justify-end border-t px-4 py-3">
            <Button variant="destructive" onClick={onEnd} disabled={ending || !stream}>
              {ending ? <Loader2 className="animate-spin" /> : <Flag />}{" "}
              {t("recording.endWorkflow")}
            </Button>
          </div>
        </aside>
      </div>
    </div>
  )
}

/** Compact voice status for the recording header: Socrates listens, asks at pauses. */
function SocratesStatus({ agent }: { agent: VoiceAgent }) {
  const { t } = useTranslation("capture")
  const last = agent.transcript.findLast((l) => l.role === "agent")
  const icon =
    agent.mode === "voice" ? (
      <Mic className={cn("size-3.5", agent.agentSpeaking && "text-primary")} />
    ) : agent.mode === "connecting" ? (
      <Loader2 className="size-3.5 animate-spin" />
    ) : agent.mode === "text" ? (
      <Keyboard className="size-3.5" />
    ) : (
      <MicOff className="size-3.5" />
    )
  const label =
    agent.mode === "voice"
      ? agent.agentSpeaking
        ? t("socratesStatus.speaking")
        : t("socratesStatus.listening")
      : agent.mode === "connecting"
        ? t("socratesStatus.connecting")
        : agent.mode === "text"
          ? t("socratesStatus.text")
          : t("socratesStatus.off")
  return (
    <span className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
      {icon}
      <span className="shrink-0">{label}</span>
      {last && agent.mode === "voice" && (
        <span className="hidden max-w-md truncate italic xl:inline">“{last.text}”</span>
      )}
    </span>
  )
}

function MemoryMatch({
  map,
  onSame,
  onNew,
}: {
  map: WorkMapSummary
  onSame: () => void
  onNew: () => void
}) {
  const { t } = useTranslation("capture")
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-background p-3 shadow-sm">
      <Sparkles className="size-4 shrink-0 text-primary" />
      <p className="min-w-0 flex-1 text-sm">
        <Trans
          t={t}
          i18nKey="memoryMatch.text"
          values={{ title: map.title, expert: map.expert.name }}
          components={{ strong: <span className="font-medium" /> }}
        />
      </p>
      <Button size="sm" variant="outline" onClick={onSame}>
        {t("memoryMatch.same")}
      </Button>
      <Button size="sm" variant="ghost" onClick={onNew}>
        {t("memoryMatch.new")}
      </Button>
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

function TextQuestion({
  question,
  onAnswer,
  onSkip,
}: {
  question: string
  onAnswer: (text: string) => void
  onSkip: () => void
}) {
  const { t } = useTranslation("capture")
  const [draft, setDraft] = useState("")
  return (
    <Card className="border-primary/40 bg-background shadow-sm">
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
            placeholder={t("textQuestion.placeholder")}
          />
          <Button type="submit">{t("textQuestion.answer")}</Button>
          <Button type="button" variant="ghost" onClick={onSkip}>
            {t("textQuestion.later")}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

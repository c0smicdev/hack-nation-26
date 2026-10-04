import { ConversationProvider } from "@elevenlabs/react"
import {
  ChevronRight,
  ExternalLink,
  Footprints,
  Keyboard,
  Loader2,
  MessageCircle,
  Mic,
  MicOff,
  MonitorUp,
  ShieldAlert,
  ShieldCheck,
  Square,
  X,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Trans, useTranslation } from "react-i18next"
import { Link, useParams } from "react-router"

import { paths } from "@/app/paths"
import { MermaidDiagram } from "@/components/mermaid-diagram"
import { ErrorState } from "@/components/query-state"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  api,
  type ID,
  type SupervisionSession,
  type SupervisorWarning,
  type WorkMap,
} from "@/lib/api"
import { useMe } from "@/lib/auth/hooks"
import { grabFrame, startScreenShare } from "@/lib/capture/screen"
import { coachingStyle } from "@/lib/coaching"
import { formatTimestamp } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useVoiceAgent, type VoiceAgent } from "@/lib/voice/use-voice-agent"
import { stepNodeId, workMapToMermaid } from "@/features/work-maps/flowchart"

import { supervisorBrief } from "./brief"
import { type ChatItem, ChatPanel } from "./components/chat-panel"
import { LeaveGuard } from "./components/leave-guard"
import { MentorSteps } from "./components/mentor-steps"
import { useSupervisedWorkMap } from "./hooks"
import { useSuperviseLoop } from "./use-supervise-loop"

export function SupervisePage() {
  const { t } = useTranslation("supervise")
  const { workMapId = "" } = useParams()
  const map = useSupervisedWorkMap(workMapId)
  if (map.isError) return <ErrorState error={map.error} retry={map.refetch} />
  if (!map.data) return <Skeleton className="mx-auto h-[32rem] max-w-6xl" />
  if (map.data.status !== "confirmed") {
    return (
      <Card className="mx-auto max-w-xl">
        <CardHeader>
          <CardTitle>{t("notReady.title")}</CardTitle>
          <CardDescription>
            {t("notReady.description", { title: map.data.title, expert: map.data.expert.name })}{" "}
            <Link to={paths.workMap(map.data.id)} className="underline">
              {t("notReady.back")}
            </Link>
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }
  return (
    <ConversationProvider>
      <SuperviseView map={map.data} />
    </ConversationProvider>
  )
}

const openErp = () => window.open(paths.erp(), "nordwind-erp")
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
/** A heads-up stays on the graph this long when the chat isn't open. */
const BANNER_MS = 20_000
/** Reconnects after a dropped call before we leave it to the "Turn on voice" button. */
const MAX_RECONNECTS = 3

type Tab = "chat" | "mentor"

/**
 * A new hire runs a confirmed Work Map while Socrates stands by. Left: the
 * expert's workflow, lighting up as the learner moves through it. Right: the
 * chat (their questions and Socrates' answers, plus heads-ups), or toggled to
 * what the mentor did, step by step. Socrates never interrupts, except to stop
 * a mistake the expert would have caught.
 */
function SuperviseView({ map }: { map: WorkMap }) {
  const { t } = useTranslation("supervise")
  const expertFirst = map.expert.name.split(" ")[0]
  const { data: me } = useMe()
  // The new hire is the signed-in user: their coaching style sets how much Socrates helps.
  const chattiness = me?.preferences.chattiness
  const [learnerEdit, setLearner] = useState<string>()
  // The signed-in user, unless they'd be running their own map (e.g. Sabine in mock mode).
  const learner =
    learnerEdit ?? (me && me.id !== map.expert.id ? me.displayName.split(" ")[0] : "Alex")
  const [supervision, setSupervision] = useState<SupervisionSession>()
  const [stream, setStream] = useState<MediaStream>()
  const [video, setVideo] = useState<HTMLVideoElement | null>(null)
  const [shareError, setShareError] = useState<string>()
  const [starting, setStarting] = useState(false)
  const [ended, setEnded] = useState(false)
  const [tab, setTab] = useState<Tab>("chat")
  const [openStepId, setOpenStepId] = useState<ID>()
  const [local, setLocal] = useState<ChatItem[]>([])
  const [warnings, setWarnings] = useState<SupervisorWarning[]>([])
  const [banner, setBanner] = useState<SupervisorWarning>()
  const [thinking, setThinking] = useState(false)
  const seq = useRef(0)

  const add = (item: ChatItem) =>
    setLocal((items) =>
      // look_at_screen and show_step often link the same step for one answer: show it once.
      item.kind === "step" &&
      items.some((i) => i.kind === "step" && i.stepId === item.stepId && item.at - i.at < 30_000)
        ? items
        : [...items, item],
    )
  const nextId = (kind: string) => `${kind}-${++seq.current}`

  function openStep(id: ID) {
    setTab("mentor")
    setOpenStepId(id)
  }

  /** Answers a question looking at the learner's screen right now (and the expert's Work Map). */
  async function askScreen(question: string) {
    if (!supervision) throw new Error(t("errors.notStarted"))
    const frame = video && stream ? grabFrame(video) : null
    setThinking(true)
    try {
      const at = (Date.now() - Date.parse(supervision.startedAt)) / 1000
      return await api.askAboutScreen(supervision.id, {
        question,
        image: frame?.base64 ?? "",
        at,
      })
    } finally {
      setThinking(false)
    }
  }

  /* Voice agent: stands by, answers when asked ------------------------ */

  const agent = useVoiceAgent({
    role: "supervisor",
    tools: {
      look_at_screen: async ({ question }) => {
        const { answer, stepId } = await askScreen(String(question ?? ""))
        if (stepId) add({ kind: "step", id: nextId("step"), at: Date.now(), stepId })
        // The agent tends to end its turn after a tool call: tell it to keep talking.
        return `${answer}\n\n(What you see on their screen. Now say this to the learner, briefly, in your own words.${stepId ? ` The step [${stepId}] is already linked in their chat: don't call show_step for it.` : ""})`
      },
      show_step: ({ step_id }) => {
        const step = map.steps.find((s) => s.id === String(step_id))
        if (!step) {
          return `There's no step "${String(step_id)}". Use a step id from the Work Map.`
        }
        add({ kind: "step", id: nextId("step"), at: Date.now(), stepId: step.id })
        setOpenStepId(step.id)
        // The agent tends to end its turn after a tool call: tell it to keep talking.
        return `"${step.title}" is now linked in the learner's chat. Now give your answer out loud.`
      },
    },
  })

  const loop = useSuperviseLoop({
    supervisionId: supervision?.id,
    startedAt: supervision?.startedAt,
    map,
    video,
    live: !!stream && !!supervision && !ended,
    agent,
    chattiness,
    onWarning: (warning) => {
      setWarnings((list) => [...list, warning])
      add({ kind: "warning", id: warning.id, at: Date.now(), warning })
      setBanner(warning)
    },
  })

  useEffect(() => {
    if (!banner) return
    const timer = setTimeout(() => setBanner(undefined), BANNER_MS)
    return () => clearTimeout(timer)
  }, [banner])

  /* Starting, re-sharing and ending ----------------------------------- */

  /** Connects the supervisor agent; it listens for the learner's questions from then on. */
  const { start: startAgent } = agent
  const startVoice = useCallback(
    (run: SupervisionSession) =>
      void startAgent({
        learner_name: run.learnerName,
        expert_name: expertFirst,
        work_map: supervisorBrief(map),
        coaching_style: coachingStyle(chattiness),
      }),
    [startAgent, expertFirst, map, chattiness],
  )

  async function share() {
    setShareError(undefined)
    let media: MediaStream
    try {
      // getDisplayMedia needs the click's user activation, so it goes first.
      media = await startScreenShare()
    } catch (e) {
      setShareError(message(e))
      return
    }
    media
      .getVideoTracks()[0]
      ?.addEventListener("ended", () =>
        setStream((current) => (current === media ? undefined : current)),
      )
    setStarting(true)
    try {
      const run =
        supervision ??
        (await api.startSupervision(map.id, { learnerName: learner.trim() || "New hire" }))
      setSupervision(run)
      setStream(media)
      if (agent.mode === "idle" || agent.mode === "error") startVoice(run)
    } catch (e) {
      media.getTracks().forEach((t) => t.stop())
      setShareError(message(e))
    } finally {
      setStarting(false)
    }
  }

  function end() {
    stream?.getTracks().forEach((t) => t.stop())
    setStream(undefined)
    agent.stop()
    setEnded(true)
    setBanner(undefined)
  }

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

  /* Chat ---------------------------------------------------------------- */

  const current = map.steps.find((s) => s.id === loop.currentStepId)

  async function send(text: string) {
    // With voice, a typed question goes to the same agent as a spoken one.
    if (agent.mode === "voice") {
      agent.type(text)
      return
    }
    add({ kind: "user", id: nextId("user"), at: Date.now(), text })
    try {
      // Typed questions see the screen too.
      const { answer, stepId } = await askScreen(text)
      add({
        kind: "agent",
        id: nextId("agent"),
        at: Date.now(),
        text: answer,
        stepIds: stepId ? [stepId] : [],
      })
    } catch (e) {
      add({
        kind: "agent",
        id: nextId("agent"),
        at: Date.now(),
        text: t("errors.lookupFailed", { message: message(e) }),
      })
    }
  }

  const items = useMemo(() => {
    const spoken = agent.transcript
      .filter((line) => line.role !== "app")
      .map((line): ChatItem => ({
        kind: line.role === "agent" ? "agent" : "user",
        id: `t-${line.id}`,
        at: line.at,
        text: line.text,
      }))
    return [...spoken, ...local].sort((a, b) => a.at - b.at)
  }, [agent.transcript, local])

  /* Graph ----------------------------------------------------------------- */

  const flagged = useMemo(
    () => [...new Set(warnings.flatMap((w) => (w.stepId ? [w.stepId] : [])))],
    [warnings],
  )
  // Not memoized: the labels are translated, and the diagram only redraws when the text changes.
  const chart = workMapToMermaid(map, {
    currentStepId: loop.currentStepId,
    doneStepIds: loop.completed,
    flaggedStepIds: flagged,
  })
  const clicks = Object.fromEntries(
    map.steps.map((step, i) => [stepNodeId(i), () => openStep(step.id)]),
  )

  const running = !!stream && !!supervision && !ended

  // A call can drop mid-run (network, ElevenLabs' call limit). Without this the learner silently
  // loses Socrates' voice, so reconnect while the run goes on.
  const reconnects = useRef(0)
  const wasLive = useRef(false)
  useEffect(() => {
    if (agent.mode === "voice") {
      wasLive.current = true
      return
    }
    if (agent.mode !== "idle" || !wasLive.current || !running || !supervision) return
    wasLive.current = false
    if (reconnects.current >= MAX_RECONNECTS) return
    reconnects.current += 1
    startVoice(supervision)
  }, [agent.mode, running, supervision, startVoice])

  const elapsed = useElapsed(supervision?.startedAt, running)
  const currentIndex = current ? map.steps.indexOf(current) : -1

  // Keep the learner's step in view as they move through a long graph (after Mermaid redraws).
  const graph = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (currentIndex < 0) return
    const timer = setTimeout(() => {
      graph.current
        ?.querySelector(`g.node[id*="-${stepNodeId(currentIndex)}-"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" })
    }, 400)
    return () => clearTimeout(timer)
  }, [currentIndex])
  const questions = items.filter((i) => i.kind === "user").length

  return (
    // Full-bleed under the app header: cancel <main>'s padding.
    <div className="-m-4 flex h-[calc(100svh-3.5rem)] flex-col md:-m-8">
      <LeaveGuard active={running} onLeave={end} />

      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3 md:px-6">
        <nav className="flex min-w-0 items-center gap-1.5 text-sm">
          <Link to={paths.library()} className="text-muted-foreground hover:text-foreground">
            {t("header.workflows")}
          </Link>
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          <Link
            to={paths.workMap(map.id)}
            className="truncate text-muted-foreground hover:text-foreground"
          >
            {map.title}
          </Link>
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="shrink-0 font-semibold">{t("header.supervisedRun")}</span>
        </nav>
        <span className="flex items-center gap-2 text-sm tabular-nums">
          <span
            className={cn(
              "size-2.5 rounded-full",
              running ? "animate-pulse bg-emerald-500" : "bg-muted-foreground/40",
            )}
          />
          {running
            ? t("header.supervising", { name: supervision?.learnerName })
            : ended
              ? t("header.runEnded")
              : supervision
                ? t("header.paused")
                : t("header.notStarted")}
          {supervision && <> · {formatTimestamp(elapsed)}</>}
        </span>
        <SocratesStatus agent={agent} />
        <div className="ml-auto flex items-center gap-2">
          {loop.checking && (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> {t("header.checkingSave")}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={openErp}>
            <ExternalLink /> {t("header.openErp")}
          </Button>
          {supervision && !ended && (
            <Button variant="destructive" size="sm" onClick={end}>
              <Square /> {t("header.endRun")}
            </Button>
          )}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[1fr_24rem]">
        {/* Left: the expert's workflow, lighting up as the learner works */}
        <section className="relative min-h-80 overflow-hidden bg-muted/20">
          {supervision ? (
            <>
              <div className="absolute inset-x-4 top-4 z-10 space-y-3">
                {ended ? (
                  <RunSummary
                    map={map}
                    done={loop.completed.length}
                    warnings={warnings.length}
                    questions={questions}
                  />
                ) : !stream ? (
                  <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-background p-3 shadow-sm">
                    <MonitorUp className="size-4 shrink-0 text-muted-foreground" />
                    <p className="min-w-0 flex-1 text-sm">{t("graph.sharingStopped")}</p>
                    <Button size="sm" onClick={() => void share()} disabled={starting}>
                      {starting && <Loader2 className="animate-spin" />} {t("graph.shareAgain")}
                    </Button>
                  </div>
                ) : (
                  <span className="inline-flex max-w-full items-center gap-2 rounded-full border bg-background px-3 py-1 text-sm shadow-sm">
                    <span className="size-2 shrink-0 rounded-full bg-blue-600" />
                    <span className="truncate">
                      {current
                        ? t("graph.currentStep", {
                            index: currentIndex + 1,
                            total: map.steps.length,
                            title: current.title,
                          })
                        : t("graph.startWorking")}
                    </span>
                  </span>
                )}
                {banner && tab !== "chat" && (
                  <WarningBanner
                    warning={banner}
                    expert={expertFirst}
                    onOpen={() => setTab("chat")}
                    onClose={() => setBanner(undefined)}
                  />
                )}
              </div>
              <div ref={graph} className="size-full">
                <MermaidDiagram
                  chart={chart}
                  onNodeClick={clicks}
                  className="size-full p-8 pt-24"
                />
              </div>
            </>
          ) : (
            <StartPanel
              map={map}
              learner={learner}
              onLearner={setLearner}
              onShare={() => void share()}
              starting={starting}
              error={shareError}
            />
          )}
          {supervision && shareError && (
            <p className="absolute bottom-4 left-4 text-sm text-destructive">{shareError}</p>
          )}
        </section>

        {/* Right: the chat, or what the mentor did */}
        <aside className="flex min-h-0 flex-col border-t lg:border-t-0 lg:border-l">
          <div className="flex items-center gap-3 border-b px-4 py-3">
            {stream && (
              <div className="aspect-video w-16 shrink-0 overflow-hidden rounded border bg-muted">
                <ScreenPreview stream={stream} onVideo={setVideo} />
              </div>
            )}
            <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="min-w-0 flex-1">
              <TabsList className="w-full">
                <TabsTrigger value="chat">
                  <MessageCircle /> {t("tabs.chat")}
                </TabsTrigger>
                <TabsTrigger value="mentor">
                  <Footprints /> {t("tabs.mentor", { expert: expertFirst })}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          {loop.error && (
            <p className="border-b px-4 py-2 text-xs text-destructive">{loop.error}</p>
          )}
          {supervision && !ended && agent.mode !== "voice" && agent.mode !== "connecting" && (
            <div className="flex items-center gap-3 border-b bg-amber-500/5 px-4 py-2 text-xs">
              <MicOff className="size-4 shrink-0 text-amber-600" />
              <p className="min-w-0 flex-1">
                {agent.error
                  ? t("voice.cantHear", { error: agent.error })
                  : agent.mode === "idle"
                    ? t("voice.disconnected")
                    : t("voice.notSetUp")}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  reconnects.current = 0
                  startVoice(supervision)
                }}
              >
                <Mic /> {t("voice.turnOn")}
              </Button>
            </div>
          )}
          {tab === "chat" ? (
            <ChatPanel
              map={map}
              items={items}
              thinking={thinking}
              canSend={!!supervision && !ended}
              mute={
                agent.mode === "voice"
                  ? { muted: agent.muted, onToggle: () => agent.setMuted(!agent.muted) }
                  : undefined
              }
              onSend={(text) => void send(text)}
              onTyping={agent.activity}
              onOpenStep={openStep}
            />
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <p className="border-b px-4 py-2 text-xs text-muted-foreground">
                {t("mentor.intro", { expert: map.expert.name })}
              </p>
              <MentorSteps
                map={map}
                currentStepId={loop.currentStepId}
                completed={loop.completed}
                flagged={flagged}
                openId={openStepId}
                onToggle={(id) => setOpenStepId((open) => (open === id ? undefined : id))}
              />
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

function StartPanel({
  map,
  learner,
  onLearner,
  onShare,
  starting,
  error,
}: {
  map: WorkMap
  learner: string
  onLearner: (name: string) => void
  onShare: () => void
  starting: boolean
  error?: string
}) {
  const { t } = useTranslation("supervise")
  const expertFirst = map.expert.name.split(" ")[0]
  return (
    <div className="flex size-full flex-col items-center justify-center gap-5 p-8 text-center">
      <ShieldCheck className="size-10 text-muted-foreground" />
      <div className="max-w-md space-y-1">
        <p className="font-medium">{t("start.title")}</p>
        <p className="text-sm text-muted-foreground">
          <Trans
            t={t}
            i18nKey="start.description"
            values={{ expert: expertFirst }}
            components={{ strong: <strong /> }}
          />
        </p>
      </div>
      <form
        className="flex flex-wrap items-end justify-center gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          onShare()
        }}
      >
        <div className="space-y-1.5 text-left">
          <Label htmlFor="learner">{t("start.yourName")}</Label>
          <Input id="learner" value={learner} onChange={(e) => onLearner(e.target.value)} />
        </div>
        <Button type="submit" disabled={starting || !learner.trim()}>
          {starting ? <Loader2 className="animate-spin" /> : <MonitorUp />} {t("start.share")}
        </Button>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

function WarningBanner({
  warning,
  expert,
  onOpen,
  onClose,
}: {
  warning: SupervisorWarning
  expert: string
  onOpen: () => void
  onClose: () => void
}) {
  const { t } = useTranslation("supervise")
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-background p-3 shadow-sm">
      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
      <div className="min-w-0 flex-1 space-y-1 text-sm">
        <p className="font-medium">
          {warning.source === "save"
            ? t("warningBanner.wouldStop", { expert })
            : t("warningBanner.headsUp")}
        </p>
        <p>{warning.message}</p>
        <button type="button" onClick={onOpen} className="text-xs underline">
          {t("warningBanner.openChat")}
        </button>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        onClick={onClose}
        aria-label={t("warningBanner.dismiss")}
      >
        <X />
      </Button>
    </div>
  )
}

function RunSummary({
  map,
  done,
  warnings,
  questions,
}: {
  map: WorkMap
  done: number
  warnings: number
  questions: number
}) {
  const { t } = useTranslation("supervise")
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-600/30 bg-background p-3 shadow-sm">
      <ShieldCheck className="size-4 shrink-0 text-emerald-600" />
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-medium">{t("runSummary.finished")}</span>{" "}
        {t("runSummary.stepsDone", { done, total: map.steps.length })} ·{" "}
        {t("runSummary.headsUps", { count: warnings })} ·{" "}
        {t("runSummary.questionsAsked", { count: questions })}
      </p>
      <Button size="sm" variant="outline" asChild>
        <Link to={paths.workMap(map.id)}>{t("runSummary.back")}</Link>
      </Button>
    </div>
  )
}

/** Compact voice status for the header: Socrates stands by, answers when asked. */
function SocratesStatus({ agent }: { agent: VoiceAgent }) {
  const { t } = useTranslation("supervise")
  const icon =
    agent.mode === "voice" ? (
      agent.muted ? (
        <MicOff className="size-3.5 text-destructive" />
      ) : (
        <Mic className={cn("size-3.5", agent.agentSpeaking && "text-primary")} />
      )
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
        ? t("status.speaking")
        : agent.muted
          ? t("status.muted")
          : t("status.standingBy")
      : agent.mode === "connecting"
        ? t("status.connecting")
        : agent.mode === "text"
          ? t("status.typing")
          : t("status.voiceOff")
  return (
    <span className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
      {icon}
      <span className="shrink-0">{label}</span>
    </span>
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
    // Rejects if the stream stops before playback starts; nothing to do then.
    video.play().catch(() => {})
    onVideo(video)
    return () => onVideo(null)
  }, [stream, onVideo])
  return <video ref={ref} muted playsInline className="size-full object-contain" />
}

function useElapsed(startedAt: string | undefined, running: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [running])
  return startedAt ? Math.max(0, (now - Date.parse(startedAt)) / 1000) : 0
}

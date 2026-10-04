import { useCallback, useEffect, useRef, useState } from "react"

import {
  api,
  type Chattiness,
  type ErpSignal,
  type ID,
  type LiveQuestion,
  type LiveStep,
} from "@/lib/api"
import { changed, grabFrame } from "@/lib/capture/screen"
import { openErpChannel } from "@/lib/erp/bridge"
import type { VoiceAgent } from "@/lib/voice/use-voice-agent"

/* When to ask (AGENTS.md §4.7) ---------------------------------------- */
const TICK_MS = 1500
/** Don't ask while the expert types or speaks, or within this long after. */
const QUIET_MS = 2000
/**
 * Ask little: 3–5 live questions per 10 minutes (Balanced). A Silent observer asks only about
 * guardrails and rarely; an Active coach asks more often. The rest waits for the debrief.
 */
const PACING: Record<
  Chattiness,
  { maxPer10Min: number; minGapMs: number; guardrailsOnly: boolean }
> = {
  quiet: { maxPer10Min: 2, minGapMs: 120_000, guardrailsOnly: true },
  normal: { maxPer10Min: 5, minGapMs: 40_000, guardrailsOnly: false },
  curious: { maxPer10Min: 8, minGapMs: 20_000, guardrailsOnly: false },
}
/** A queued question expires after this long, or as soon as the screen moves on. */
const QUESTION_TTL_MS = 30_000
/** Expert speech within this long after a question counts as the answer. */
const ANSWER_WINDOW_MS = 45_000

interface Queued extends LiveQuestion {
  queuedAt: number
}

export interface LoopStats {
  sent: number
  skipped: number
  dropped: number
  visionMs?: number
}

/**
 * Drives one live capture session: samples the shared screen, forwards ERP
 * signals, and decides when the agent may ask a question.
 */
export function useCaptureLoop({
  sessionId,
  startedAt,
  video,
  live,
  agent,
  chattiness = "normal",
  onSteps,
}: {
  sessionId: ID
  /** ISO start time; `at` is seconds since then. */
  startedAt: string
  video: HTMLVideoElement | null
  /** Capturing and on the record. */
  live: boolean
  agent: VoiceAgent
  /** The expert's coaching style: how often Socrates may interrupt. */
  chattiness?: Chattiness
  /** Fresh step list after a tick that changed it. */
  onSteps?: (steps: LiveStep[]) => void
}) {
  const [queue, setQueue] = useState<Queued[]>([])
  const [screen, setScreen] = useState<string>()
  const [error, setError] = useState<string>()
  const [stats, setStats] = useState<LoopStats>({ sent: 0, skipped: 0, dropped: 0 })
  /** The question shown for a typed answer when there's no voice. */
  const [textQuestion, setTextQuestion] = useState<LiveQuestion>()

  const erpBuffer = useRef<ErpSignal[]>([])
  const typing = useRef(false)
  const lastTypingAt = useRef(0)
  const busy = useRef(false)
  const lastThumb = useRef<Uint8ClampedArray>(undefined)
  const askedAt = useRef<number[]>([])
  const pendingAnswer = useRef<{ questionId: ID; until: number }>(undefined)
  // Source of truth for the queue; `queue` state only mirrors it for rendering.
  const queueRef = useRef<Queued[]>([])
  const screenRef = useRef<string>(undefined)

  const at = useCallback(() => (Date.now() - Date.parse(startedAt)) / 1000, [startedAt])

  // Exact signals from the mock ERP: typing (never interrupt) and field changes (precise events).
  const agentRef = useRef(agent)
  const onStepsRef = useRef(onSteps)
  const chattinessRef = useRef(chattiness)
  useEffect(() => {
    agentRef.current = agent
    onStepsRef.current = onSteps
    chattinessRef.current = chattiness
  })
  useEffect(() => {
    if (!live) return
    const channel = openErpChannel((m) => {
      const t = at()
      if (m.type === "typing") {
        typing.current = m.active
        lastTypingAt.current = Date.now()
      } else if (m.type === "screen") {
        erpBuffer.current.push({ at: t, kind: "navigate", text: `Opened ${m.screen}` })
      } else if (m.type === "field_change") {
        const text = `Invoice ${m.invoiceId}: ${m.label} changed ${m.from} → ${m.to}`
        erpBuffer.current.push({ at: t, kind: "field_change", text })
        agentRef.current.context(`Screen: ${text}`)
      } else if (m.type === "action") {
        erpBuffer.current.push({ at: t, kind: "action", text: m.summary })
        agentRef.current.context(`Screen: ${m.summary}`)
      }
    })
    return () => channel.close()
  }, [live, at])

  // Tick loop: one vision call at a time; frames that arrive meanwhile are dropped, not queued.
  useEffect(() => {
    if (!live || !video) return
    const timer = setInterval(async () => {
      if (busy.current) {
        setStats((s) => ({ ...s, dropped: s.dropped + 1 }))
        return
      }
      const frame = grabFrame(video)
      if (!frame) return
      const erp = erpBuffer.current.splice(0)
      const frameChanged = changed(lastThumb.current, frame.thumb)
      if (!frameChanged && erp.length === 0) {
        setStats((s) => ({ ...s, skipped: s.skipped + 1 }))
        return
      }
      lastThumb.current = frame.thumb
      busy.current = true
      const t0 = performance.now()
      try {
        const result = await api.postTick(sessionId, {
          at: at(),
          image: frame.base64,
          typing: typing.current,
          speaking: agentRef.current.msSinceUserVoice() < QUIET_MS,
          erp,
        })
        setError(undefined)
        setStats((s) => ({
          ...s,
          sent: s.sent + 1,
          visionMs: result.processed ? Math.round(performance.now() - t0) : s.visionMs,
        }))
        if (result.steps) onStepsRef.current?.(result.steps)
        if (result.screen) {
          screenRef.current = result.screen
          setScreen(result.screen)
        }
        for (const e of result.events.filter((e) => e.important)) {
          agentRef.current.context(`Screen: ${e.text}`)
        }
        if (result.questions.length) {
          queueRef.current = [
            ...queueRef.current,
            ...result.questions.map((x) => ({ ...x, queuedAt: Date.now() })),
          ]
          setQueue(queueRef.current)
        }
      } catch (e) {
        erpBuffer.current.unshift(...erp)
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        busy.current = false
      }
    }, TICK_MS)
    return () => clearInterval(timer)
  }, [live, video, sessionId, at])

  // Scheduler: ask the oldest valid question at the next natural pause.
  useEffect(() => {
    if (!live) return
    const timer = setInterval(() => {
      const now = Date.now()
      // Expired questions aren't lost: the server keeps them for the debrief.
      const valid = queueRef.current.filter(
        (q) =>
          now - q.queuedAt < QUESTION_TTL_MS &&
          (!screenRef.current || q.screen === "current" || q.screen === screenRef.current),
      )
      if (valid.length !== queueRef.current.length) {
        queueRef.current = valid
        setQueue(valid)
      }
      const a = agentRef.current
      const recent = askedAt.current.filter((t) => now - t < 10 * 60_000)
      const quiet =
        !typing.current &&
        now - lastTypingAt.current > QUIET_MS &&
        a.msSinceUserVoice() > QUIET_MS &&
        !a.agentSpeaking
      const pacing = PACING[chattinessRef.current]
      const allowed =
        recent.length < pacing.maxPer10Min && now - (recent.at(-1) ?? 0) > pacing.minGapMs && quiet
      // Other questions stay queued until they expire; the server keeps them for the debrief.
      const next = valid.find((q) => !pacing.guardrailsOnly || q.guardrail)
      if (!next || !allowed) return

      const rest = valid.filter((q) => q !== next)
      queueRef.current = rest
      setQueue(rest)
      askedAt.current = [...recent, now]
      pendingAnswer.current = { questionId: next.id, until: now + ANSWER_WINDOW_MS }
      if (!a.prompt(`[QUESTION id=${next.id}] ${next.question}`)) setTextQuestion(next)
      a.note(`Asked at a pause: ${next.question}`)
      void api.recordEvent(sessionId, {
        at: at(),
        kind: "question",
        text: next.question,
        questionId: next.id,
      })
    }, 500)
    return () => clearInterval(timer)
  }, [live, sessionId, at])

  /** Store what the expert said: the answer to the last question, or narration. */
  const recordSpeech = useCallback(
    (text: string) => {
      const pending = pendingAnswer.current
      const questionId = pending && Date.now() < pending.until ? pending.questionId : undefined
      void api.recordEvent(sessionId, { at: at(), kind: "speech", text, questionId })
    },
    [sessionId, at],
  )

  const answerTextQuestion = useCallback(
    (text: string) => {
      if (!textQuestion) return
      void api.recordEvent(sessionId, {
        at: at(),
        kind: "speech",
        text,
        questionId: textQuestion.id,
      })
      setTextQuestion(undefined)
    },
    [sessionId, at, textQuestion],
  )

  return {
    queue,
    screen,
    error,
    stats,
    textQuestion,
    answerTextQuestion,
    dismissTextQuestion: () => setTextQuestion(undefined),
    recordSpeech,
    at,
  }
}

import { useCallback, useEffect, useRef, useState } from "react"

import { api, type ErpSignal, type ID, type SupervisorWarning, type WorkMap } from "@/lib/api"
import { changed, grabFrame } from "@/lib/capture/screen"
import { ACTION_LABEL, openErpChannel } from "@/lib/erp/bridge"
import type { VoiceAgent } from "@/lib/voice/use-voice-agent"

const TICK_MS = 1500
const GATE_HEARTBEAT_MS = 2000
/** Don't talk over the learner: wait until they've been quiet this long. */
const QUIET_MS = 1200
/** A heads-up nobody could say in time is dropped from the voice queue (the chat keeps it). */
const WARNING_TTL_MS = 30_000
/** A held save and the vision model often spot the same mistake: say it once. */
const SAME_WARNING_MS = 60_000

interface Spoken {
  text: string
  queuedAt: number
}

/**
 * Drives one supervised run: samples the shared screen, tracks where the
 * learner is in the Work Map, holds ERP saves that break the expert's rules,
 * and has the agent speak up only for a heads-up, at the next quiet moment.
 */
export function useSuperviseLoop({
  supervisionId,
  startedAt,
  map,
  video,
  live,
  agent,
  onWarning,
}: {
  supervisionId?: ID
  /** ISO start time; `at` is seconds since then. */
  startedAt?: string
  map: WorkMap
  video: HTMLVideoElement | null
  /** Screen shared and the run not ended. */
  live: boolean
  agent: VoiceAgent
  onWarning: (warning: SupervisorWarning) => void
}) {
  const [currentStepId, setCurrentStepId] = useState<ID>()
  const [completed, setCompleted] = useState<ID[]>([])
  const [error, setError] = useState<string>()
  const [checking, setChecking] = useState(false)

  const erpBuffer = useRef<ErpSignal[]>([])
  const busy = useRef(false)
  const lastThumb = useRef<Uint8ClampedArray>(undefined)
  const currentRef = useRef<ID>(undefined)
  const recent = useRef<{ key: string; at: number }[]>([])
  const voiceQueue = useRef<Spoken[]>([])

  const at = useCallback(
    () => (startedAt ? (Date.now() - Date.parse(startedAt)) / 1000 : 0),
    [startedAt],
  )

  // Handlers change every render; the effects below always call the latest.
  const agentRef = useRef(agent)
  const onWarningRef = useRef(onWarning)
  useEffect(() => {
    agentRef.current = agent
    onWarningRef.current = onWarning
  })

  const expertFirst = map.expert.name.split(" ")[0]

  /** Shows a heads-up and queues it for the voice, unless it was just given. */
  const warn = useCallback(
    (warning: SupervisorWarning, voice: string) => {
      const now = Date.now()
      const key = warning.stepId ?? warning.message
      recent.current = recent.current.filter((r) => now - r.at < SAME_WARNING_MS)
      if (warning.source === "screen" && recent.current.some((r) => r.key === key)) return
      recent.current.push({ key, at: now })
      onWarningRef.current(warning)
      const quote = warning.quote ? ` ${expertFirst}'s own words: "${warning.quote.text}"` : ""
      const step = warning.stepId ? ` Step id: ${warning.stepId}.` : ""
      voiceQueue.current.push({ text: `${voice} ${warning.message}${quote}${step}`, queuedAt: now })
    },
    [expertFirst],
  )

  // ERP: exact signals for the tick, plus the save gate.
  useEffect(() => {
    if (!live || !supervisionId) return
    const channel = openErpChannel(async (m) => {
      const t = at()
      const a = agentRef.current
      if (m.type === "screen") {
        erpBuffer.current.push({ at: t, kind: "navigate", text: `Opened ${m.screen}` })
        a.context(`Screen: the learner opened ${m.screen}`)
      } else if (m.type === "field_change") {
        const text = `Invoice ${m.invoiceId}: ${m.label} changed ${m.from} → ${m.to}`
        erpBuffer.current.push({ at: t, kind: "field_change", text })
        a.context(`Screen: ${text}`)
      } else if (m.type === "action") {
        erpBuffer.current.push({ at: t, kind: "action", text: m.summary })
        a.context(`Screen: ${m.summary}`)
      } else if (m.type === "save_request") {
        channel.send({ type: "save_pending", requestId: m.requestId })
        setChecking(true)
        try {
          const verdict = await api.checkDecision(map.id, { action: m.action, record: m.record })
          channel.send({
            type: "save_decision",
            requestId: m.requestId,
            allow: verdict.allow,
            message: verdict.message,
          })
          if (!verdict.allow) {
            const what = `${ACTION_LABEL[m.action]} on invoice ${m.invoiceId}`
            warn(
              {
                id: `save-${m.requestId}`,
                at: t,
                source: "save",
                message: verdict.message,
                stepId: verdict.stepId,
                guardrailId: verdict.guardrailId,
                quote: verdict.quote,
                screen: verdict.screen,
              },
              `[HOLD] The learner tried: ${what}. The ERP is holding it.`,
            )
          }
        } catch (e) {
          // Never trap the learner: if the check fails, let the save through.
          channel.send({ type: "save_decision", requestId: m.requestId, allow: true, message: "" })
          a.note(`Check failed: ${e instanceof Error ? e.message : String(e)}`)
        } finally {
          setChecking(false)
        }
      }
    })
    const beat = () => channel.send({ type: "gate", active: true, tutor: "Socrates" })
    beat()
    const timer = setInterval(beat, GATE_HEARTBEAT_MS)
    return () => {
      clearInterval(timer)
      channel.send({ type: "gate", active: false, tutor: "Socrates" })
      channel.close()
    }
  }, [live, supervisionId, map.id, at, warn])

  // Tick loop: one vision call at a time; frames that arrive meanwhile are dropped, not queued.
  useEffect(() => {
    if (!live || !video || !supervisionId) return
    const timer = setInterval(async () => {
      if (busy.current) return
      const frame = grabFrame(video)
      if (!frame) return
      const erp = erpBuffer.current.splice(0)
      if (!changed(lastThumb.current, frame.thumb) && erp.length === 0) return
      lastThumb.current = frame.thumb
      busy.current = true
      try {
        const result = await api.postSupervisionTick(supervisionId, {
          at: at(),
          image: frame.base64,
          typing: false,
          speaking: agentRef.current.msSinceUserVoice() < QUIET_MS,
          erp,
        })
        setError(undefined)
        if (!result.processed) {
          // Dropped while the server was busy (it keeps the signals): resend the next frame.
          lastThumb.current = undefined
          return
        }
        setCompleted(result.completedStepIds)
        if (result.currentStepId && result.currentStepId !== currentRef.current) {
          currentRef.current = result.currentStepId
          setCurrentStepId(result.currentStepId)
          const index = map.steps.findIndex((s) => s.id === result.currentStepId)
          const step = map.steps[index]
          if (step) {
            agentRef.current.context(
              `Progress: the learner is on step ${index + 1} [${step.id}] "${step.title}".`,
            )
          }
        }
        if (result.action) agentRef.current.context(`Screen: ${result.action}`)
        if (result.warning) warn(result.warning, "[WARNING]")
      } catch (e) {
        erpBuffer.current.unshift(...erp)
        lastThumb.current = undefined
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        busy.current = false
      }
    }, TICK_MS)
    return () => clearInterval(timer)
  }, [live, video, supervisionId, map.steps, at, warn])

  // Speak a heads-up at the next quiet moment; never over the learner or over itself.
  useEffect(() => {
    if (!live) return
    const timer = setInterval(() => {
      const now = Date.now()
      voiceQueue.current = voiceQueue.current.filter((w) => now - w.queuedAt < WARNING_TTL_MS)
      const a = agentRef.current
      const next = voiceQueue.current[0]
      if (!next || a.mode !== "voice") return
      if (a.agentSpeaking || a.msSinceUserVoice() < QUIET_MS) return
      voiceQueue.current.shift()
      a.prompt(next.text)
    }, 500)
    return () => clearInterval(timer)
  }, [live])

  return { currentStepId, completed, error, checking }
}

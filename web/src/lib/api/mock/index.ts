import type { SocratesApi } from "../client"
import type {
  AskResponse,
  CaptureStatus,
  Citation,
  SessionEvent,
  WorkMap,
  WorkMapStep,
  WorkMapSummary,
} from "../types"
import { LIVE_SESSION_ID, liveScript, sessions, workMaps } from "./fixtures"

/** In-memory backend so the UI works before the real one exists. */

const delay = (ms = 250) => new Promise((r) => setTimeout(r, ms))

function notFound(what: string): never {
  throw new Error(`${what} not found`)
}

function toSummary(map: WorkMap): WorkMapSummary {
  return {
    id: map.id,
    title: map.title,
    summary: map.summary,
    domain: map.domain,
    expert: map.expert,
    status: map.status,
    updatedAt: map.updatedAt,
    stepCount: map.steps.length,
    judgmentCount: map.steps.filter((s) => s.kind === "judgment").length,
    guardrailCount: map.steps.reduce((n, s) => n + s.guardrails.length, 0),
    openQuestionCount: map.debrief.filter((d) => !d.resolved).length,
    cover: map.steps[0]?.screen,
  }
}

/* Live capture ------------------------------------------------------ */

const liveStartedAt = Date.parse(sessions.find((s) => s.id === LIVE_SESSION_ID)!.startedAt)
const elapsedSec = () => Math.floor((Date.now() - liveStartedAt) / 1000)
const offRecordEvents: SessionEvent[] = []

let captureStatus: CaptureStatus = {
  extensionConnected: true,
  signals: { screen: true, microphone: true, keystrokes: true },
  offTheRecord: false,
  liveSessionId: LIVE_SESSION_ID,
}

function liveEvents(): SessionEvent[] {
  const t = elapsedSec()
  const scripted = liveScript
    .filter((e) => e.at <= t)
    .map((e, i) => ({ ...e, id: `live-${i}`, sessionId: LIVE_SESSION_ID }))
  return [...scripted, ...offRecordEvents].sort((a, b) => a.at - b.at)
}

/* Ask --------------------------------------------------------------- */

const STOPWORDS = new Set(
  "a an and are be do does for how i if in is it of on or should the this to what when where which who why with you".split(
    " ",
  ),
)
const tokenize = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9€äöüß]+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))

function stepText(step: WorkMapStep) {
  return [
    step.title,
    step.decision,
    step.reason?.text,
    step.screen.caption,
    ...step.guardrails.map((g) => g.rule),
    ...step.edgeCases.flatMap((e) => [e.when, e.then]),
  ].join(" ")
}

function answer(question: string, scope: WorkMap[]): AskResponse {
  const terms = tokenize(question)
  const ranked = scope
    .flatMap((map) => map.steps.map((step) => ({ map, step })))
    .map((hit) => {
      const words = new Set(tokenize(stepText(hit.step)))
      return { ...hit, score: terms.filter((t) => words.has(t)).length }
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    // Only cite runners-up that are nearly as relevant as the best hit.
    .filter((hit, _, all) => hit.score >= all[0].score / 2 + 0.5)
    .slice(0, 2)

  if (ranked.length === 0) {
    const experts = [...new Set(scope.map((m) => m.expert.name))].join(" or ")
    return {
      answer: `I couldn't find that in the recorded workflows yet. I've noted it so ${experts} can be asked in the next debrief.`,
      citations: [],
    }
  }

  const { map, step } = ranked[0]
  const parts = [`${map.expert.name} covers this in “${step.title}”: ${step.decision}`]
  if (step.reason) parts.push(`In their words: “${step.reason.text}”`)
  const rules = step.guardrails.map((g) => g.rule)
  if (rules.length) parts.push(`Watch out: ${rules.join(" ")}`)

  const citations: Citation[] = ranked.map(({ map, step }) => ({
    workMapId: map.id,
    workMapTitle: map.title,
    stepId: step.id,
    stepTitle: step.title,
  }))
  return { answer: parts.join("\n\n"), citations }
}

/* API --------------------------------------------------------------- */

export const mockApi: SocratesApi = {
  async listWorkMaps() {
    await delay()
    return workMaps.map(toSummary)
  },

  async getWorkMap(id) {
    await delay()
    return workMaps.find((m) => m.id === id) ?? notFound(`Work map ${id}`)
  },

  async listSessions() {
    await delay()
    return sessions.map((s) => {
      if (s.id !== LIVE_SESSION_ID) return s
      const events = liveEvents()
      return {
        ...s,
        durationSec: elapsedSec(),
        eventCount: events.length,
        questionsAsked: events.filter((e) => e.kind === "question").length,
      }
    })
  },

  async listSessionEvents(sessionId) {
    await delay(100)
    return sessionId === LIVE_SESSION_ID ? liveEvents() : []
  },

  async getCaptureStatus() {
    await delay(100)
    return captureStatus
  },

  async setOffTheRecord(offTheRecord) {
    await delay(150)
    captureStatus = { ...captureStatus, offTheRecord }
    offRecordEvents.push({
      id: `off-${offRecordEvents.length}`,
      sessionId: LIVE_SESSION_ID,
      at: elapsedSec(),
      kind: "off_record",
      text: offTheRecord
        ? "Expert went off the record — nothing is captured"
        : "Back on the record",
    })
    return captureStatus
  },

  async ask({ question, workMapId }) {
    await delay(600)
    const scope = workMapId ? workMaps.filter((m) => m.id === workMapId) : workMaps
    return answer(question, scope)
  },
}

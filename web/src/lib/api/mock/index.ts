import type { SocratesApi } from "../client"
import { toSummary } from "../summary"
import type {
  CaptureSession,
  CaptureStatus,
  DecisionVerdict,
  ErpSignal,
  ID,
  LiveQuestion,
  LiveStep,
  Quote,
  SessionEvent,
  SupervisionSession,
  WorkMap,
} from "../types"
import { answer } from "./ask"
import { draftWorkflow } from "./draft"
import {
  LIVE_SESSION_ID,
  sessions as fixtureSessions,
  workMaps as fixtureWorkMaps,
} from "./fixtures"

/**
 * In-memory backend so the whole flow (capture → debrief → teach) runs without
 * the server or any API key. No vision or voice here: ERP signals become events
 * and the agent's questions are canned.
 */

const delay = (ms = 250) => new Promise((r) => setTimeout(r, ms))
let seq = 0
const id = (prefix: string) => `${prefix}-${++seq}`

function notFound(what: string): never {
  throw new Error(`${what} not found`)
}

const workMaps: WorkMap[] = structuredClone(fixtureWorkMaps)
const sessions: CaptureSession[] = fixtureSessions.filter((s) => s.id !== LIVE_SESSION_ID)
const events = new Map<ID, SessionEvent[]>()
const startedAt = new Map<ID, number>()
const lastQuestionAt = new Map<ID, number>()
const liveSteps = new Map<ID, LiveStep[]>()

/** Like the vision model: every decision in the ERP becomes a step. */
function addToSteps(sid: ID, signal: ErpSignal) {
  if (signal.kind === "navigate") return
  const steps = liveSteps.get(sid) ?? []
  liveSteps.set(sid, steps)
  steps.push({
    id: id("st"),
    at: signal.at,
    title: signal.text,
    kind: signal.kind === "action" ? "judgment" : "routine",
    decision: signal.text,
    screenshotUrl: "/mock/erp-invoice-4471.svg",
  })
}

let captureStatus: CaptureStatus = {
  active: false,
  signals: { screen: false, microphone: false, erp: false },
  offTheRecord: false,
}

const findMap = (mapId: ID) => workMaps.find((m) => m.id === mapId) ?? notFound(`Work map ${mapId}`)
const findSession = (sid: ID) => sessions.find((s) => s.id === sid) ?? notFound(`Session ${sid}`)
const elapsed = (sid: ID) => Math.round((Date.now() - (startedAt.get(sid) ?? Date.now())) / 1000)

function push(sessionId: ID, event: Omit<SessionEvent, "id" | "sessionId">) {
  const list = events.get(sessionId) ?? []
  const full = { id: id("ev"), sessionId, ...event }
  list.push(full)
  events.set(sessionId, list)
  findSession(sessionId).eventCount = list.length
  return full
}

/* Teach: rule-of-thumb checks that mirror Sabine's guardrails ---------- */

function verdict(map: WorkMap, action: string, record: Record<string, unknown>): DecisionVerdict {
  const step = (stepId: string) => map.steps.find((s) => s.id === stepId)
  const block = (stepId: string, message: string, guardrailId?: string): DecisionVerdict => {
    const s = step(stepId)
    const guardrail = s?.guardrails.find((g) => g.id === guardrailId)
    return {
      allow: false,
      message,
      stepId: s?.id,
      guardrailId: guardrail?.id,
      quote: guardrail?.quote ?? s?.reason,
      screen: s?.screen,
    }
  }
  const amount = Number(
    String(record.netAmount ?? "0")
      .replace(/[^\d,]/g, "")
      .replace(",", "."),
  )
  const account = String(record.account ?? "")
  const capex = account.includes("capex")
  if (
    action === "post" &&
    amount > 5000 &&
    !capex &&
    /equipment|machin|pump|spindle/i.test(String(record.description))
  ) {
    return block(
      "s4",
      `${map.expert.name} would stop here: this is equipment over €5,000. Where do you think it should be booked?`,
    )
  }
  if (action === "post" && capex && String(record.assetNumber).includes("empty")) {
    return block(
      "s4",
      "Capex without an asset number. What would you need first?",
      "g-asset-number",
    )
  }
  if (
    action === "post" &&
    record.intercompany === true &&
    String(record.secondApprover).includes("none")
  ) {
    return block(
      "s5",
      "This supplier is part of our group. What's different about posting it?",
      "g-intercompany",
    )
  }
  if (
    action === "post" &&
    /weber/i.test(String(record.supplier)) &&
    /-12-/.test(String(record.invoiceDate))
  ) {
    return block(
      "s6",
      "A Weber invoice in December, with the same route as an earlier one. What would you check first?",
    )
  }
  return { allow: true, message: "That's how it's done. Go ahead." }
}

/* Supervise: ERP signals stand in for vision -------------------------- */

interface Supervision extends SupervisionSession {
  currentStepId?: ID
  completed: Set<ID>
}

const supervisions = new Map<ID, Supervision>()

const words = (text: string) => new Set(text.toLowerCase().match(/[a-z0-9€]{4,}/g) ?? [])

/** Which step an ERP signal belongs to: fixed rules for the seeded AP map, word overlap otherwise. */
function stepForSignal(map: WorkMap, signal: ErpSignal): ID | undefined {
  const text = signal.text.toLowerCase()
  if (map.id === "wm-ap-month-end") {
    if (/invoice list/.test(text)) return "s1"
    if (/opened invoice \d+/.test(text)) return "s2"
    if (/account|cost center|asset/.test(text)) return "s4"
    if (/approver|approval/.test(text)) return "s5"
    if (/hold/.test(text)) return "s6"
    if (/posted/.test(text)) return "s7"
    return undefined
  }
  const said = words(signal.text)
  let best: { id: ID; score: number } | undefined
  for (const step of map.steps) {
    const score = [...words(`${step.title} ${step.decision}`)].filter((w) => said.has(w)).length
    if (score >= 2 && score > (best?.score ?? 0)) best = { id: step.id, score }
  }
  return best?.id
}

/* API --------------------------------------------------------------- */

export const mockApi: SocratesApi = {
  async listWorkMaps() {
    await delay()
    return workMaps.map(toSummary)
  },

  async getWorkMap(mapId) {
    await delay()
    return findMap(mapId)
  },

  async findRelatedWorkMaps(task) {
    await delay(400)
    const invoice = /invoice|rechnung|supplier|payable/i.test(task)
    return invoice ? workMaps.filter((m) => m.id === "wm-ap-month-end").map(toSummary) : []
  },

  async listSessions() {
    await delay()
    return sessions.map((s) =>
      s.status === "intake" || s.status === "live" ? { ...s, durationSec: elapsed(s.id) } : s,
    )
  },

  async getSession(sid) {
    await delay(100)
    return findSession(sid)
  },

  async createSession(input) {
    await delay()
    const session: CaptureSession = {
      id: id("ses"),
      title: input.title || input.task.slice(0, 60),
      task: input.task,
      expert: { id: id("p"), name: input.expertName, role: input.expertRole || "Expert" },
      startedAt: new Date().toISOString(),
      durationSec: 0,
      status: "intake",
      eventCount: 0,
      questionsAsked: 0,
    }
    sessions.unshift(session)
    startedAt.set(session.id, Date.now())
    captureStatus = {
      ...captureStatus,
      active: true,
      offTheRecord: false,
      liveSessionId: session.id,
    }
    return session
  },

  async updateSession(sid, patch) {
    await delay(100)
    const session = findSession(sid)
    if (patch.task) session.task = patch.task
    if (patch.basedOnWorkMapId !== undefined)
      session.basedOnWorkMapId = patch.basedOnWorkMapId ?? undefined
    if (patch.status === "live" && session.status === "intake") session.status = "live"
    return { ...session }
  },

  async listSessionEvents(sid) {
    await delay(100)
    return [...(events.get(sid) ?? [])]
  },

  async listLiveSteps(sid) {
    await delay(100)
    return structuredClone(liveSteps.get(sid) ?? [])
  },

  async recordEvent(sid, event) {
    await delay(50)
    if (captureStatus.offTheRecord && event.kind !== "off_record") {
      return { id: "not-recorded", sessionId: sid, ...event }
    }
    if (event.kind === "question") findSession(sid).questionsAsked += 1
    return push(sid, event)
  },

  async postTick(sid, tick) {
    await delay(300)
    if (captureStatus.offTheRecord) return { processed: false, events: [], questions: [] }
    tick.erp.forEach((signal) => addToSteps(sid, signal))
    const created = tick.erp.map((signal) =>
      push(sid, {
        at: signal.at,
        kind: "screen",
        text: signal.text,
        important: signal.kind !== "navigate",
      }),
    )
    const questions: LiveQuestion[] = []
    const change = tick.erp.find((s) => s.kind === "field_change" || s.kind === "action")
    if (change && tick.at - (lastQuestionAt.get(sid) ?? -999) > 45) {
      lastQuestionAt.set(sid, tick.at)
      questions.push({
        id: id("q"),
        question: `${change.text}. What made you decide that, and is there a case where you wouldn't?`,
        guardrail: true,
        at: tick.at,
        screen: "current",
      })
    }
    const steps = tick.erp.length ? structuredClone(liveSteps.get(sid) ?? []) : undefined
    return { processed: true, screen: "current", events: created, questions, steps }
  },

  async getCaptureStatus() {
    await delay(100)
    return captureStatus
  },

  async setCaptureStatus(patch) {
    await delay(50)
    captureStatus = {
      ...captureStatus,
      ...patch,
      signals: { ...captureStatus.signals, ...patch.signals },
    }
    return captureStatus
  },

  async setOffTheRecord(offTheRecord) {
    await delay(150)
    const sid = captureStatus.liveSessionId
    if (sid && offTheRecord !== captureStatus.offTheRecord && startedAt.has(sid)) {
      push(sid, {
        at: elapsed(sid),
        kind: "off_record",
        text: offTheRecord
          ? "Expert went off the record — nothing is captured"
          : "Back on the record",
      })
    }
    captureStatus = { ...captureStatus, offTheRecord }
    return captureStatus
  },

  async finishCapture(sid) {
    await delay(1200)
    const session = findSession(sid)
    if (session.workMapId) return findMap(session.workMapId)
    const important = (events.get(sid) ?? []).filter((e) => e.important)
    const screen = (at: number, caption: string) => ({
      sessionId: sid,
      at,
      screenshotUrl: "/mock/erp-invoice-4471.svg",
      caption,
    })
    const map: WorkMap = {
      id: id("wm"),
      title: session.title,
      summary: session.task ?? session.title,
      domain: "Accounts payable",
      trigger: "When the AP inbox has invoices due before the close.",
      expert: session.expert,
      status: "in_debrief",
      updatedAt: new Date().toISOString(),
      sessionIds: [sid],
      steps: (important.length ? important : [{ at: 0, text: "Work the task" }]).map((e, i) => ({
        id: `s${i + 1}`,
        title: e.text,
        kind: i % 2 ? "judgment" : "routine",
        screen: screen(e.at, e.text),
        decision: e.text,
        guardrails: [],
        edgeCases: [],
      })),
      debrief: [
        "Does the €5,000 limit apply per line or to the whole invoice?",
        "Who do you ask when you're unsure, and how fast do they usually answer?",
        "Is there a case where you'd post an invoice without a goods receipt?",
      ].map((question, i) => ({ id: `d${i + 1}`, question, resolved: false })),
    }
    workMaps.unshift(map)
    session.status = "awaiting_debrief"
    session.durationSec = elapsed(sid)
    session.workMapId = map.id
    captureStatus = { ...captureStatus, active: false }
    return map
  },

  async answerDebrief(mapId, itemId, reply) {
    await delay(200)
    const map = findMap(mapId)
    const item = map.debrief.find((d) => d.id === itemId) ?? notFound(`Question ${itemId}`)
    item.answer = {
      text: reply.text,
      speaker: map.expert,
      source: "debrief",
      prompt: item.question,
      at: reply.at,
    }
    item.resolved = true
    return structuredClone(map)
  },

  async requestTeachBack(mapId) {
    await delay(800)
    const map = findMap(mapId)
    const steps = map.steps.map((s) => s.title.toLowerCase()).join(", then ")
    map.teachBack = {
      summary: `Here's how I understand it: you ${steps}. Did I get that right?`,
      confirmed: false,
      corrections: map.teachBack?.corrections ?? [],
    }
    return structuredClone(map)
  },

  async replyTeachBack(mapId, reply) {
    await delay(800)
    const map = findMap(mapId)
    if (!map.teachBack) throw new Error("Request a teach-back first")
    if (reply.correction) {
      const correction: Quote = {
        text: reply.correction,
        speaker: map.expert,
        source: "debrief",
        prompt: "Did I get that right?",
        at: reply.at,
      }
      map.teachBack.corrections.push(correction)
    }
    if (reply.confirmed) {
      map.teachBack.confirmed = true
      if (map.debrief.every((d) => d.resolved)) {
        map.status = "confirmed"
        const session = sessions.find((s) => s.workMapId === map.id)
        if (session) session.status = "mapped"
      }
    }
    return structuredClone(map)
  },

  async checkDecision(mapId, check) {
    await delay(700)
    return verdict(findMap(mapId), check.action, check.record)
  },

  async startSupervision(mapId, { learnerName }) {
    await delay()
    findMap(mapId)
    const supervision: Supervision = {
      id: id("sup"),
      workMapId: mapId,
      learnerName: learnerName.trim() || "New hire",
      startedAt: new Date().toISOString(),
      completed: new Set(),
    }
    supervisions.set(supervision.id, supervision)
    const { workMapId, learnerName: name, startedAt: started } = supervision
    return { id: supervision.id, workMapId, learnerName: name, startedAt: started }
  },

  async postSupervisionTick(supervisionId, tick) {
    await delay(300)
    const supervision = supervisions.get(supervisionId) ?? notFound(`Supervision ${supervisionId}`)
    const map = findMap(supervision.workMapId)
    let action: string | undefined
    for (const signal of tick.erp) {
      if (signal.kind !== "navigate") action = signal.text
      const stepId = stepForSignal(map, signal)
      if (!stepId) continue
      // Moving on means the steps before this one are done.
      const index = map.steps.findIndex((s) => s.id === stepId)
      map.steps.slice(0, index).forEach((s) => supervision.completed.add(s.id))
      if (signal.kind === "action") supervision.completed.add(stepId)
      supervision.currentStepId = stepId
    }
    return {
      processed: true,
      screen: "current",
      currentStepId: supervision.currentStepId,
      completedStepIds: [...supervision.completed],
      action,
    }
  },

  async askAboutScreen(supervisionId, { question }) {
    // No vision in the mock: answer from the Work Map, anchored to where the ERP says they are.
    const supervision = supervisions.get(supervisionId) ?? notFound(`Supervision ${supervisionId}`)
    await delay(600)
    const map = findMap(supervision.workMapId)
    const { answer: text, citations } = answer(question, [map])
    const stepId = citations[0]?.stepId ?? supervision.currentStepId
    return { answer: text, stepId }
  },

  async getVoiceSession() {
    return null
  },

  async ask({ question, workMapId }) {
    await delay(600)
    const scope = workMapId ? workMaps.filter((m) => m.id === workMapId) : workMaps
    return answer(question, scope)
  },

  async draftWorkflow({ messages, title, description }) {
    await delay(600)
    return draftWorkflow(messages, title, description)
  },
}

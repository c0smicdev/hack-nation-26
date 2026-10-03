import type { SocratesApi } from "../client"
import { toSummary } from "../summary"
import type {
  CaptureSession,
  CaptureStatus,
  DecisionVerdict,
  ID,
  LiveQuestion,
  Quote,
  SessionEvent,
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
    return { processed: true, screen: "current", events: created, questions }
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

import { randomUUID } from "node:crypto"
import { assertProcessedImage, protectValue, type ProcessedFrame } from "./privacy.js"
import { claimResource, requireAccess, type ResourceAccess } from "./access.js"

import type {
  CaptureSession,
  CaptureStatus,
  ErpSignal,
  ID,
  Quote,
  ScreenMoment,
  SessionEvent,
  StepKind,
  WorkMap,
} from "../src/lib/api/types.js"

/**
 * In-memory storage. With SUPABASE_URL / SUPABASE_SECRET_KEY set, server/db.ts
 * syncs it with Supabase around every request; otherwise everything is lost on restart.
 */

/** A step candidate collected while the expert works; becomes a WorkMapStep after the debrief. */
export interface CandidateStep {
  id: ID
  at: number
  title: string
  kind: StepKind
  decision: string
  screen: ScreenMoment
  matchedStepId?: ID
  deviation?: boolean
}

/** Something the agent doesn't understand yet. Asked live or saved for the debrief. */
export interface OpenQuestion {
  id: ID
  at: number
  question: string
  stepId?: ID
  guardrail: boolean
  /** Only makes sense while this screen is visible. */
  screen?: string
  askedLive: boolean
  answer?: Quote
}

export interface Frame extends ProcessedFrame {
  sessionId: ID
  privacyVersion: number
}

export interface SessionRuntime {
  session: CaptureSession
  startedAtMs: number
  events: SessionEvent[]
  candidates: CandidateStep[]
  questions: OpenQuestion[]
  lastFrameId?: ID
  lastScreen?: string
  visionBusy: boolean
  /** ERP signals from ticks that were dropped while vision was busy. */
  pendingErp: ErpSignal[]
  /** Focus boxes still being located for candidate step screenshots. */
  pendingFocus: Set<Promise<void>>
  privacyVersion: number
  privacyController?: AbortController
  /** Draft workflow built at the end of capture. */
  draftWorkMapId?: ID
}

interface Store {
  workMaps: WorkMap[]
  sessions: Map<ID, SessionRuntime>
  frames: Map<ID, Frame>
  frameMetadata: Map<ID, Omit<Frame, "data">>
  access: Map<ID, ResourceAccess>
  captureStatus: CaptureStatus
}

function createStore(): Store {
  return {
    // Starts empty: the team's own confirmed workflows become the agent's memory.
    workMaps: [],
    sessions: new Map(),
    frames: new Map(),
    frameMetadata: new Map(),
    access: new Map(),
    captureStatus: {
      active: false,
      signals: { screen: false, microphone: false, erp: false },
      offTheRecord: false,
    },
  }
}

// Survives Vite's server-module reloads in dev, so editing a prompt doesn't wipe a session.
const globalStore = globalThis as { __socratesStore?: Store }
export const store: Store = (globalStore.__socratesStore ??= createStore())
store.access ??= new Map()
store.frameMetadata ??= new Map()

export const newId = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`

export function getRuntime(sessionId: ID): SessionRuntime {
  requireAccess(sessionId)
  const runtime = store.sessions.get(sessionId)
  if (!runtime) throw new HttpError(404, `Session ${sessionId} not found`)
  return runtime
}

export function getWorkMap(id: ID): WorkMap {
  requireAccess(id)
  const map = store.workMaps.find((m) => m.id === id)
  if (!map) throw new HttpError(404, `Workflow ${id} not found`)
  return map
}

export async function saveWorkMap(raw: WorkMap) {
  const map = await protectValue(raw)
  if (store.workMaps.some((m) => m.id === map.id)) requireAccess(map.id, true)
  else claimResource(map.id)
  const i = store.workMaps.findIndex((m) => m.id === map.id)
  if (i === -1) store.workMaps.unshift(map)
  else store.workMaps[i] = map
  return map
}

export function sessionAt(runtime: SessionRuntime) {
  return Math.max(0, (Date.now() - runtime.startedAtMs) / 1000)
}

export function addEvent(runtime: SessionRuntime, event: Omit<SessionEvent, "id" | "sessionId">) {
  const full: SessionEvent = { id: newId("ev"), sessionId: runtime.session.id, ...event }
  runtime.events.push(full)
  runtime.events.sort((a, b) => a.at - b.at)
  runtime.session.eventCount = runtime.events.length
  return full
}

export function saveFrame(frame: ProcessedFrame, sessionId: ID, privacyVersion: number) {
  assertProcessedImage(frame.data)
  const id = `fr-${randomUUID()}`
  store.frames.set(id, { ...frame, sessionId, privacyVersion })
  const metadata = {
    sessionId,
    privacyVersion,
    mime: frame.mime,
    width: frame.width,
    height: frame.height,
    redactions: frame.redactions,
    privacy: frame.privacy,
  }
  store.frameMetadata.set(id, metadata)
  return id
}

export const frameUrl = (frameId: ID) => `/api/frames/${frameId}`

export class HttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

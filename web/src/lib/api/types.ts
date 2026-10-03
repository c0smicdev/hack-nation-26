/**
 * Shared data contract between the frontend, the backend and the browser
 * extension. If you change a shape here, tell the others — the backend's
 * Work Map JSON (LLM output) must match these types.
 *
 * Conventions:
 * - Timestamps inside a session (`at`) are seconds since the session started.
 * - Wall-clock times are ISO 8601 strings.
 * - Rects are normalized to 0..1 relative to the screenshot size.
 */

export type ID = string

export interface Person {
  id: ID
  name: string
  role: string
}

/* ------------------------------------------------------------------ */
/* Work Map — the "brief, interactive document" for one workflow       */
/* ------------------------------------------------------------------ */

export type WorkMapStatus =
  /** Session captured, map generated, debrief not done yet. */
  | "draft"
  /** Debrief running / open questions remain. */
  | "in_debrief"
  /** Expert confirmed the teach-back. Safe to learn from. */
  | "confirmed"

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** A frame from the recording that a step or quote points to. */
export interface ScreenMoment {
  sessionId: ID
  /** Seconds since session start. */
  at: number
  /**
   * Should already be redacted server-side (e.g. Presidio).
   * `redactions` are drawn on top as a second line of defence.
   */
  screenshotUrl: string
  caption: string
  /** Area the step is about (e.g. the cost center field). */
  focus?: Rect
  /** Areas containing personal data that must be hidden. */
  redactions?: Rect[]
}

export type QuoteSource = "narration" | "live_question" | "debrief"

/** Something the expert said, in their own words. */
export interface Quote {
  text: string
  speaker: Person
  source: QuoteSource
  /** Seconds since session start. */
  at: number
  /** The question the agent asked, if this quote is an answer. */
  prompt?: string
}

export type GuardrailKind =
  /** A threshold, e.g. "over €5,000". */
  | "limit"
  /** Stop and ask a specific person. */
  | "stop_and_ask"
  /** Something you must never do. */
  | "never"

export interface Guardrail {
  id: ID
  kind: GuardrailKind
  rule: string
  /** Who to ask, for `stop_and_ask`. */
  escalateTo?: string
  quote?: Quote
}

export interface EdgeCase {
  id: ID
  /** "If …" */
  when: string
  /** "… then do this." */
  then: string
  quote?: Quote
}

export type StepKind = "routine" | "judgment"

export interface WorkMapStep {
  id: ID
  title: string
  kind: StepKind
  screen: ScreenMoment
  /** What the expert actually decided / did. */
  decision: string
  /** Why — in the expert's words. */
  reason?: Quote
  guardrails: Guardrail[]
  edgeCases: EdgeCase[]
}

export interface DebriefItem {
  id: ID
  question: string
  answer?: Quote
  /** Unresolved questions keep a map in `in_debrief`. */
  resolved: boolean
  stepId?: ID
}

export interface TeachBack {
  /** The agent's explanation of the process, read back to the expert. */
  summary: string
  confirmed: boolean
  corrections: Quote[]
}

export interface WorkMap {
  id: ID
  title: string
  /** One or two sentences: what this workflow achieves. */
  summary: string
  domain: string
  /** When a new employee needs this. */
  trigger: string
  expert: Person
  status: WorkMapStatus
  updatedAt: string
  sessionIds: ID[]
  steps: WorkMapStep[]
  debrief: DebriefItem[]
  teachBack?: TeachBack
}

/** Lightweight version used in lists. */
export interface WorkMapSummary {
  id: ID
  title: string
  summary: string
  domain: string
  expert: Person
  status: WorkMapStatus
  updatedAt: string
  stepCount: number
  judgmentCount: number
  guardrailCount: number
  openQuestionCount: number
  /** Thumbnail for cards; carries redactions like any screen moment. */
  cover?: ScreenMoment
}

/* ------------------------------------------------------------------ */
/* Capture — what the browser extension streams in                     */
/* ------------------------------------------------------------------ */

export type SessionStatus = "live" | "processing" | "awaiting_debrief" | "mapped"

export interface CaptureSession {
  id: ID
  title: string
  expert: Person
  startedAt: string
  durationSec: number
  status: SessionStatus
  eventCount: number
  questionsAsked: number
  workMapId?: ID
}

export type SessionEventKind =
  /** Vision model: something changed on screen. */
  | "screen"
  /** Expert spoke (transcribed). */
  | "speech"
  /** Agent asked a question. */
  | "question"
  /** Recording paused / resumed by the expert. */
  | "off_record"

export interface SessionEvent {
  id: ID
  sessionId: ID
  at: number
  kind: SessionEventKind
  text: string
}

export interface CaptureStatus {
  extensionConnected: boolean
  /** Signals the extension currently streams. */
  signals: { screen: boolean; microphone: boolean; keystrokes: boolean }
  /** Expert took the current moment off the record. */
  offTheRecord: boolean
  liveSessionId?: ID
}

/* ------------------------------------------------------------------ */
/* Ask — Q&A for future employees                                      */
/* ------------------------------------------------------------------ */

export interface AskRequest {
  question: string
  /** Scope to one workflow; omit to search all of them. */
  workMapId?: ID
}

export interface Citation {
  workMapId: ID
  workMapTitle: string
  stepId: ID
  stepTitle: string
}

export interface AskResponse {
  answer: string
  citations: Citation[]
}

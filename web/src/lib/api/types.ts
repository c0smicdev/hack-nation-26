/**
 * Shared data contract between the frontend, the backend (server/) and the
 * mock ERP. If you change a shape here, tell the others — the backend's
 * workflow JSON (LLM output) must match these types.
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
/* Account — the signed-in user                                        */
/* ------------------------------------------------------------------ */

/** How much Socrates talks while the expert works. Set during onboarding (not built yet). */
export type Chattiness = "quiet" | "normal" | "curious"

export interface UserPreferences {
  chattiness?: Chattiness
}

/** The signed-in user. `id` is also their `Person.id` on sessions they record. */
export interface Profile {
  id: ID
  displayName: string
  /** Job title, e.g. "Head of Accounts Payable". Filled in during onboarding. */
  role?: string
  email?: string
  preferences: UserPreferences
  /** False until the (future) onboarding flow has run. */
  onboarded: boolean
}

export type ProfilePatch = Partial<Pick<Profile, "displayName" | "role" | "preferences">>

/* ------------------------------------------------------------------ */
/* workflow — the "brief, interactive document" for one workflow       */
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

/** Server-verified processing metadata, not a guarantee of complete PII detection. */
export interface PrivacySummary {
  policyVersion: string
  redactedCount: number
}

export interface ProtectedText {
  texts: string[]
  privacy: PrivacySummary
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
  privacy?: PrivacySummary
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
  privacy?: PrivacySummary
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
/* Capture — screen ticks from the web app + signals from the mock ERP */
/* ------------------------------------------------------------------ */

export type SessionStatus =
  /** Expert is describing the task; nothing is sampled yet. */
  "intake" | "live" | "processing" | "awaiting_debrief" | "mapped"

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
  /** What the expert said they're about to do. */
  task?: string
  /** Saved workflow (memory) this session extends, if the expert confirmed a match. */
  basedOnWorkMapId?: ID
  offTheRecord?: boolean
}

export interface NewSession {
  title: string
  task: string
  expertName: string
  expertRole: string
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
  /** Matters to the workflow: became (or linked to) a candidate step. */
  important?: boolean
  /** Screenshot of the tick that produced this event. */
  screenshotUrl?: string
  /** Step in the matched (memory) workflow this event corresponds to. */
  matchedStepId?: ID
  /** Expert decided differently than the matched step. */
  deviation?: boolean
  /** For `question` / answer `speech` events: the question this belongs to. */
  questionId?: ID
  redactions?: Rect[]
  privacy?: PrivacySummary
}

/** What the session page posts when something happens outside the tick loop. */
export interface NewSessionEvent {
  at: number
  kind: SessionEventKind
  text: string
  questionId?: ID
}

export interface CaptureStatus {
  /** A capture session is running in some tab. */
  active: boolean
  /** Signals currently captured. `erp` = typing/field events from the mock ERP. */
  signals: { screen: boolean; microphone: boolean; erp: boolean }
  /** Expert took the current moment off the record. */
  offTheRecord: boolean
  liveSessionId?: ID
}

/** Something the mock ERP reported between two ticks (exact, unlike vision). */
export interface ErpSignal {
  at: number
  kind: "navigate" | "field_change" | "action"
  text: string
}

/** One sample, every ~1–2 s. */
export interface Tick {
  at: number
  /** OCR-readable PNG, base64 without the data: prefix. Legacy JPEG is accepted. */
  image?: string
  mime?: "image/png" | "image/jpeg"
  /** Optional regions excluded before OCR, normalized to the submitted image. */
  masks?: Rect[]
  typing: boolean
  speaking: boolean
  erp: ErpSignal[]
}

/** A question the agent may ask live, if a natural pause comes soon enough. */
export interface LiveQuestion {
  id: ID
  question: string
  stepId?: ID
  /** About a limit, an exception or when to stop and ask someone. */
  guardrail: boolean
  /** Seconds since session start. */
  at: number
  /** The screen the question is about; it expires once the screen moves on. */
  screen: string
}

export interface TickResult {
  /** False if the tick was dropped because a vision call was still running. */
  processed: boolean
  /** Short label of what's on screen now, e.g. "Invoice 4471 detail". */
  screen?: string
  events: SessionEvent[]
  questions: LiveQuestion[]
  /** All steps so far, after this tick. Omitted when the tick changed nothing. */
  steps?: LiveStep[]
  privacy?: PrivacySummary
}

/**
 * A step as it forms during capture (a candidate step on the server). The
 * session events from `at` until the next step's `at` belong to it.
 * Becomes a WorkMapStep after the debrief.
 */
export interface LiveStep {
  id: ID
  /** Seconds since session start when the step first appeared. */
  at: number
  title: string
  kind: StepKind
  /** What the expert decided / did, as understood so far. */
  decision: string
  /** Latest screenshot of this step. */
  screenshotUrl?: string
  /** Decided differently than the saved workflow. */
  deviation?: boolean
}

/* ------------------------------------------------------------------ */
/* Debrief — closing the gaps after the task                           */
/* ------------------------------------------------------------------ */

export interface DebriefAnswer {
  text: string
  at: number
}

export interface TeachBackReply {
  confirmed: boolean
  /** The expert's correction, in their words. */
  correction?: string
  at: number
}

/* ------------------------------------------------------------------ */
/* Teach — guiding a new hire through a workflow                       */
/* ------------------------------------------------------------------ */

/** A save the mock ERP is holding until the tutor allows it. */
export interface DecisionCheck {
  /** "post" | "hold" | "request_approval" */
  action: string
  /** The record as it would be saved (field → value). */
  record: Record<string, unknown>
}

export interface DecisionVerdict {
  allow: boolean
  /** One or two sentences for the learner, in the expert's reasoning. */
  message: string
  stepId?: ID
  guardrailId?: ID
  /** The expert's own words backing the verdict. */
  quote?: Quote
  screen?: ScreenMoment
}

/* ------------------------------------------------------------------ */
/* Voice — ElevenAgents                                                */
/* ------------------------------------------------------------------ */

export type VoiceRole = "interviewer" | "tutor" | "drafter"

export interface VoiceSession {
  /** Signed WebSocket URL; the API key never reaches the browser. */
  signedUrl: string
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

/* ------------------------------------------------------------------ */
/* New workflow — AI drafts title + description from a chat            */
/* ------------------------------------------------------------------ */

export interface WorkflowDraftMessage {
  role: "user" | "assistant"
  content: string
}

export interface WorkflowDraftRequest {
  /** The conversation so far; last entry is the newest user message. */
  messages: WorkflowDraftMessage[]
  /** Current field values, so the model can refine instead of overwrite. */
  title: string
  description: string
}

export interface WorkflowDraft {
  /** What the assistant says back in the chat. */
  reply: string
  /** Proposed title + description for the new workflow. */
  title: string
  description: string
  /** Enough is known to start: the app creates the workflow right away. */
  ready: boolean
}

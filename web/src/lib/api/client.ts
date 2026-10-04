import type {
  AskRequest,
  AskResponse,
  CaptureSession,
  CaptureStatus,
  DebriefAnswer,
  DecisionCheck,
  DecisionVerdict,
  ID,
  LiveStep,
  NewSession,
  NewSessionEvent,
  Profile,
  ProfilePatch,
  SessionEvent,
  TeachBackReply,
  Tick,
  TickResult,
  VoiceRole,
  VoiceSession,
  WorkflowDraft,
  WorkflowDraftRequest,
  WorkMap,
  WorkMapSummary,
} from "./types"

export interface SessionPatch {
  /** Intake is done: start sampling ticks. */
  status?: "live"
  task?: string
  /** Memory match the expert confirmed (`null` = "it's new"). */
  basedOnWorkMapId?: ID | null
}

/**
 * Everything the UI needs from the backend. There are two implementations:
 * `mockApi` (in-memory fixtures, default) and `httpApi` (real backend).
 * Add a method here first, then implement it in both.
 */
export interface SocratesApi {
  /* Account */
  getMe(): Promise<Profile>
  /** For the onboarding flow: name, role, preferences. */
  updateMe(patch: ProfilePatch): Promise<Profile>

  /* workflows + memory */
  listWorkMaps(): Promise<WorkMapSummary[]>
  getWorkMap(id: ID): Promise<WorkMap>
  findRelatedWorkMaps(task: string): Promise<WorkMapSummary[]>

  /* Capture */
  listSessions(): Promise<CaptureSession[]>
  getSession(id: ID): Promise<CaptureSession>
  createSession(input: NewSession): Promise<CaptureSession>
  updateSession(id: ID, patch: SessionPatch): Promise<CaptureSession>
  listSessionEvents(sessionId: ID): Promise<SessionEvent[]>
  /** The steps grouped so far while recording. */
  listLiveSteps(sessionId: ID): Promise<LiveStep[]>
  recordEvent(sessionId: ID, event: NewSessionEvent): Promise<SessionEvent>
  postTick(sessionId: ID, tick: Tick): Promise<TickResult>
  getCaptureStatus(): Promise<CaptureStatus>
  setCaptureStatus(patch: Partial<CaptureStatus>): Promise<CaptureStatus>
  setOffTheRecord(offTheRecord: boolean): Promise<CaptureStatus>

  /* Debrief → workflow */
  /** Ends capture; returns the draft workflow with its debrief questions. */
  finishCapture(sessionId: ID): Promise<WorkMap>
  answerDebrief(workMapId: ID, itemId: ID, answer: DebriefAnswer): Promise<WorkMap>
  /** Generates the explanation the agent reads back to the expert. */
  requestTeachBack(workMapId: ID): Promise<WorkMap>
  /** Confirmed → the map is finalized (possibly merged into an existing map: mind the returned id). */
  replyTeachBack(workMapId: ID, reply: TeachBackReply): Promise<WorkMap>

  /* Teach */
  checkDecision(workMapId: ID, check: DecisionCheck): Promise<DecisionVerdict>

  /* Voice: `null` when no ElevenLabs agent is configured (the UI falls back to text). */
  getVoiceSession(role: VoiceRole): Promise<VoiceSession | null>

  ask(request: AskRequest): Promise<AskResponse>

  /* New workflow: turn a free-text chat into a title + description. */
  draftWorkflow(request: WorkflowDraftRequest): Promise<WorkflowDraft>
}

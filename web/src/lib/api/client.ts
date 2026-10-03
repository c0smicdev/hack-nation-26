import type {
  AskRequest,
  AskResponse,
  CaptureSession,
  CaptureStatus,
  ID,
  SessionEvent,
  WorkMap,
  WorkMapSummary,
} from "./types"

/**
 * Everything the UI needs from the backend. There are two implementations:
 * `mockApi` (in-memory fixtures, default) and `httpApi` (real backend).
 * Add a method here first, then implement it in both.
 */
export interface SocratesApi {
  listWorkMaps(): Promise<WorkMapSummary[]>
  getWorkMap(id: ID): Promise<WorkMap>

  listSessions(): Promise<CaptureSession[]>
  listSessionEvents(sessionId: ID): Promise<SessionEvent[]>
  getCaptureStatus(): Promise<CaptureStatus>
  setOffTheRecord(offTheRecord: boolean): Promise<CaptureStatus>

  ask(request: AskRequest): Promise<AskResponse>
}

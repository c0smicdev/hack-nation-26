import type { SocratesApi } from "./client"

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** REST client for the backend in server/router.ts. */
export function createHttpApi(baseUrl: string): SocratesApi {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    })
    if (!res.ok) {
      const text = await res.text()
      let message = text
      try {
        message = (JSON.parse(text) as { error?: string }).error ?? text
      } catch {
        // not JSON
      }
      throw new ApiError(res.status, message)
    }
    return res.json() as Promise<T>
  }
  const post = <T>(path: string, body?: unknown, method = "POST") =>
    request<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) })

  return {
    listWorkMaps: () => request("/workmaps"),
    getWorkMap: (id) => request(`/workmaps/${id}`),
    findRelatedWorkMaps: (task) => post("/workmaps/related", { task }),

    listSessions: () => request("/sessions"),
    getSession: (id) => request(`/sessions/${id}`),
    createSession: (input) => post("/sessions", input),
    updateSession: (id, patch) => post(`/sessions/${id}`, patch, "PATCH"),
    listSessionEvents: (sessionId) => request(`/sessions/${sessionId}/events`),
    listLiveSteps: (sessionId) => request(`/sessions/${sessionId}/steps`),
    recordEvent: (sessionId, event) => post(`/sessions/${sessionId}/events`, event),
    postTick: (sessionId, tick) => post(`/sessions/${sessionId}/ticks`, tick),
    getCaptureStatus: () => request("/capture/status"),
    setCaptureStatus: (patch) => post("/capture/status", patch, "PATCH"),
    setOffTheRecord: (offTheRecord) => post("/capture/status", { offTheRecord }, "PATCH"),

    finishCapture: (sessionId) => post(`/sessions/${sessionId}/finish`),
    answerDebrief: (id, itemId, answer) => post(`/workmaps/${id}/debrief/${itemId}`, answer),
    requestTeachBack: (id) => post(`/workmaps/${id}/teach-back`),
    replyTeachBack: (id, reply) => post(`/workmaps/${id}/teach-back/reply`, reply),

    checkDecision: (id, check) => post(`/workmaps/${id}/check`, check),
    startSupervision: (id, input) => post(`/workmaps/${id}/supervisions`, input),
    postSupervisionTick: (supervisionId, tick) =>
      post(`/supervisions/${supervisionId}/ticks`, tick),
    askAboutScreen: (supervisionId, question) =>
      post(`/supervisions/${supervisionId}/ask`, question),
    getVoiceSession: (role) => request(`/voice/${role}`),

    ask: (body) => post("/ask", body),
    draftWorkflow: (body) => post("/workflows/draft", body),
  }
}

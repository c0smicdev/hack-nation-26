import { accessToken } from "@/lib/auth/supabase"

import type { SocratesApi } from "./client"

export class ApiError extends Error {
  readonly status: number
  readonly code?: string

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

/** REST client for the backend in server/router.ts. */
export function createHttpApi(baseUrl: string): SocratesApi {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await accessToken()
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
        ...init?.headers,
      },
    })
    if (!res.ok) {
      const text = await res.text()
      let message = text
      let code: string | undefined
      try {
        const body = JSON.parse(text) as { error?: string; code?: string }
        message = body.error ?? text
        code = body.code
      } catch {
        // not JSON
      }
      throw new ApiError(res.status, message, code)
    }
    return res.json() as Promise<T>
  }
  const post = <T>(path: string, body?: unknown, method = "POST") =>
    request<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) })

  return {
    getMe: () => request("/me"),
    updateMe: (patch) => post("/me", patch, "PATCH"),

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
    postTick: (sessionId, tick, signal) =>
      request(`/sessions/${sessionId}/ticks`, {
        method: "POST",
        body: JSON.stringify(tick),
        signal,
      }),
    protectTexts: (texts) => post("/privacy/text", { texts }),
    getFrame: async (url, signal) => {
      if (!/^\/api\/frames\/[a-zA-Z0-9-]+$/.test(url))
        throw new ApiError(400, "Invalid screenshot reference")
      const token = await accessToken()
      const response = await fetch(`${baseUrl}/frames/${url.split("/").at(-1)}`, {
        signal,
        cache: "no-store",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!response.ok) throw new ApiError(response.status, "Screenshot unavailable")
      return response.blob()
    },
    getCaptureStatus: () => request("/capture/status"),
    setCaptureStatus: (patch) => post("/capture/status", patch, "PATCH"),
    setOffTheRecord: (offTheRecord) => post("/capture/status", { offTheRecord }, "PATCH"),

    finishCapture: (sessionId) => post(`/sessions/${sessionId}/finish`),
    answerDebrief: (id, itemId, answer) => post(`/workmaps/${id}/debrief/${itemId}`, answer),
    requestTeachBack: (id) => post(`/workmaps/${id}/teach-back`),
    replyTeachBack: (id, reply) => post(`/workmaps/${id}/teach-back/reply`, reply),

    checkDecision: (id, check) => post(`/workmaps/${id}/check`, check),
    getVoiceSession: (role) => request(`/voice/${role}`),

    ask: (body) => post("/ask", body),
    draftWorkflow: (body) => post("/workflows/draft", body),
  }
}

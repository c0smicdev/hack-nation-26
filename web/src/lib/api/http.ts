import type { SocratesApi } from "./client"

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** REST client. Endpoint paths are the proposed contract with the backend. */
export function createHttpApi(baseUrl: string): SocratesApi {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    })
    if (!res.ok) throw new ApiError(res.status, await res.text())
    return res.json() as Promise<T>
  }

  return {
    listWorkMaps: () => request("/workmaps"),
    getWorkMap: (id) => request(`/workmaps/${id}`),

    listSessions: () => request("/sessions"),
    listSessionEvents: (sessionId) => request(`/sessions/${sessionId}/events`),
    getCaptureStatus: () => request("/capture/status"),
    setOffTheRecord: (offTheRecord) =>
      request("/capture/status", {
        method: "PATCH",
        body: JSON.stringify({ offTheRecord }),
      }),

    ask: (body) => request("/ask", { method: "POST", body: JSON.stringify(body) }),
  }
}

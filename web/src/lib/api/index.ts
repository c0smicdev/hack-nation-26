import type { SocratesApi } from "./client"
import { createHttpApi } from "./http"
import { mockApi } from "./mock"

export type { SocratesApi } from "./client"
export * from "./types"

// `npm run dev:mock` forces the mocks even if .env.local points at the backend.
const baseUrl =
  import.meta.env.MODE === "mock" ? undefined : (import.meta.env.VITE_API_URL as string | undefined)

/** Set VITE_API_URL to talk to the real backend; otherwise mocks are used. */
export const api: SocratesApi = baseUrl ? createHttpApi(baseUrl) : mockApi
export const usingMocks = !baseUrl

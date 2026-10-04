import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, type ID } from "@/lib/api"
import { setLocalPrivacy } from "@/lib/privacy/lifecycle"

/** How often to poll live data. Swap for SSE/WebSocket later. */
const LIVE_POLL_MS = 2000

export const captureKeys = {
  status: ["capture", "status"] as const,
  sessions: ["capture", "sessions"] as const,
  session: (sessionId: ID) => ["capture", "session", sessionId] as const,
  events: (sessionId: ID) => ["capture", "sessions", sessionId, "events"] as const,
  steps: (sessionId: ID) => ["capture", "sessions", sessionId, "steps"] as const,
}

export function useCaptureStatus() {
  return useQuery({
    queryKey: captureKeys.status,
    queryFn: api.getCaptureStatus,
    refetchInterval: LIVE_POLL_MS * 2.5,
  })
}

export function useSetOffTheRecord() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.setOffTheRecord,
    onMutate: (paused) => {
      const status = queryClient.getQueryData<Awaited<ReturnType<typeof api.getCaptureStatus>>>(
        captureKeys.status,
      )
      if (paused && status?.liveSessionId) {
        setLocalPrivacy(status.liveSessionId, true)
        queryClient.setQueryData(captureKeys.status, { ...status, offTheRecord: true })
      }
    },
    onSuccess: (status) => {
      queryClient.setQueryData(captureKeys.status, status)
      if (status.liveSessionId) {
        setLocalPrivacy(status.liveSessionId, status.offTheRecord)
        queryClient.invalidateQueries({ queryKey: captureKeys.events(status.liveSessionId) })
      }
    },
  })
}

export function useSessions() {
  return useQuery({
    queryKey: captureKeys.sessions,
    queryFn: api.listSessions,
    refetchInterval: LIVE_POLL_MS * 2.5,
  })
}

export function useSessionEvents(sessionId: ID | undefined, { live = false } = {}) {
  return useQuery({
    queryKey: captureKeys.events(sessionId ?? ""),
    queryFn: () => api.listSessionEvents(sessionId!),
    enabled: !!sessionId,
    refetchInterval: live ? LIVE_POLL_MS : false,
  })
}

/** Steps grouped so far while recording; the tick loop also pushes fresh ones in. */
export function useLiveSteps(sessionId: ID, { live = false } = {}) {
  return useQuery({
    queryKey: captureKeys.steps(sessionId),
    queryFn: () => api.listLiveSteps(sessionId),
    refetchInterval: live ? LIVE_POLL_MS : false,
  })
}

export function useSession(sessionId: ID) {
  return useQuery({
    queryKey: captureKeys.session(sessionId),
    queryFn: () => api.getSession(sessionId),
    refetchInterval: LIVE_POLL_MS,
  })
}

export function useCreateSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.createSession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: captureKeys.sessions })
      queryClient.invalidateQueries({ queryKey: captureKeys.status })
    },
  })
}

/** The session's draft workflow during the debrief (owned by this flow until it's confirmed). */
export function useDraftWorkMap(workMapId: ID | undefined) {
  return useQuery({
    queryKey: ["work-maps", workMapId ?? ""],
    queryFn: () => api.getWorkMap(workMapId!),
    enabled: !!workMapId,
  })
}

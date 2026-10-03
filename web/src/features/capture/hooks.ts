import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, type ID } from "@/lib/api"

/** How often to poll while the extension streams. Swap for SSE/WebSocket later. */
const LIVE_POLL_MS = 2000

export const captureKeys = {
  status: ["capture", "status"] as const,
  sessions: ["capture", "sessions"] as const,
  events: (sessionId: ID) => ["capture", "sessions", sessionId, "events"] as const,
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
    onSuccess: (status) => {
      queryClient.setQueryData(captureKeys.status, status)
      if (status.liveSessionId) {
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

import { useSyncExternalStore } from "react"

const paused = new Set<string>()
const listeners = new Set<() => void>()
export const privacyPaused = (sessionId?: string) => !!sessionId && paused.has(sessionId)
export function setLocalPrivacy(sessionId: string, value: boolean) {
  if (value) paused.add(sessionId)
  else paused.delete(sessionId)
  listeners.forEach((listener) => listener())
}
export function subscribePrivacy(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function usePrivacyPause(sessionId: string) {
  return useSyncExternalStore(
    subscribePrivacy,
    () => privacyPaused(sessionId),
    () => false,
  )
}

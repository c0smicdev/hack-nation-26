/**
 * The browser only allows screen sharing right after a click. The "Create
 * workflow" click asks for it, then hands the stream to the recording page,
 * which only mounts after the session exists.
 */
let pending: { sessionId: string; stream: MediaStream } | undefined

export function handOverStream(sessionId: string, stream: MediaStream) {
  if (pending && pending.stream !== stream) pending.stream.getTracks().forEach((t) => t.stop())
  pending = { sessionId, stream }
}

/**
 * The stream shared for this session, while it's still live. Safe to call more
 * than once (StrictMode runs state initializers twice); a stopped stream is
 * never returned again.
 */
export function claimStream(sessionId: string) {
  if (pending?.sessionId !== sessionId) return undefined
  return pending.stream.active ? pending.stream : undefined
}

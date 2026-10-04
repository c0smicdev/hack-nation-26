import { useConversation } from "@elevenlabs/react"
import { useCallback, useEffect, useRef, useState } from "react"

import { api, type VoiceRole } from "@/lib/api"

export interface TranscriptLine {
  id: number
  role: "user" | "agent" | "app"
  text: string
  /** Wall-clock ms. */
  at: number
}

/** Client tools: the agent calls these and waits for the returned string. */
export type AgentTools = Record<
  string,
  (params: Record<string, unknown>) => Promise<string> | string
>

export type VoiceMode = "idle" | "connecting" | "voice" | "text" | "error"

/** Messages we inject start with a tag ("[QUESTION …]"); they're not the user's words. */
const isAppMessage = (text: string) => /^\[[A-Z]+/.test(text.trim())

/** The voice speaks tone tags ("[warmly]", "[curious]") but they shouldn't show up in the chat. */
const stripToneTags = (text: string) =>
  text
    .replace(/\[[^[\]\n]{1,40}\]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()

/**
 * One ElevenAgents conversation (interviewer, supervisor or drafter). Must be used inside a
 * <ConversationProvider>. The signed URL comes from our backend, so the API key
 * never reaches the browser. Without a configured agent it falls back to `text`
 * mode and the page drives the flow with buttons instead.
 */
export function useVoiceAgent({
  role,
  tools,
  onUserText,
}: {
  role: VoiceRole
  tools: AgentTools
  /** A final user transcript (Scribe) or typed message. */
  onUserText?: (text: string) => void
}) {
  const conversation = useConversation()
  const [mode, setMode] = useState<VoiceMode>("idle")
  const [error, setError] = useState<string>()
  const [transcript, setTranscript] = useState<TranscriptLine[]>([])
  const nextId = useRef(0)
  const lastUserVoiceAt = useRef(0)

  // Tool handlers and callbacks change every render; the agent always calls the latest.
  const toolsRef = useRef(tools)
  const onUserTextRef = useRef(onUserText)
  useEffect(() => {
    toolsRef.current = tools
    onUserTextRef.current = onUserText
  })

  const append = useCallback((role: TranscriptLine["role"], text: string) => {
    setTranscript((t) => [...t, { id: nextId.current++, role, text, at: Date.now() }])
  }, [])

  const start = useCallback(
    async (dynamicVariables: Record<string, string>) => {
      setMode("connecting")
      setError(undefined)
      try {
        const session = await api.getVoiceSession(role)
        if (!session) {
          setMode("text")
          return
        }
        const clientTools = Object.fromEntries(
          Object.keys(toolsRef.current).map((name) => [
            name,
            async (params: Record<string, unknown>) => {
              append("app", `→ ${name}(${JSON.stringify(params)})`)
              try {
                return await toolsRef.current[name](params)
              } catch (e) {
                return `Error: ${e instanceof Error ? e.message : String(e)}`
              }
            },
          ]),
        )
        conversation.startSession({
          signedUrl: session.signedUrl,
          dynamicVariables,
          clientTools,
          onMessage: ({ message, role }) => {
            if (role === "user") {
              if (isAppMessage(message)) return
              append("user", message)
              onUserTextRef.current?.(message)
            } else {
              const text = stripToneTags(message)
              if (text) append("agent", text)
            }
          },
          onVadScore: ({ vadScore }) => {
            if (vadScore > 0.6) lastUserVoiceAt.current = Date.now()
          },
          onConnect: () => setMode("voice"),
          onError: (message) => {
            setError(message)
            // Couldn't connect (e.g. microphone denied): keep going in text mode.
            setMode((m) => (m === "connecting" ? "text" : m))
          },
          onDisconnect: () => setMode((m) => (m === "voice" ? "idle" : m)),
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        setMode("error")
      }
    },
    [append, conversation, role],
  )

  const stop = useCallback(() => {
    conversation.endSession()
    setMode("idle")
  }, [conversation])

  /** Sends to the agent if a conversation is live; never throws. */
  const send = useCallback(
    (kind: "message" | "context", text: string) => {
      if (mode !== "voice" || conversation.status !== "connected") return false
      try {
        if (kind === "message") conversation.sendUserMessage(text)
        else conversation.sendContextualUpdate(text)
        return true
      } catch {
        return false
      }
    },
    [conversation, mode],
  )

  /** Make the agent respond (e.g. ask a question now). False if there's no live agent. */
  const prompt = useCallback((text: string) => send("message", text), [send])

  /** Tell the agent what's on screen without making it talk. */
  const context = useCallback((text: string) => void send("context", text), [send])

  /** Mic off (e.g. to type instead): Socrates keeps talking but stops listening. */
  const setMuted = useCallback(
    (muted: boolean) => {
      if (conversation.status !== "connected") return
      try {
        conversation.setMuted(muted)
      } catch {
        // The session just ended; the SDK unmutes on disconnect anyway.
      }
    },
    [conversation],
  )

  /** The user is typing: keeps the agent from talking over them. */
  const activity = useCallback(() => {
    if (conversation.status !== "connected") return
    try {
      conversation.sendUserActivity()
    } catch {
      // Best effort only.
    }
  }, [conversation])

  /** Typed instead of spoken: same path as a transcript. */
  const type = useCallback(
    (text: string) => {
      append("user", text)
      send("message", text)
      onUserTextRef.current?.(text)
    },
    [append, send],
  )

  return {
    mode,
    error,
    transcript,
    connected: conversation.status === "connected",
    agentSpeaking: conversation.isSpeaking,
    muted: conversation.isMuted,
    setMuted,
    activity,
    /** ms since the user's voice was last detected (Scribe VAD). */
    msSinceUserVoice: () => Date.now() - lastUserVoiceAt.current,
    start,
    stop,
    prompt,
    context,
    type,
    note: (text: string) => append("app", text),
  }
}

export type VoiceAgent = ReturnType<typeof useVoiceAgent>

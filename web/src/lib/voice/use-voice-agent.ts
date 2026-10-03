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

/**
 * One ElevenAgents conversation (interviewer or tutor). Must be used inside a
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
              append("agent", message)
            }
          },
          onVadScore: ({ vadScore }) => {
            if (vadScore > 0.6) lastUserVoiceAt.current = Date.now()
          },
          onError: (message) => setError(message),
          onDisconnect: () => setMode((m) => (m === "voice" ? "idle" : m)),
        })
        setMode("voice")
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

  /** Make the agent respond (e.g. ask a question now). */
  const prompt = useCallback(
    (text: string) => {
      if (mode !== "voice") return false
      conversation.sendUserMessage(text)
      return true
    },
    [conversation, mode],
  )

  /** Tell the agent what's on screen without making it talk. */
  const context = useCallback(
    (text: string) => {
      if (mode === "voice") conversation.sendContextualUpdate(text)
    },
    [conversation, mode],
  )

  /** Typed instead of spoken: same path as a transcript. */
  const type = useCallback(
    (text: string) => {
      append("user", text)
      if (mode === "voice") conversation.sendUserMessage(text)
      onUserTextRef.current?.(text)
    },
    [append, conversation, mode],
  )

  return {
    mode,
    error,
    transcript,
    connected: conversation.status === "connected",
    agentSpeaking: conversation.isSpeaking,
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

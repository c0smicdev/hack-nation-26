import { useConversation } from "@elevenlabs/react"
import { useCallback, useEffect, useRef, useState } from "react"

import { api, type VoiceRole } from "@/lib/api"
import { privacyPaused, subscribePrivacy } from "@/lib/privacy/lifecycle"

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
const isAppMessage = (text: string) => /^\[(?:QUESTION|SYSTEM|SCREEN)\b/.test(text.trim())

/** The voice speaks tone tags ("[warmly]", "[curious]") but they shouldn't show up in the chat. */
const stripToneTags = (text: string) =>
  text
    .replace(/\[[^[\]\n]{1,40}\]/g, (tag) =>
      /^\[(?:PERSON|EMAIL_ADDRESS|PHONE_NUMBER|IBAN_CODE|CREDIT_CARD|IP_ADDRESS|ADDRESS|BUSINESS|SECRET)(?::|\])/.test(
        tag,
      )
        ? tag
        : "",
    )
    .replace(/\s{2,}/g, " ")
    .trim()

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
  privacyScope,
}: {
  role: VoiceRole
  tools: AgentTools
  /** A final user transcript (Scribe) or typed message. */
  onUserText?: (text: string) => void
  privacyScope?: string
}) {
  const conversation = useConversation()
  const [mode, setMode] = useState<VoiceMode>("idle")
  const [error, setError] = useState<string>()
  const [transcript, setTranscript] = useState<TranscriptLine[]>([])
  const nextId = useRef(0)
  const lastUserVoiceAt = useRef(0)
  const generation = useRef(0)
  const serial = useRef<Promise<void>>(Promise.resolve())
  useEffect(
    () => () => {
      generation.current += 1
    },
    [],
  )

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

  const enqueue = useCallback(
    (action: () => Promise<void>) => {
      const epoch = generation.current
      serial.current = serial.current
        .catch(() => {})
        .then(async () => {
          if (epoch !== generation.current || privacyPaused(privacyScope)) return
          await action()
        })
        .catch(() => setError("Privacy protection could not complete. Please retry."))
    },
    [privacyScope],
  )

  const protectedText = useCallback(
    async (text: string) => (await api.protectTexts([text])).texts[0],
    [],
  )

  const stop = useCallback(() => {
    generation.current += 1
    try {
      conversation.endSession()
    } catch {
      /* Already disconnected. */
    }
    setMode("idle")
  }, [conversation])

  useEffect(
    () =>
      subscribePrivacy(() => {
        if (privacyPaused(privacyScope)) stop()
      }),
    [privacyScope, stop],
  )

  const start = useCallback(
    async (dynamicVariables: Record<string, string>) => {
      if (privacyPaused(privacyScope)) return
      const epoch = ++generation.current
      setMode("connecting")
      setError(undefined)
      try {
        const session = await api.getVoiceSession(role)
        if (epoch !== generation.current || privacyPaused(privacyScope)) return
        if (!session) {
          setMode("text")
          return
        }
        const keys = Object.keys(dynamicVariables)
        const safeVariables = await api.protectTexts(Object.values(dynamicVariables))
        if (epoch !== generation.current || privacyPaused(privacyScope)) return
        const clientTools = Object.fromEntries(
          Object.keys(toolsRef.current).map((name) => [
            name,
            async (params: Record<string, unknown>) => {
              if (privacyPaused(privacyScope)) return "Off the record. Resume in the app."
              append("app", `Tool: ${name}`)
              try {
                // The pause tool must stop transport immediately, without waiting for detection.
                if (name === "set_off_record")
                  return await toolsRef.current[name]({
                    off: params.off === true || params.off === "true",
                  })
                const safe = structuredClone(params)
                const fields = Object.entries(safe).filter(
                  ([key, value]) => typeof value === "string" && !/(?:^id$|_id$)/.test(key),
                )
                const values = await api.protectTexts(fields.map(([, value]) => value as string))
                fields.forEach(([key], index) => {
                  safe[key] = values.texts[index]
                })
                if (epoch !== generation.current || privacyPaused(privacyScope))
                  return "Off the record."
                const result = await toolsRef.current[name](safe)
                if (epoch !== generation.current || privacyPaused(privacyScope))
                  return "Off the record."
                return await protectedText(result)
              } catch {
                return "The action could not complete. Please retry in the app."
              }
            },
          ]),
        )
        await conversation.startSession({
          signedUrl: session.signedUrl,
          dynamicVariables: Object.fromEntries(
            keys.map((key, index) => [key, safeVariables.texts[index]]),
          ),
          clientTools,
          onMessage: ({ message, role }) => {
            if (
              epoch !== generation.current ||
              privacyPaused(privacyScope) ||
              (role === "user" && isAppMessage(message))
            )
              return
            enqueue(async () => {
              const text = await protectedText(role === "user" ? message : stripToneTags(message))
              if (!text || epoch !== generation.current || privacyPaused(privacyScope)) return
              append(role === "user" ? "user" : "agent", text)
              if (role === "user") onUserTextRef.current?.(text)
            })
          },
          onVadScore: ({ vadScore }) => {
            if (vadScore > 0.6) lastUserVoiceAt.current = Date.now()
          },
          onConnect: () => {
            if (epoch === generation.current && !privacyPaused(privacyScope)) setMode("voice")
          },
          onError: () => {
            if (epoch !== generation.current) return
            setError("Voice connection unavailable.")
            // Couldn't connect (e.g. microphone denied): keep going in text mode.
            setMode((m) => (m === "connecting" ? "text" : m))
          },
          onDisconnect: () => {
            if (epoch === generation.current) setMode((m) => (m === "voice" ? "idle" : m))
          },
        })
      } catch {
        if (epoch !== generation.current || privacyPaused(privacyScope)) return
        setError("Voice or privacy protection could not connect. Please retry.")
        setMode("error")
      }
    },
    [append, conversation, role, privacyScope, enqueue, protectedText],
  )

  /** Sends to the agent if a conversation is live; never throws. */
  const send = useCallback(
    (kind: "message" | "context", text: string) => {
      if (mode !== "voice" || conversation.status !== "connected") return false
      if (privacyPaused(privacyScope)) return false
      const epoch = generation.current
      enqueue(async () => {
        const safe = await protectedText(text)
        if (
          epoch !== generation.current ||
          privacyPaused(privacyScope) ||
          conversation.status !== "connected"
        )
          return
        if (kind === "message") conversation.sendUserMessage(safe)
        else conversation.sendContextualUpdate(safe)
      })
      return true
    },
    [conversation, mode, privacyScope, enqueue, protectedText],
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
      const epoch = generation.current
      enqueue(async () => {
        const safe = await protectedText(text)
        if (epoch !== generation.current || privacyPaused(privacyScope)) return
        append("user", safe)
        if (mode === "voice" && conversation.status === "connected")
          conversation.sendUserMessage(safe)
        onUserTextRef.current?.(safe)
      })
    },
    [append, conversation, mode, enqueue, protectedText, privacyScope],
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
    note: (text: string) => {
      const epoch = generation.current
      enqueue(async () => {
        const safe = await protectedText(text)
        if (epoch === generation.current && !privacyPaused(privacyScope)) append("app", safe)
      })
    },
  }
}

export type VoiceAgent = ReturnType<typeof useVoiceAgent>

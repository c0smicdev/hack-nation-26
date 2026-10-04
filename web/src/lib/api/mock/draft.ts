import type { WorkflowDraft, WorkflowDraftMessage } from "../types"

/**
 * Turns the chat into a title + description without a model: good enough to demo
 * the "describe it and the AI fills the details" flow. The real backend replaces
 * this with an LLM call behind the same `draftWorkflow` endpoint.
 */

const LEAD_INS =
  /^(hey,?\s+)?(i|we)?\s*(want to|need to|have to|would like to|am trying to|'?m trying to|'?d like to)\s+/i

function titleCase(s: string) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase())
}

function deriveTitle(text: string) {
  const firstSentence = text.split(/[.!?\n]/)[0].trim()
  const core = firstSentence.replace(LEAD_INS, "").trim() || firstSentence
  const words = core.split(/\s+/).slice(0, 7).join(" ")
  return titleCase(words.replace(/[,:;].*$/, "")) || "Untitled"
}

function deriveDescription(allUserText: string) {
  const text = allUserText.trim().replace(/\s+/g, " ")
  if (!text) return ""
  const sentence = text[0].toUpperCase() + text.slice(1)
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`
}

export function draftWorkflow(
  messages: WorkflowDraftMessage[],
  currentTitle: string,
  currentDescription: string,
): WorkflowDraft {
  const userMessages = messages.filter((m) => m.role === "user")
  const userText = userMessages
    .map((m) => m.content)
    .join(" ")
    .trim()

  if (!userText) {
    return {
      reply: "Tell me what this workflow is about and I'll fill in the title and description.",
      title: currentTitle,
      description: currentDescription,
      ready: false,
    }
  }

  const title = deriveTitle(userText)
  const description = deriveDescription(userText)
  // Two answers are enough for the demo: the task, then who/when.
  const ready = userMessages.length >= 2
  const reply = ready
    ? `Great, that's enough to start “${title}”. Setting it up now…`
    : `Got it — I've set the title to “${title}” and drafted a description. ` +
      "Who is it for, and when does it come up?"

  return { reply, title, description, ready }
}

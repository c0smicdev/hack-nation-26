import type { Chattiness } from "@/lib/api"

/** How Socrates works with someone, picked in onboarding (stored as `preferences.chattiness`). */
export const COACHING_STYLES: { value: Chattiness; title: string; description: string }[] = [
  {
    value: "quiet",
    title: "Silent observer",
    description:
      "I watch and stay out of your way. I only speak up for what really matters: a limit, an exception or a mistake.",
  },
  {
    value: "normal",
    title: "Balanced",
    description:
      "A few questions at natural pauses, and help whenever you ask. Everything else waits until you're done.",
  },
  {
    value: "curious",
    title: "Active coach",
    description:
      "I ask more as you go and offer tips along the way, without you having to ask first.",
  },
]

/** The voice agents' `{{coaching_style}}` variable. */
export const coachingStyle = (chattiness: Chattiness | undefined) =>
  chattiness === "quiet" ? "silent" : chattiness === "curious" ? "active" : "balanced"

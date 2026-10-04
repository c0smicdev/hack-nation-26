import type { Chattiness } from "@/lib/api"

/** How Socrates works with someone, picked in onboarding (stored as `preferences.chattiness`). */
export const COACHING_STYLES: Chattiness[] = ["quiet", "normal", "curious"]

/** The voice agents' `{{coaching_style}}` variable. */
export const coachingStyle = (chattiness: Chattiness | undefined) =>
  chattiness === "quiet" ? "silent" : chattiness === "curious" ? "active" : "balanced"

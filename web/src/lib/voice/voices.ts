import type { Language } from "@/lib/api"

/**
 * A native speaker's voice per language. The agents' own voice (Eric, American English) keeps
 * its accent in every language, so other languages get a voice from the ElevenLabs library
 * with a similar feel: calm, friendly, adult male, made for conversation.
 */
export const VOICES: Partial<Record<Language, string>> = {
  de: "gGjaVIGkCSfKUIBYtNT2", // Marc, de-DE
  fr: "NyxenPOqNyllHIzSoPbJ", // Theo, fr-FR
  es: "htFfPSZGJwjBv1CL0aMD", // Antonio, neutral Latin American
  it: "GcAgjAjkhWsmUd4GlPiv", // Marco, it-IT
  pt: "5p9IbzcK4R8rN1fpGdMF", // Davi, pt-BR (the translations are Brazilian)
  nl: "fzC7H9Y1bPn3gzVLtghe", // Marcèles, nl-NL
  pl: "EmspiS7CSUabPeqBcrAP", // Mikołaj, pl-PL
  tr: "Q5n6GDIjpN0pLOlycRFT", // Yunus, tr-TR
  hi: "zT03pEAEi0VHKciJODfn", // Raju, hi-IN
  zh: "D9bZgM9Er0PhIxuW9Jqa", // Xin, Mandarin (Beijing)
  ja: "8FuuqoKHuM48hIEwni5e", // Shohei, ja-JP
  ko: "CxErO97xpQgQXYmapDKX", // Theo, ko-KR
}

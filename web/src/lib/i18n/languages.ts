import type { Language } from "@/lib/api"

/** The languages Socrates speaks. `name` is in English, for the voice agents' prompts. */
export const LANGUAGES: { code: Language; native: string; name: string }[] = [
  { code: "en", native: "English", name: "English" },
  { code: "de", native: "Deutsch", name: "German" },
  { code: "fr", native: "Français", name: "French" },
  { code: "es", native: "Español", name: "Spanish" },
  { code: "it", native: "Italiano", name: "Italian" },
  { code: "pt", native: "Português", name: "Portuguese" },
  { code: "nl", native: "Nederlands", name: "Dutch" },
  { code: "pl", native: "Polski", name: "Polish" },
  { code: "tr", native: "Türkçe", name: "Turkish" },
  { code: "hi", native: "हिन्दी", name: "Hindi" },
  { code: "zh", native: "简体中文", name: "Chinese (Simplified)" },
  { code: "ja", native: "日本語", name: "Japanese" },
  { code: "ko", native: "한국어", name: "Korean" },
]

export const isLanguage = (code: unknown): code is Language =>
  LANGUAGES.some((l) => l.code === code)

export const languageName = (code: Language) =>
  LANGUAGES.find((l) => l.code === code)?.name ?? "English"

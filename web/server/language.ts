import type { Language } from "../src/lib/api/types.js"

/** English names, for prompts. Mirrors src/lib/i18n/languages.ts (the server can't import UI code). */
const NAMES: Record<Language, string> = {
  en: "English",
  de: "German",
  fr: "French",
  es: "Spanish",
  it: "Italian",
  pt: "Portuguese",
  nl: "Dutch",
  pl: "Polish",
  tr: "Turkish",
  hi: "Hindi",
  zh: "Simplified Chinese",
  ja: "Japanese",
  ko: "Korean",
}

export const LANGUAGES = Object.keys(NAMES) as [Language, ...Language[]]

export const languageName = (language: Language) => NAMES[language]

/**
 * Appended to a system prompt when the person Socrates writes for picked another language.
 * Prompts stay in English; only the text people read changes.
 */
export function writeIn(language: Language | undefined) {
  if (!language || language === "en") return ""
  return `\n\n# Language\n\nThe person reading your output works in ${NAMES[language]}. Write every text meant for people (questions, answers, messages, titles, summaries, explanations) in ${NAMES[language]}, the way a native speaker would say it at work, never as a word-for-word translation. Keep the expert's quotes, names, numbers, amounts, codes and on-screen values exactly as they are.`
}

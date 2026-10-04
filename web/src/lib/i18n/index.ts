import i18n from "i18next"
import { initReactI18next } from "react-i18next"

import type { Language } from "@/lib/api"

import { isLanguage } from "./languages"

/**
 * UI text lives in src/locales/<language>/<namespace>.json, one namespace per feature.
 * English is the source and ships with the app; the other languages are generated from it by
 * `npm run i18n:translate` and load when picked.
 */

type Bundle = { default: Record<string, unknown> }
const english = import.meta.glob<Bundle>("/src/locales/en/*.json", { eager: true })
const others = import.meta.glob<Bundle>(["/src/locales/*/*.json", "!/src/locales/en/*.json"])

const namespaceOf = (path: string) =>
  path
    .split("/")
    .pop()!
    .replace(/\.json$/, "")

const STORAGE_KEY = "socrates.language"

/** Remembered choice, else the browser's language if we have it, else English. */
function initialLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isLanguage(stored)) return stored
  } catch {
    // Storage blocked: fall through.
  }
  const browser = navigator.languages.map((l) => l.split("-")[0])
  return browser.find(isLanguage) ?? "en"
}

void i18n.use(initReactI18next).init({
  lng: "en",
  fallbackLng: "en",
  ns: Object.keys(english).map(namespaceOf),
  defaultNS: "common",
  resources: {
    en: Object.fromEntries(
      Object.entries(english).map(([path, bundle]) => [namespaceOf(path), bundle.default]),
    ),
  },
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
})

const loaded = new Set<Language>(["en"])

/** Loads a language's text (once) and switches the UI to it. */
export async function setLanguage(language: Language) {
  if (!loaded.has(language)) {
    const prefix = `/src/locales/${language}/`
    const files = Object.entries(others).filter(([path]) => path.startsWith(prefix))
    for (const [path, load] of files) {
      i18n.addResourceBundle(language, namespaceOf(path), (await load()).default, true, true)
    }
    loaded.add(language)
  }
  await i18n.changeLanguage(language)
  document.documentElement.lang = language
  try {
    localStorage.setItem(STORAGE_KEY, language)
  } catch {
    // Not remembered across visits; the profile still has it.
  }
}

/** The current UI language. */
export const currentLanguage = (): Language => (isLanguage(i18n.language) ? i18n.language : "en")

void setLanguage(initialLanguage())

export { i18n }

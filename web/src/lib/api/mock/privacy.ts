/** Synthetic-only mock. Not a substitute for Presidio or suitable for real data. */
export function protectMockText(text: string) {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL_ADDRESS]")
    .replace(/\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){11,30}\b/g, "[IBAN_CODE]")
    .replace(/\b(?:sk-ant-|ghp_|sk_live_)[a-zA-Z0-9_-]{12,}/g, "[SECRET]")
}

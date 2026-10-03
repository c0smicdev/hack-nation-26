/** 192 → "03:12" */
export function formatTimestamp(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

/** 545 → "9 min" */
export function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds} s`
  return `${Math.round(seconds / 60)} min`
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" })

/** ISO string → "2 hours ago" */
export function formatRelative(iso: string) {
  const diffSec = (Date.parse(iso) - Date.now()) / 1000
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ]
  for (const [unit, size] of units) {
    if (Math.abs(diffSec) >= size) return relative.format(Math.round(diffSec / size), unit)
  }
  return "just now"
}

export function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

export function pluralize(count: number, word: string, plural = `${word}s`) {
  return `${count} ${count === 1 ? word : plural}`
}

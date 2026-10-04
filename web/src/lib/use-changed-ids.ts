import { useEffect, useRef, useState } from "react"

import type { ID, LiveStep, WorkMap } from "@/lib/api"

/** One comparable entry per graph node: its id and everything that's drawn for it. */
type Signature = Map<ID, string>

const HIGHLIGHT_MS = 3000

/**
 * Ids that are new or changed since the previous value, for a few seconds.
 * Lets the graph flash what the expert's last answer (or decision) just changed.
 * The first value never highlights: everything would be "new".
 */
export function useChangedIds(signature: Signature) {
  const previous = useRef<Signature>(undefined)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [changed, setChanged] = useState<ReadonlySet<ID>>(new Set())
  const key = [...signature].join("\n")

  useEffect(() => {
    const before = previous.current
    previous.current = signature
    if (!before) return
    const next = new Set(
      [...signature].filter(([id, sig]) => before.get(id) !== sig).map(([id]) => id),
    )
    if (!next.size) return
    setChanged(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setChanged(new Set()), HIGHLIGHT_MS)
    // `key` stands for `signature`: a new Map with the same content isn't a change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => () => clearTimeout(timer.current), [])

  return changed
}

export function workMapSignature(map?: WorkMap): Signature {
  const sig: Signature = new Map()
  for (const s of map?.steps ?? []) {
    sig.set(s.id, `${s.kind}|${s.title}|${s.decision}`)
    s.guardrails.forEach((g) => sig.set(g.id, `${g.kind}|${g.rule}|${g.escalateTo ?? ""}`))
    s.edgeCases.forEach((e) => sig.set(e.id, `${e.when}|${e.then}`))
  }
  return sig
}

export function liveStepsSignature(steps: LiveStep[]): Signature {
  return new Map(
    steps.map((s) => [
      s.id,
      `${s.kind}|${s.title}|${s.decision}|${!!s.deviation}|${!!s.guardrailNoted}`,
    ]),
  )
}

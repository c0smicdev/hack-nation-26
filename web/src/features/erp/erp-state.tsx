import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { type ErpAction, type ErpMessage, openErpChannel } from "@/lib/erp/bridge"
import { INITIAL_INVOICES, type Invoice, type InvoiceStatus } from "@/lib/erp/data"

const STORAGE_KEY = "socrates-erp-v1"
/** A teach tab sends a gate heartbeat every ~2 s; after this long without one, saves go straight through. */
const GATE_TTL_MS = 5000
/** How long to wait for a tutor to say "I'm checking" before saving anyway. */
const PENDING_TIMEOUT_MS = 1500
const DECISION_TIMEOUT_MS = 45_000

export type Dataset = Invoice["set"]

export interface SaveResult {
  allowed: boolean
  message?: string
}

interface ErpState {
  invoices: Invoice[]
  dataset: Dataset
  setDataset: (dataset: Dataset) => void
  update: (id: string, patch: Partial<Invoice>) => void
  reset: () => void
  send: (message: ErpMessage) => void
  /** A tutor is watching and holds saves for review. */
  gate?: { tutor: string }
  /** Ask the tutor (if any) before saving, then save. */
  save: (
    invoice: Invoice,
    action: ErpAction,
    record: Record<string, unknown>,
  ) => Promise<SaveResult>
}

const Ctx = createContext<ErpState | null>(null)

function load(): { invoices: Invoice[]; dataset: Dataset } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as { invoices: Invoice[]; dataset: Dataset }
  } catch {
    // Private mode or corrupt data: start fresh.
  }
  return { invoices: structuredClone(INITIAL_INVOICES), dataset: "batch" }
}

const STATUS_AFTER: Record<ErpAction, InvoiceStatus> = {
  post: "posted",
  hold: "on_hold",
  request_approval: "awaiting_approval",
}

export function ErpProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(load)
  const [gateSeenAt, setGateSeenAt] = useState<{ at: number; tutor: string }>()
  const [now, setNow] = useState(() => Date.now())
  const waiting = useRef(new Map<string, (m: ErpMessage) => void>())
  const channel = useRef<ReturnType<typeof openErpChannel> | null>(null)

  const onMessage = useCallback((message: ErpMessage) => {
    if (message.type === "gate") {
      setGateSeenAt(message.active ? { at: Date.now(), tutor: message.tutor } : undefined)
    }
    if (message.type === "save_pending" || message.type === "save_decision") {
      waiting.current.get(message.requestId)?.(message)
    }
  }, [])

  // Opened lazily: child effects (e.g. "screen" messages) run before this provider's effects.
  const send = useCallback(
    (message: ErpMessage) => {
      channel.current ??= openErpChannel(onMessage)
      channel.current.send(message)
    },
    [onMessage],
  )

  useEffect(() => {
    channel.current ??= openErpChannel(onMessage)
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      channel.current?.close()
      channel.current = null
      clearInterval(timer)
    }
  }, [onMessage])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // Not persisted; fine for a demo.
    }
  }, [state])

  const gateActive = !!gateSeenAt && now - gateSeenAt.at < GATE_TTL_MS
  const tutor = gateSeenAt?.tutor
  const gate = useMemo(() => (gateActive && tutor ? { tutor } : undefined), [gateActive, tutor])

  const update = useCallback((id: string, patch: Partial<Invoice>) => {
    setState((s) => ({
      ...s,
      invoices: s.invoices.map((inv) => (inv.id === id ? { ...inv, ...patch } : inv)),
    }))
  }, [])

  const save = useCallback(
    async (invoice: Invoice, action: ErpAction, record: Record<string, unknown>) => {
      let result: SaveResult = { allowed: true }
      if (gate) {
        const requestId = crypto.randomUUID()
        result = await new Promise<SaveResult>((resolve) => {
          let pending = false
          const done = (r: SaveResult) => {
            waiting.current.delete(requestId)
            clearTimeout(timeout)
            resolve(r)
          }
          // Nobody answered: the tutor tab is gone, don't block the user.
          let timeout = setTimeout(() => done({ allowed: true }), PENDING_TIMEOUT_MS)
          waiting.current.set(requestId, (m) => {
            if (m.type === "save_pending" && !pending) {
              pending = true
              clearTimeout(timeout)
              timeout = setTimeout(() => done({ allowed: true }), DECISION_TIMEOUT_MS)
            }
            if (m.type === "save_decision") done({ allowed: m.allow, message: m.message })
          })
          send({ type: "save_request", requestId, invoiceId: invoice.id, action, record })
        })
      }
      if (result.allowed) {
        update(invoice.id, { status: STATUS_AFTER[action] })
        send({
          type: "action",
          invoiceId: invoice.id,
          action,
          summary: `Invoice ${invoice.id} ${action === "post" ? "posted" : action === "hold" ? "put on hold" : "sent for approval"}`,
        })
      }
      return result
    },
    [gate, send, update],
  )

  const value = useMemo<ErpState>(
    () => ({
      invoices: state.invoices,
      dataset: state.dataset,
      setDataset: (dataset) => setState((s) => ({ ...s, dataset })),
      update,
      reset: () =>
        setState({ invoices: structuredClone(INITIAL_INVOICES), dataset: state.dataset }),
      send,
      gate,
      save,
    }),
    [state, update, send, gate, save],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useErp() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useErp must be used inside <ErpProvider>")
  return ctx
}

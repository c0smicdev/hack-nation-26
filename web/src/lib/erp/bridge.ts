/**
 * Messages between the mock ERP tab and Socrates (capture or teach tab).
 * Both are served from the same origin, so a BroadcastChannel is enough;
 * no browser extension needed.
 */

export type ErpAction = "post" | "hold" | "request_approval"

export const ACTION_LABEL: Record<ErpAction, string> = {
  post: "Post",
  hold: "Put on hold",
  request_approval: "Request approval",
}

export type ErpMessage =
  /** ERP: what's on screen now. */
  | { type: "screen"; screen: string; invoiceId?: string }
  | {
      type: "field_change"
      invoiceId: string
      field: string
      label: string
      from: string
      to: string
    }
  /** ERP: the user started / stopped typing. */
  | { type: "typing"; active: boolean }
  /** ERP: an action was saved. */
  | { type: "action"; invoiceId: string; action: ErpAction; summary: string }
  /** ERP: wants to save; waits for a decision if a gate is active. */
  | {
      type: "save_request"
      requestId: string
      invoiceId: string
      action: ErpAction
      record: Record<string, unknown>
    }
  /** Socrates: I'm checking this save, keep holding. */
  | { type: "save_pending"; requestId: string }
  | { type: "save_decision"; requestId: string; allow: boolean; message: string }
  /** Socrates (teach): hold saves for review. Sent as a heartbeat. */
  | { type: "gate"; active: boolean; tutor: string }

const CHANNEL = "socrates-erp"

export function openErpChannel(onMessage: (message: ErpMessage) => void) {
  const channel = new BroadcastChannel(CHANNEL)
  channel.onmessage = (e: MessageEvent<ErpMessage>) => onMessage(e.data)
  return {
    send: (message: ErpMessage) => channel.postMessage(message),
    close: () => channel.close(),
  }
}

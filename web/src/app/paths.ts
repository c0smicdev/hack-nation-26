import type { ID } from "@/lib/api"

/** Build links here instead of hand-writing URLs, so routes can change in one place. */
export const paths = {
  library: () => "/",
  login: () => "/login",
  workMap: (id: ID, stepId?: ID) =>
    stepId ? `/work-maps/${id}?step=${stepId}` : `/work-maps/${id}`,
  ask: () => "/ask",
  capture: () => "/capture",
  session: (id: ID) => `/capture/${id}`,
  /** A new hire runs a confirmed Work Map while Socrates stands by. */
  supervise: (workMapId: ID) => `/supervise/${workMapId}`,
  /** Mock ERP (opens in its own tab). */
  erp: () => "/erp",
  erpInvoice: (id: string) => `/erp/invoices/${id}`,
}

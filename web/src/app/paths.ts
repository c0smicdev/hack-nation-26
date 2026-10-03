import type { ID } from "@/lib/api"

/** Build links here instead of hand-writing URLs, so routes can change in one place. */
export const paths = {
  library: () => "/",
  workMap: (id: ID, stepId?: ID) =>
    stepId ? `/work-maps/${id}?step=${stepId}` : `/work-maps/${id}`,
  ask: () => "/ask",
  capture: () => "/capture",
}

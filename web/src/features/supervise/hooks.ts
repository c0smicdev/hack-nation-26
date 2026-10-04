import { useQuery } from "@tanstack/react-query"

import { api, type ID } from "@/lib/api"

/** The Work Map the new hire runs; shares the cache with the Work Map page. */
export function useSupervisedWorkMap(id: ID) {
  return useQuery({ queryKey: ["work-maps", id], queryFn: () => api.getWorkMap(id) })
}

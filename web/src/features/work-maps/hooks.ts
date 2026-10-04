import { useMutation, useQuery } from "@tanstack/react-query"

import { api, type ID } from "@/lib/api"

export const workMapKeys = {
  all: ["work-maps"] as const,
  detail: (id: ID) => ["work-maps", id] as const,
}

export function useWorkMaps() {
  return useQuery({
    queryKey: workMapKeys.all,
    queryFn: api.listWorkMaps,
    // While a translation into the reader's language is being prepared, ask again shortly.
    refetchInterval: (q) => (q.state.data?.some((m) => m.translationPending) ? 4000 : false),
  })
}

export function useWorkMap(id: ID) {
  return useQuery({
    queryKey: workMapKeys.detail(id),
    queryFn: () => api.getWorkMap(id),
    // While a translation into the reader's language is being prepared, ask again shortly.
    refetchInterval: (q) => (q.state.data?.translationPending ? 4000 : false),
  })
}

/** AI drafts a new workflow's title + description from a free-text chat. */
export function useDraftWorkflow() {
  return useMutation({ mutationFn: api.draftWorkflow })
}

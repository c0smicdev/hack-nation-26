import { useMutation, useQuery } from "@tanstack/react-query"

import { api, type ID } from "@/lib/api"

export const workMapKeys = {
  all: ["work-maps"] as const,
  detail: (id: ID) => ["work-maps", id] as const,
}

export function useWorkMaps() {
  return useQuery({ queryKey: workMapKeys.all, queryFn: api.listWorkMaps })
}

export function useWorkMap(id: ID) {
  return useQuery({
    queryKey: workMapKeys.detail(id),
    queryFn: () => api.getWorkMap(id),
  })
}

/** AI drafts a new workflow's title + description from a free-text chat. */
export function useDraftWorkflow() {
  return useMutation({ mutationFn: api.draftWorkflow })
}

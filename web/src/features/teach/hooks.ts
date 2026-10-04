import { useQuery } from "@tanstack/react-query"

import { api, type ID } from "@/lib/api"

/** Only confirmed workflows are safe to learn from. */
export function useConfirmedWorkMaps() {
  return useQuery({
    queryKey: ["work-maps"],
    queryFn: api.listWorkMaps,
    select: (maps) => maps.filter((m) => m.status === "confirmed"),
  })
}

export function useLessonWorkMap(id: ID) {
  return useQuery({ queryKey: ["work-maps", id], queryFn: () => api.getWorkMap(id) })
}

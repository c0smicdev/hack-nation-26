import { useMutation } from "@tanstack/react-query"

import { api } from "@/lib/api"

export function useAsk() {
  return useMutation({ mutationFn: api.ask })
}

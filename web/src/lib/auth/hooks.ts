import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "@/lib/api"

import { useAuth } from "./context"
import { authEnabled } from "./supabase"

const meKey = (userId: string | undefined) => ["me", userId ?? "local"] as const

/** The signed-in user's profile (mock mode: Sabine). Waits for the login when it's on. */
export function useMe() {
  const { session } = useAuth()
  return useQuery({
    queryKey: meKey(session?.user.id),
    queryFn: api.getMe,
    enabled: !authEnabled || !!session,
    staleTime: Infinity,
  })
}

/** For the onboarding flow (name, role, chattiness). */
export function useUpdateMe() {
  const { session } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.updateMe,
    onSuccess: (profile) => queryClient.setQueryData(meKey(session?.user.id), profile),
  })
}

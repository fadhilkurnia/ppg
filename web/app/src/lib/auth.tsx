import { useQuery, useQueryClient } from '@tanstack/react-query'
import { me } from '@/api/auth'
import { isAuthError } from '@/api/client'
import type { User } from '@/api/types'

export const ME_QUERY_KEY = ['auth', 'me'] as const

export function useMe() {
  return useQuery<User | null>({
    queryKey: ME_QUERY_KEY,
    queryFn: async () => {
      try {
        return await me()
      } catch (err) {
        if (isAuthError(err)) {
          return null
        }
        throw err
      }
    },
    staleTime: 60_000,
    retry: false,
  })
}

export function useSetMe() {
  const qc = useQueryClient()
  return (user: User | null) => qc.setQueryData(ME_QUERY_KEY, user)
}

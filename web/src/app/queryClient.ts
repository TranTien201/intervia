import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/api/client'

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        refetchOnWindowFocus: false,
        // Don't retry business errors (404, 409…); retry network blips twice.
        retry: (count, err) => !(err instanceof ApiError) && count < 2,
      },
    },
  })
}

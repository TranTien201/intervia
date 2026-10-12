import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { qk } from '@/api/keys'
import type { AuthState } from '@/api/types'
import { routes } from '@/app/routes'
import { TooltipProvider } from '@/components/ui/tooltip'
import { DEFAULT_USER } from '@/mocks/auth'

/**
 * Render the real route tree at `path`, backed by the MSW mock API.
 * The user is known from the start (login off, MVP-1 default user), so pages render at once
 * instead of waiting for `GET /auth/me`. `{ auth: 'fetch' }` asks the mock instead (login tests).
 */
export function renderRoute(
  path: string,
  { auth = 'default' }: { auth?: 'default' | 'fetch' } = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (auth === 'default')
    queryClient.setQueryData<AuthState>(qk.me, { auth_enabled: false, user: DEFAULT_USER })
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  return {
    router,
    ...render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </QueryClientProvider>,
    ),
  }
}

export function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // As a wrapper, so `rerender` keeps the provider.
  return render(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  })
}

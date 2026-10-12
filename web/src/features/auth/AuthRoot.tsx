import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { NetworkError, setUnauthenticatedHandler } from '@/api/client'
import { useMe } from '@/api/hooks'
import { qk } from '@/api/keys'
import type { AuthState } from '@/api/types'
import { ServerUnreachableView } from '@/components/ErrorPages'
import { ErrorState } from '@/components/PageStates'
import { loginPath } from './next-path'

/**
 * Root of the route tree. A 401 `unauthenticated` from any request (the login expired, or the
 * user logged out in another tab) marks the user as logged out, which sends them to /login.
 */
export function AuthRoot() {
  const qc = useQueryClient()
  useEffect(() => {
    setUnauthenticatedHandler(() =>
      qc.setQueryData<AuthState>(qk.me, { auth_enabled: true, user: null }),
    )
    return () => setUnauthenticatedHandler(null)
  }, [qc])
  return <Outlet />
}

/**
 * Pages that need a logged-in user. With login off (MVP-1 default user) it lets everything
 * through. Not logged in → /login?next=<this page>.
 */
export function RequireAuth() {
  const me = useMe()
  const location = useLocation()

  if (me.isError)
    return me.error instanceof NetworkError ? (
      <ServerUnreachableView onRetry={() => void me.refetch()} />
    ) : (
      <div className="p-8">
        <ErrorState error={me.error} onRetry={() => void me.refetch()} />
      </div>
    )
  // Usually a few ms; nothing to show yet, and a skeleton would flash.
  if (!me.data) return null
  if (me.data.auth_enabled && !me.data.user) return <Navigate to={loginPath(location)} replace />
  return <Outlet />
}

import { Navigate, Outlet, useParams } from 'react-router'
import { useSession } from '@/api/hooks'
import { PageError, SessionNotFoundView } from '@/components/ErrorPages'
import { sessionPath } from './session-nav'

/**
 * Parent route for every `/sessions/:id/...` page: if the session is gone (wrong link,
 * deleted) or the server is down, show the error page instead of the step page.
 * While loading it renders the page, which shows its own skeleton. A background refetch that
 * fails (e.g. offline during the interview) keeps the page: it has the data and its own notices.
 */
export function SessionGate() {
  const { id = '' } = useParams()
  const session = useSession(id)
  if (session.isError && !session.data)
    return (
      <PageError
        error={session.error}
        onRetry={() => void session.refetch()}
        notFound={<SessionNotFoundView />}
      />
    )
  return <Outlet />
}

/** `/sessions/:id` alone: open the step the session is at. */
export function SessionIndexRedirect() {
  const { id = '' } = useParams()
  const session = useSession(id)
  return session.data ? <Navigate to={sessionPath(session.data)} replace /> : null
}

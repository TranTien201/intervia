import { Navigate, useParams } from 'react-router'
import { useSession } from '@/api/hooks'
import { Page } from '@/components/Page'
import { PageSkeleton } from '@/components/PageStates'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { sessionPath } from '@/features/sessions/session-nav'
import { ReviewHeader } from './ReviewHeader'
import { ReviewSide } from './ReviewSide'
import { Transcript } from './Transcript'

// [6] Xem lại (UI-7): read back a finished session. MVP-2 adds the "Báo cáo" tab.
export function ReviewPage() {
  const { id = '' } = useParams()
  const session = useSession(id).data

  // SessionGate shows the error page if the session can't be loaded.
  if (!session)
    return (
      <Page width="wide">
        <PageSkeleton variant="detail" />
      </Page>
    )
  // Nothing to read back yet: open the step the session is at (plan, match, interview).
  if (session.status !== 'completed') return <Navigate to={sessionPath(session)} replace />

  return (
    <Page width="wide">
      <ReviewHeader session={session} />
      <Tabs defaultValue="transcript" className="mt-6 gap-4">
        <TabsList className="h-10 border border-line bg-surface">
          <TabsTrigger
            value="transcript"
            className="px-4 text-ink2 data-[state=active]:bg-accent-soft data-[state=active]:text-accent data-[state=active]:shadow-none"
          >
            Transcript
          </TabsTrigger>
          <TabsTrigger value="report" disabled className="gap-1.5 px-4 text-ink2">
            Báo cáo
            <span className="text-xs font-normal">(MVP-2)</span>
          </TabsTrigger>
        </TabsList>
        {/* Phones: the side column goes above the transcript (collapsed). */}
        <TabsContent
          value="transcript"
          className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-10"
        >
          <div className="min-w-0 lg:order-first">
            <Transcript sessionId={session.id} />
          </div>
          <ReviewSide sessionId={session.id} className="order-first lg:order-none" />
        </TabsContent>
      </Tabs>
    </Page>
  )
}

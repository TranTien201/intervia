import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { Link, useParams } from 'react-router'
import {
  useCvAnalysis,
  useJdAnalysis,
  useReanalyzeCv,
  useReanalyzeJd,
  useSession,
} from '@/api/hooks'
import { qk } from '@/api/keys'
import type { AnalysisProgress, AnalysisStatus, SessionSummary } from '@/api/types'
import { Banner } from '@/components/Banner'
import { Page, PageTitle } from '@/components/Page'
import { ErrorState, PageSkeleton } from '@/components/PageStates'
import { SESSION_STEPS, Stepper } from '@/components/Stepper'
import { Button } from '@/components/ui/button'
import { AnalysisSteps } from '@/features/library/detail'
import { newSessionPath, sessionLabel } from '@/features/sessions/session-nav'
import { codeMessage } from '@/lib/errors'
import { MatchDone } from './MatchDone'

// [3] Đối chiếu CV–JD. UI-5.2: while the CV/JD are being analysed. UI-5.3: the result.
export function SessionMatchPage() {
  const { id = '' } = useParams()
  const session = useSession(id).data
  return (
    <Page>
      <Stepper
        steps={SESSION_STEPS.map((label, i) => ({
          label,
          href: i === 0 && session ? newSessionPath(session) : undefined,
        }))}
        current={1}
        className="mb-6"
      />
      <PageTitle>Đối chiếu CV–JD</PageTitle>
      {session ? (
        <>
          <p className="mt-1 mb-6 text-sm text-ink2">{sessionLabel(session)}</p>
          <MatchBody session={session} />
        </>
      ) : (
        // SessionGate shows the error page if the session can't be loaded.
        <div className="mt-6">
          <PageSkeleton variant="detail" />
        </div>
      )}
    </Page>
  )
}

function MatchBody({ session }: { session: SessionSummary }) {
  const analysis = useSessionAnalysis(session)

  if (analysis.error) return <ErrorState error={analysis.error} onRetry={analysis.refetch} />
  if (analysis.status === 'loading') return <PageSkeleton variant="detail" />
  if (analysis.status === 'failed')
    return (
      <AnalysisFailed session={session} kind={analysis.failed!} error={analysis.progress.error} />
    )
  if (analysis.status === 'running') return <AnalysisSteps progress={analysis.progress} />
  return <MatchDone session={session} />
}

type Kind = 'cv' | 'jd'

/**
 * Follow the CV and JD analyses of a session as one list of steps (CV first).
 * State comes from the server (polling), so a reload mid-way keeps watching
 * the same job instead of starting a new one.
 */
function useSessionAnalysis(session: SessionSummary) {
  const qc = useQueryClient()
  const cv = useCvAnalysis(session.cv.id)
  const jd = useJdAnalysis(session.jd.id)

  const failed: Kind | null =
    cv.data?.status === 'failed' ? 'cv' : jd.data?.status === 'failed' ? 'jd' : null
  const status: AnalysisStatus | 'loading' =
    !cv.data || !jd.data
      ? 'loading'
      : failed
        ? 'failed'
        : cv.data.status === 'done' && jd.data.status === 'done'
          ? 'done'
          : 'running'

  // When a job ends while the page is open: refresh what depends on it
  // (CV/JD summaries in the library, the session's versions, the match block).
  const prev = useRef(status)
  useEffect(() => {
    if (prev.current === 'running' && (status === 'done' || status === 'failed')) {
      void qc.invalidateQueries({ queryKey: qk.cvs })
      void qc.invalidateQueries({ queryKey: qk.jds })
      // Drafts move to the first analysed version of the CV/JD.
      void qc.invalidateQueries({ queryKey: qk.session(session.id), exact: true })
      void qc.invalidateQueries({ queryKey: qk.match(session.id) })
    }
    prev.current = status
  }, [status, qc, session.id])

  const progress: AnalysisProgress = {
    status: status === 'loading' ? 'pending' : status,
    steps: [
      ...(cv.data?.steps ?? []).map((s) => ({ ...s, key: `cv-${s.key}` })),
      ...(jd.data?.steps ?? []).map((s) => ({ ...s, key: `jd-${s.key}` })),
    ],
    error: (failed === 'cv' ? cv.data?.error : jd.data?.error) ?? null,
  }

  return {
    status,
    failed,
    progress,
    error: cv.error ?? jd.error,
    refetch: () => {
      if (cv.isError) void cv.refetch()
      if (jd.isError) void jd.refetch()
    },
  }
}

const LABEL: Record<Kind, string> = { cv: 'CV', jd: 'JD' }

/** Why it failed + "Thử lại" (not for a scanned file: same file, same result) / "Tải file khác". */
function AnalysisFailed({
  session,
  kind,
  error,
}: {
  session: SessionSummary
  kind: Kind
  error: AnalysisProgress['error']
}) {
  const reanalyzeCv = useReanalyzeCv()
  const reanalyzeJd = useReanalyzeJd()
  const reanalyze = kind === 'cv' ? reanalyzeCv : reanalyzeJd
  const retryable = error?.code !== 'no_text_in_file'

  return (
    <Banner
      variant="error"
      title={`Chưa phân tích được ${LABEL[kind]} “${session[kind].name}”`}
      action={
        <div className="flex flex-wrap gap-2">
          {retryable && (
            <Button
              size="sm"
              variant="secondary"
              loading={reanalyze.isPending}
              onClick={() => reanalyze.mutate(session[kind].id)}
            >
              Thử lại
            </Button>
          )}
          <Button asChild size="sm" variant={retryable ? 'ghost' : 'secondary'}>
            <Link to={newSessionPath(session, kind)}>
              {kind === 'cv' ? 'Tải file khác' : 'Thêm JD khác'}
            </Link>
          </Button>
        </div>
      }
    >
      {error ? codeMessage(error) : 'Thử lại sau ít phút.'}
      {reanalyze.isError && <p className="mt-1">Chưa chạy lại được. Bạn thử lại sau ít phút.</p>}
    </Banner>
  )
}

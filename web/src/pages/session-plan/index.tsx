import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ApiError } from '@/api/client'
import { useBlueprint, useCreateBlueprint, useSession } from '@/api/hooks'
import { qk } from '@/api/keys'
import type { AnalysisProgress, BlueprintView, Mode, SessionSummary } from '@/api/types'
import { Banner } from '@/components/Banner'
import { Card } from '@/components/Card'
import { Page, PageTitle } from '@/components/Page'
import { ErrorState, PageSkeleton } from '@/components/PageStates'
import { SESSION_STEPS, Stepper } from '@/components/Stepper'
import { Button } from '@/components/ui/button'
import { AnalysisSteps } from '@/features/library/detail'
import { newSessionPath, sessionLabel, sessionPath } from '@/features/sessions/session-nav'
import { startInterview } from '@/features/sessions/start-interview'
import { codeMessage, errorMessage } from '@/lib/errors'
import { MicCheck } from './MicCheck'
import { ModePicker } from './ModePicker'
import { PlanTable } from './PlanTable'
import { MIC_PROBLEM, type MicProblem } from './use-mic-test'

// [4] Kế hoạch & chuẩn bị (UI-5.4): the blueprint (read-only), start mode, mic check, start.
export function SessionPlanPage() {
  const { id = '' } = useParams()
  const session = useSession(id).data
  const draft = session?.status === 'draft'
  return (
    <Page>
      <Stepper
        steps={SESSION_STEPS.map((label, i) => ({
          label,
          // Going back only while the inputs can still change.
          href:
            session && draft ? [newSessionPath(session), `/sessions/${id}/match`][i] : undefined,
        }))}
        current={2}
        className="mb-6"
      />
      <PageTitle>Kế hoạch & chuẩn bị</PageTitle>
      {session ? (
        <>
          <p className="mt-1 mb-6 text-sm text-ink2">{sessionLabel(session)}</p>
          <PlanBody session={session} />
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

const MAKING_PLAN: AnalysisProgress = {
  status: 'running',
  steps: [
    { key: 'match', label: 'Đã đối chiếu CV–JD', status: 'done' },
    { key: 'plan', label: 'Đang lập kế hoạch phỏng vấn', status: 'running' },
  ],
  error: null,
}

function PlanBody({ session }: { session: SessionSummary }) {
  const locked = session.status !== 'draft'
  const blueprint = useBlueprint(session.id)
  const create = useCreateBlueprint()
  const bp = blueprint.data

  // Opened directly (not via "Lưu và tạo kế hoạch") before any plan exists: make one.
  const requested = useRef(false)
  useEffect(() => {
    if (bp?.status === 'pending' && !locked && !requested.current) {
      requested.current = true
      create.mutate(session.id)
    }
  }, [bp?.status, locked, create, session.id])

  if (blueprint.error) return <ErrorState error={blueprint.error} onRetry={blueprint.refetch} />
  if (!bp) return <PageSkeleton variant="detail" />

  const retry = (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="secondary"
        loading={create.isPending}
        onClick={() => create.mutate(session.id)}
      >
        Thử lại
      </Button>
      <Button asChild size="sm" variant="ghost">
        <Link to={`/sessions/${session.id}/match`}>Về trang Đối chiếu</Link>
      </Button>
    </div>
  )

  if (create.isError && bp.status === 'pending')
    return (
      <Banner variant="error" title="Chưa tạo được kế hoạch" action={retry}>
        {errorMessage(create.error)}
      </Banner>
    )
  if (bp.status === 'failed')
    return (
      <Banner variant="error" title="Chưa tạo được kế hoạch" action={locked ? undefined : retry}>
        {bp.error ? codeMessage(bp.error) : 'Thử lại sau ít phút.'}
      </Banner>
    )
  if (bp.status === 'pending' && locked)
    return <p className="text-sm text-ink2">Phiên này không có kế hoạch phỏng vấn.</p>
  if (bp.status !== 'done') return <AnalysisSteps progress={MAKING_PLAN} />

  return <PlanReady session={session} blueprint={bp} />
}

function PlanReady({ session, blueprint }: { session: SessionSummary; blueprint: BlueprintView }) {
  const locked = session.status !== 'draft'
  const qc = useQueryClient()
  const navigate = useNavigate()
  const recreate = useCreateBlueprint()
  const [mode, setMode] = useState<Mode>(session.mode)
  const [micProblem, setMicProblem] = useState<MicProblem | null>(null)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<unknown>(null)
  // A plan made from older CV/JD versions than the session now uses.
  const stale = blueprint.stale && !locked

  const onMicProblem = (problem: MicProblem) => {
    setMicProblem(problem)
    setMode('text')
  }

  const start = async () => {
    setStarting(true)
    setStartError(null)
    try {
      await startInterview(session.id, mode)
      void qc.invalidateQueries({ queryKey: qk.sessions })
      await qc.invalidateQueries({ queryKey: qk.session(session.id), exact: true })
      await navigate(`/sessions/${session.id}/interview`)
    } catch (err) {
      setStartError(err)
      setStarting(false)
      // Already started elsewhere, or the plan changed: show what the server has now.
      if (err instanceof ApiError && err.status === 409) {
        void qc.invalidateQueries({ queryKey: qk.session(session.id), exact: true })
        void qc.invalidateQueries({ queryKey: qk.blueprint(session.id) })
      }
    }
  }

  return (
    <div className="grid gap-6">
      {locked && (
        <Banner title="Phiên đã bắt đầu nên kế hoạch đã khóa">
          Đây là kế hoạch mà phiên này đã dùng.
        </Banner>
      )}
      {stale && (
        <Banner
          variant="warning"
          title="Hồ sơ đã thay đổi, tạo lại kế hoạch?"
          action={
            <Button
              size="sm"
              variant="secondary"
              loading={recreate.isPending}
              onClick={() => recreate.mutate(session.id)}
            >
              Tạo lại kế hoạch
            </Button>
          }
        >
          Kế hoạch này lập từ bản CV/JD cũ. Cần tạo lại trước khi bắt đầu.
          {recreate.isError && (
            <p className="mt-1">Chưa tạo lại được: {errorMessage(recreate.error)}</p>
          )}
        </Banner>
      )}

      <PlanTable blueprint={blueprint} />

      {!locked && (
        <div className="grid items-start gap-6 md:grid-cols-2">
          <Card className="grid gap-3 p-5">
            <ModePicker
              value={mode}
              onChange={(m) => {
                setMode(m)
                if (m !== 'text') setMicProblem(null)
              }}
              disabled={starting}
            />
            {micProblem && mode === 'text' && (
              <Banner variant="warning" title="Đã chuyển sang Text vì mic không dùng được">
                {MIC_PROBLEM[micProblem].reason} {MIC_PROBLEM[micProblem].fix}
              </Banner>
            )}
          </Card>
          {mode !== 'text' && <MicCheck onProblem={onMicProblem} />}
        </div>
      )}

      <div className="grid gap-2 border-t border-line pt-4">
        {locked ? (
          <div className="flex justify-end">
            <Button asChild>
              <Link to={sessionPath(session)}>
                {session.status === 'completed' ? 'Xem lại phiên' : 'Vào phỏng vấn'} <ArrowRight />
              </Link>
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button asChild variant="ghost">
              <Link to={`/sessions/${session.id}/match`}>
                <ArrowLeft /> Đối chiếu
              </Link>
            </Button>
            <Button loading={starting} disabled={stale} onClick={() => void start()}>
              Bắt đầu phỏng vấn <ArrowRight />
            </Button>
          </div>
        )}
        {startError != null && !starting && (
          <p role="alert" className="text-sm text-danger">
            Chưa bắt đầu được: {errorMessage(startError)}
          </p>
        )}
      </div>
    </div>
  )
}

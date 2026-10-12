import { ArrowLeft, ArrowRight, ExternalLink } from 'lucide-react'
import { useRef, useState, type ReactNode, type RefObject } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  useBlueprint,
  useCreateBlueprint,
  useCv,
  useCvVersion,
  useJd,
  useJdVersion,
  useMatch,
  useUpdateSessionVersions,
} from '@/api/hooks'
import type { MatchResult, SessionSummary, VersionRef } from '@/api/types'
import { Banner } from '@/components/Banner'
import { Card } from '@/components/Card'
import { PageSkeleton, QueryView } from '@/components/PageStates'
import { SectionLabel } from '@/components/SectionLabel'
import { Button } from '@/components/ui/button'
import { ProfileEditor } from '@/features/profile/ProfileEditor'
import { RequirementsEditor } from '@/features/profile/RequirementsEditor'
import type { VersionedEditorHandle } from '@/features/profile/use-versioned-draft'
import { newSessionPath } from '@/features/sessions/session-nav'
import { errorMessage } from '@/lib/errors'

type Kind = 'cv' | 'jd'
type Versions = { cv_version?: number; jd_version?: number }

/**
 * [3] once the CV and JD are analysed (UI-5.3): profile | requirements side by side, the
 * code-computed match, and "Lưu và tạo kế hoạch". Editors show the versions the session uses;
 * saving one creates a new version of the CV/JD and switches the session to it.
 */
export function MatchDone({ session }: { session: SessionSummary }) {
  const navigate = useNavigate()
  const locked = session.status !== 'draft'
  const cvEditor = useRef<VersionedEditorHandle>(null)
  const jdEditor = useRef<VersionedEditorHandle>(null)
  const switchVersions = useUpdateSessionVersions()
  const blueprint = useBlueprint(session.id)
  const createBlueprint = useCreateBlueprint()
  const [busy, setBusy] = useState(false)
  // Newest versions in the library, to tell when the session is behind.
  const cvLatest = useCv(session.cv.id).data?.latest_version ?? null
  const jdLatest = useJd(session.jd.id).data?.latest_version ?? null

  const use = (body: Versions) => switchVersions.mutate({ id: session.id, ...body })

  const next = async () => {
    const planPath = `/sessions/${session.id}/plan`
    if (locked) return navigate(planPath)
    setBusy(true)
    try {
      // Unsaved edits first; a failed save shows its error in its editor and stops here.
      const [cv, jd] = await Promise.all([cvEditor.current?.save(), jdEditor.current?.save()])
      if (cv === null || jd === null) return
      const changes: Versions = {}
      if (cv !== undefined && cv !== session.cv.version) changes.cv_version = cv
      if (jd !== undefined && jd !== session.jd.version) changes.jd_version = jd
      const changed = Object.keys(changes).length > 0
      if (changed) await switchVersions.mutateAsync({ id: session.id, ...changes })
      // Keep a plan that is ready (or being made) for these exact versions.
      const bp = blueprint.data
      const keep =
        !changed && bp && (bp.status === 'running' || (bp.status === 'done' && !bp.stale))
      if (!keep) await createBlueprint.mutateAsync(session.id)
      await navigate(planPath)
    } catch {
      // Shown below the footer buttons.
    } finally {
      setBusy(false)
    }
  }

  const footerError = switchVersions.error ?? createBlueprint.error

  return (
    <div className="grid gap-6">
      {locked && (
        <Banner title="Phiên đã bắt đầu nên đầu vào đã khóa">
          Bạn chỉ xem được hồ sơ và yêu cầu mà phiên này đã dùng.
        </Banner>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Column
          kind="cv"
          title="Hồ sơ của bạn · từ CV"
          item={session.cv}
          latest={cvLatest}
          locked={locked}
          onUse={(v) => use({ cv_version: v })}
        >
          {(version, readOnly) => (
            <CvColumnEditor
              session={session}
              version={version}
              readOnly={readOnly}
              editorRef={cvEditor}
              onSaved={(v) => use({ cv_version: v })}
            />
          )}
        </Column>
        <div className="grid gap-6">
          <Column
            kind="jd"
            title="Yêu cầu của JD"
            item={session.jd}
            latest={jdLatest}
            locked={locked}
            onUse={(v) => use({ jd_version: v })}
          >
            {(version, readOnly) => (
              <JdColumnEditor
                session={session}
                version={version}
                readOnly={readOnly}
                editorRef={jdEditor}
                onSaved={(v) => use({ jd_version: v })}
              />
            )}
          </Column>
          <MatchBlock sessionId={session.id} />
        </div>
      </div>

      <div className="grid gap-2 border-t border-line pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button asChild variant="ghost">
            <Link to={newSessionPath(session)}>
              <ArrowLeft /> Quay lại
            </Link>
          </Button>
          <Button loading={busy} onClick={() => void next()}>
            {locked ? 'Xem kế hoạch' : 'Lưu và tạo kế hoạch'} <ArrowRight />
          </Button>
        </div>
        {footerError && !busy && (
          <p role="alert" className="text-sm text-danger">
            Chưa tạo được kế hoạch: {errorMessage(footerError)}
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * One side: "Name · bản N", "Sửa trong thư viện ↗" (new tab, so edits here are not lost),
 * then the editor. If the library has a newer version than the session uses, the editor is
 * view-only (saving from an old base would conflict) and offers to switch to the newest.
 */
function Column({
  kind,
  title,
  item: v,
  latest,
  locked,
  onUse,
  children,
}: {
  kind: Kind
  title: string
  item: VersionRef
  latest: number | null
  locked: boolean
  onUse: (version: number) => void
  children: (version: number, readOnly: boolean) => ReactNode
}) {
  const version = v.version
  const behind = !locked && version !== null && latest !== null && latest > version

  return (
    <Card className="grid gap-4">
      <div className="grid gap-1">
        <h2 className="font-semibold text-ink">
          {v.name}{' '}
          {version !== null && <span className="font-normal text-ink2">· bản {version}</span>}
        </h2>
        <a
          href={`/library/${kind}/${v.id}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 justify-self-start text-sm text-accent underline-offset-4 hover:underline"
        >
          Sửa trong thư viện <ExternalLink className="size-3.5" aria-hidden />
          <span className="sr-only">(mở thẻ mới)</span>
        </a>
      </div>
      {behind && (
        <Banner
          variant="warning"
          title={`Thư viện đã có bản ${latest} mới hơn`}
          action={
            <Button size="sm" variant="secondary" onClick={() => onUse(latest)}>
              Dùng bản {latest}
            </Button>
          }
        >
          Phiên này đang dùng bản {version}, chỉ xem được. Chuyển sang bản mới để sửa tiếp.
        </Banner>
      )}
      <SectionLabel as="h3">{title}</SectionLabel>
      {version === null ? <PageSkeleton rows={3} /> : children(version, locked || behind)}
    </Card>
  )
}

interface EditorProps {
  session: SessionSummary
  version: number
  readOnly: boolean
  editorRef: RefObject<VersionedEditorHandle | null>
  onSaved: (version: number) => void
}

function CvColumnEditor({ session, version, readOnly, editorRef, onSaved }: EditorProps) {
  const query = useCvVersion(session.cv.id, version)
  return (
    <QueryView query={query} loading={<PageSkeleton rows={3} />}>
      {(v) => (
        <ProfileEditor
          ref={editorRef}
          cvId={session.cv.id}
          version={v}
          readOnly={readOnly}
          onSaved={(saved) => onSaved(saved.version)}
        />
      )}
    </QueryView>
  )
}

function JdColumnEditor({ session, version, readOnly, editorRef, onSaved }: EditorProps) {
  const query = useJdVersion(session.jd.id, version)
  return (
    <QueryView query={query} loading={<PageSkeleton rows={3} />}>
      {(v) => (
        <RequirementsEditor
          ref={editorRef}
          jdId={session.jd.id}
          version={v}
          readOnly={readOnly}
          onSaved={(saved) => onSaved(saved.version)}
        />
      )}
    </QueryView>
  )
}

/** Computed by code from the saved versions: information, not a score (no red). */
function MatchBlock({ sessionId }: { sessionId: string }) {
  const match = useMatch(sessionId)
  return (
    <Card className="grid gap-3">
      <SectionLabel>Đối chiếu</SectionLabel>
      <QueryView query={match} loading={<PageSkeleton rows={2} />}>
        {(m) => <MatchLines match={m} />}
      </QueryView>
      <p className="text-xs text-ink2">Tính theo bản đã lưu, chỉ để tham khảo, không phải điểm.</p>
    </Card>
  )
}

function MatchLines({ match }: { match: MatchResult }) {
  const groups = [
    { label: 'bắt buộc', ...match.required },
    { label: 'nên có', ...match.preferred },
  ].filter((g) => g.covered.length + g.missing.length > 0)
  if (groups.length === 0)
    return <p className="text-sm text-ink2">JD chưa có yêu cầu nào để đối chiếu.</p>
  return (
    <div className="grid gap-3 text-sm text-ink">
      {groups.map((g) => (
        <div key={g.label} className="grid gap-1">
          <p>
            <span aria-hidden>✓ </span>Có trong CV: {g.covered.length}/
            {g.covered.length + g.missing.length} {g.label}
          </p>
          {g.missing.length > 0 && (
            <>
              <p className="text-ink2">
                <span aria-hidden>– </span>Chưa thấy trong CV:
              </p>
              <ul className="grid gap-0.5 pl-4">
                {g.missing.map((c) => (
                  <li key={c.id}>{c.name}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      ))}
    </div>
  )
}

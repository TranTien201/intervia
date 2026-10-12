import { RotateCcw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useDeleteSession } from '@/api/hooks'
import type { SessionSummary, VersionRef } from '@/api/types'
import { InlineConfirm } from '@/components/InlineConfirm'
import { PageTitle } from '@/components/Page'
import { Button } from '@/components/ui/button'
import { newSessionPath, sessionFullLabel, sessionLabel } from '@/features/sessions/session-nav'
import { errorMessage } from '@/lib/errors'
import { fullDate } from '@/lib/format'
import { notifyError, notifySaved } from '@/lib/notify'

/** Page 6 header (UI-7.1): what was practised, with which inputs, and the page actions. */
export function ReviewHeader({ session }: { session: SessionSummary }) {
  const [deleting, setDeleting] = useState(false)
  return (
    <header className="grid gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <PageTitle>{sessionLabel(session)}</PageTitle>
          <p className="text-sm text-ink2">
            {fullDate(session.created_at)} · {session.progress.asked} câu
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            {/* Same CV, JD, role, level; page 2 picks their latest versions. */}
            <Link to={newSessionPath(session)}>
              <RotateCcw /> Luyện lại với CV & JD này
            </Link>
          </Button>
          <Button variant="danger" onClick={() => setDeleting(true)} disabled={deleting}>
            <Trash2 /> Xóa phiên và dữ liệu
          </Button>
        </div>
      </div>

      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <InputUsed label="CV" kind="cv" item={session.cv} />
        <InputUsed label="JD" kind="jd" item={session.jd} />
      </dl>

      {deleting && <DeleteConfirm session={session} onClose={() => setDeleting(false)} />}
    </header>
  )
}

/** "CV: CV Backend 2026 · bản 3", linking to page 8/9 at the version this session used. */
function InputUsed({ label, kind, item }: { label: string; kind: 'cv' | 'jd'; item: VersionRef }) {
  const href = `/library/${kind}/${item.id}${item.version !== null ? `?v=${item.version}` : ''}`
  return (
    <div className="flex min-w-0 gap-1.5">
      <dt className="text-ink2">{label}:</dt>
      <dd className="min-w-0">
        <Link to={href} className="text-accent underline-offset-4 hover:underline">
          {item.name}
          {item.version !== null && ` · bản ${item.version}`}
        </Link>
      </dd>
    </div>
  )
}

function DeleteConfirm({ session, onClose }: { session: SessionSummary; onClose: () => void }) {
  const del = useDeleteSession()
  const navigate = useNavigate()
  return (
    <InlineConfirm
      title={`Xóa phiên ${sessionFullLabel(session)}?`}
      description="Transcript, câu trả lời và file ghi âm của phiên này sẽ bị xóa. Không hoàn tác được."
      confirmLabel="Xóa phiên"
      pending={del.isPending}
      onConfirm={() =>
        del.mutate(session.id, {
          onSuccess: () => {
            // Leave before the session query refetches into "not found".
            navigate('/')
            notifySaved('Đã xóa phiên')
          },
          onError: (err) => notifyError(errorMessage(err)),
        })
      }
      onCancel={onClose}
    />
  )
}

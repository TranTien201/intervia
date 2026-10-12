import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useDeleteSession, useSessions } from '@/api/hooks'
import type { SessionSummary } from '@/api/types'
import { InlineConfirm } from '@/components/InlineConfirm'
import { KebabMenu } from '@/components/KebabMenu'
import { SectionLabel } from '@/components/SectionLabel'
import { StatusDot } from '@/components/StatusDot'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  groupSessionsByDate,
  sessionFullLabel,
  sessionLabel,
  sessionPath,
} from '@/features/sessions/session-nav'
import { errorMessage } from '@/lib/errors'
import { notifyError, notifySaved } from '@/lib/notify'
import { cn } from '@/lib/utils'

/** Sidebar session list (UI-3.2). */
export function SessionList() {
  const { data, isPending, isError, refetch } = useSessions()
  const { id: openId } = useParams()
  const [confirmId, setConfirmId] = useState<string | null>(null)

  if (isPending) {
    return (
      <div className="grid gap-2 px-3" aria-label="Đang tải danh sách phiên">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-5" />
        ))}
      </div>
    )
  }
  if (isError) {
    return (
      <div className="grid justify-items-start gap-1 px-3 text-sm text-ink2">
        <p>Không tải được danh sách phiên.</p>
        <Button variant="link" size="sm" className="h-auto p-0" onClick={() => refetch()}>
          Thử lại
        </Button>
      </div>
    )
  }
  if (data.length === 0) {
    return <p className="px-3 text-sm text-ink2">Chưa có phiên nào</p>
  }

  return (
    <div className="grid gap-4">
      {groupSessionsByDate(data).map((group) => (
        <section key={group.label} className="grid gap-0.5">
          <SectionLabel as="h3" className="px-3 pb-1">
            {group.label}
          </SectionLabel>
          <ul className="grid gap-0.5">
            {group.sessions.map((s) => (
              <li key={s.id}>
                <SessionRow
                  session={s}
                  active={s.id === openId}
                  onDelete={() => setConfirmId(s.id)}
                />
                {confirmId === s.id && (
                  <DeleteSessionConfirm
                    session={s}
                    isOpen={s.id === openId}
                    onClose={() => setConfirmId(null)}
                  />
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function SessionRow({
  session: s,
  active,
  onDelete,
}: {
  session: SessionSummary
  active: boolean
  onDelete: () => void
}) {
  const label = sessionLabel(s)
  return (
    <div
      className={cn(
        'group flex items-center rounded-lg text-sm text-ink2 hover:bg-subtle hover:text-ink',
        active && 'bg-accent-soft font-semibold text-accent hover:bg-accent-soft hover:text-accent',
      )}
    >
      <Link
        to={sessionPath(s)}
        aria-current={active ? 'page' : undefined}
        title={sessionFullLabel(s)}
        className="flex min-w-0 flex-1 items-center gap-2 py-2 pl-3"
      >
        <StatusDot status={s.status} />
        <span className="truncate">{label}</span>
      </Link>
      <KebabMenu
        label={`Tùy chọn cho phiên ${label}`}
        // Touch screens have no hover: keep ⋮ visible there.
        className="mr-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100"
        items={[
          {
            label: 'Xóa phiên và dữ liệu',
            icon: <Trash2 />,
            danger: true,
            onSelect: onDelete,
          },
        ]}
      />
    </div>
  )
}

function DeleteSessionConfirm({
  session,
  isOpen,
  onClose,
}: {
  session: SessionSummary
  /** The session currently shown in the content area: leave it before it disappears. */
  isOpen: boolean
  onClose: () => void
}) {
  const del = useDeleteSession()
  const navigate = useNavigate()
  return (
    <InlineConfirm
      className="mx-1 my-2"
      title={`Xóa phiên ${sessionFullLabel(session)}?`}
      description="Transcript, câu trả lời và file ghi âm của phiên này sẽ bị xóa. Không hoàn tác được."
      confirmLabel="Xóa phiên"
      pending={del.isPending}
      onConfirm={() =>
        del.mutate(session.id, {
          onSuccess: () => {
            if (isOpen) navigate('/')
            onClose()
            notifySaved('Đã xóa phiên')
          },
          onError: (err) => notifyError(errorMessage(err)),
        })
      }
      onCancel={onClose}
    />
  )
}

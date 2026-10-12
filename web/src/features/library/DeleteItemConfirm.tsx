import { useCvSessions, useDeleteCv, useDeleteJd, useJdSessions } from '@/api/hooks'
import { InlineConfirm } from '@/components/InlineConfirm'
import { sessionFullLabel } from '@/features/sessions/session-nav'
import { errorMessage } from '@/lib/errors'
import { notifyError, notifySaved } from '@/lib/notify'

/**
 * Confirmation for deleting a CV/JD together with every session that uses it (UI-4.2).
 * There is deliberately no "delete the CV but keep the sessions" option: the profile those
 * sessions extracted from the CV is still PII (docs/design/ui-pages.md, page 7).
 * Shared by the library list and the CV/JD detail pages.
 */
export function DeleteItemConfirm({
  kind,
  item,
  onClose,
  onDeleted,
  className,
}: {
  kind: 'cv' | 'jd'
  item: { id: string; name: string; session_count: number }
  onClose: () => void
  /** Runs after a successful delete, before `onClose` (e.g. leave the detail page). */
  onDeleted?: () => void
  className?: string
}) {
  const cvSessions = useCvSessions(kind === 'cv' ? item.id : '', kind === 'cv')
  const jdSessions = useJdSessions(kind === 'jd' ? item.id : '', kind === 'jd')
  const sessions = (kind === 'cv' ? cvSessions : jdSessions).data
  const delCv = useDeleteCv()
  const delJd = useDeleteJd()
  const del = kind === 'cv' ? delCv : delJd

  const label = kind === 'cv' ? 'CV' : 'JD'
  // The list loads in the background; the count from the summary is enough to decide.
  const count = sessions?.length ?? item.session_count

  return (
    <InlineConfirm
      className={className}
      title={`Xóa ${label} ${item.name}?`}
      description={
        kind === 'cv'
          ? 'CV, file gốc và mọi phiên bản hồ sơ trích từ nó sẽ bị xóa. Không hoàn tác được.'
          : 'JD và mọi phiên bản yêu cầu trích từ nó sẽ bị xóa. Không hoàn tác được.'
      }
      affected={
        count > 0
          ? {
              summary: `${label} này được dùng trong ${count} phiên. Xóa ${label} sẽ xóa luôn ${count} phiên đó, gồm transcript và file ghi âm.`,
              items: sessions?.map(sessionFullLabel) ?? [],
              moreLabel: (n) => `và ${n} phiên khác`,
            }
          : undefined
      }
      confirmLabel={count > 0 ? `Xóa ${label} và ${count} phiên` : `Xóa ${label}`}
      pending={del.isPending}
      onConfirm={() =>
        del.mutate(item.id, {
          onSuccess: () => {
            onDeleted?.()
            onClose()
            notifySaved(`Đã xóa ${label}`)
          },
          onError: (err) => notifyError(errorMessage(err)),
        })
      }
      onCancel={onClose}
    />
  )
}

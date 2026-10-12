import type { ReactNode } from 'react'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/ui/button'

/** Layout pieces shared by the profile and requirements editors. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <h3 className="font-semibold text-ink">{title}</h3>
      {children}
    </section>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-ink2 italic">{children}</p>
}

export function SaveBar({
  dirty,
  justSaved,
  savedVersion,
  pending,
  error,
  onSave,
  onDiscard,
}: {
  dirty: boolean
  justSaved: boolean
  savedVersion: number
  pending: boolean
  error: string | null
  onSave: () => void
  onDiscard: () => void
}) {
  if (!dirty) {
    return justSaved ? (
      <Badge variant="saved" className="justify-self-start">
        Đã lưu · bản {savedVersion}
      </Badge>
    ) : null
  }
  return (
    <div className="grid gap-2 border-t border-line pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink2">Có thay đổi chưa lưu.</p>
        <div className="flex gap-2">
          <Button variant="ghost" disabled={pending} onClick={onDiscard}>
            Hủy thay đổi
          </Button>
          <Button loading={pending} onClick={onSave}>
            Lưu thành bản {savedVersion + 1}
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          Chưa lưu được: {error} Phần bạn sửa vẫn còn, bấm Lưu để thử lại.
        </p>
      )}
    </div>
  )
}

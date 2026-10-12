import { useState, type FormEvent, type ReactNode } from 'react'
import { useCreateJd, useRenameCv, useRenameJd, useUploadCv } from '@/api/hooks'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { errorMessage } from '@/lib/errors'
import { notifySaved } from '@/lib/notify'
import {
  emptyCvDraft,
  emptyJdDraft,
  jdInputOf,
  serverFieldErrors,
  validateJdDraft,
  validateName,
  type CvDraft,
  type FieldErrors,
  type JdDraft,
} from './drafts'
import { CvUploadFields, JdFields, NameField } from './fields'

const hasErrors = (e: FieldErrors) => Object.values(e).some(Boolean)

function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  pending,
  formError,
  onSubmit,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  submitLabel: string
  pending: boolean
  formError?: string | null
  onSubmit: () => void
  children: ReactNode
}) {
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!pending) onSubmit()
  }
  return (
    // Don't close mid-upload: the request would finish with nothing to show it.
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="border-line bg-surface sm:max-w-xl">
        <form onSubmit={submit} noValidate className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          {children}
          {formError && (
            <p role="alert" className="text-sm text-danger">
              {formError}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              Hủy
            </Button>
            <Button type="submit" loading={pending}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Mount only while open so each opening starts with an empty form. */
export function AddCvDialog({ onClose }: { onClose: () => void }) {
  const upload = useUploadCv()
  const [draft, setDraft] = useState<CvDraft>(emptyCvDraft)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)

  const submit = () => {
    const next: FieldErrors = {
      file: draft.file ? undefined : 'Chọn một file CV.',
      name: validateName(draft.name),
    }
    setErrors(next)
    setFormError(null)
    if (hasErrors(next) || !draft.file) return
    upload.mutate(
      { file: draft.file, name: draft.name.trim() },
      {
        onSuccess: () => {
          notifySaved('Đã thêm CV', 'AI đang đọc CV, xong sẽ hiện trong danh sách.')
          onClose()
        },
        onError: (err) => {
          const fields = serverFieldErrors(err)
          if (fields) setErrors(fields)
          else setFormError(errorMessage(err))
        },
      },
    )
  }

  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Tải CV mới"
      description="CV được lưu trong thư viện để dùng lại cho nhiều phiên luyện tập."
      submitLabel="Tải lên"
      pending={upload.isPending}
      formError={formError}
      onSubmit={submit}
    >
      <CvUploadFields
        value={draft}
        onChange={setDraft}
        errors={errors}
        disabled={upload.isPending}
      />
    </FormDialog>
  )
}

export function AddJdDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateJd()
  const [draft, setDraft] = useState<JdDraft>(emptyJdDraft)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)

  const submit = () => {
    const next = validateJdDraft(draft)
    setErrors(next)
    setFormError(null)
    if (hasErrors(next)) return
    create.mutate(jdInputOf(draft), {
      onSuccess: () => {
        notifySaved('Đã thêm JD', 'AI đang phân tích JD, xong sẽ hiện trong danh sách.')
        onClose()
      },
      onError: (err) => {
        const fields = serverFieldErrors(err)
        if (fields) setErrors(fields)
        else setFormError(errorMessage(err))
      },
    })
  }

  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Thêm JD"
      description="Dán mô tả công việc hoặc tải file PDF/DOCX. JD được lưu để dùng lại cho nhiều phiên."
      submitLabel="Thêm JD"
      pending={create.isPending}
      formError={formError}
      onSubmit={submit}
    >
      <JdFields value={draft} onChange={setDraft} errors={errors} disabled={create.isPending} />
    </FormDialog>
  )
}

export function RenameDialog({
  kind,
  id,
  currentName,
  onClose,
}: {
  kind: 'cv' | 'jd'
  id: string
  currentName: string
  onClose: () => void
}) {
  const renameCv = useRenameCv()
  const renameJd = useRenameJd()
  const rename = kind === 'cv' ? renameCv : renameJd
  const [name, setName] = useState(currentName)
  const [error, setError] = useState<string | undefined>()
  const [formError, setFormError] = useState<string | null>(null)

  const submit = () => {
    const problem = validateName(name)
    setError(problem)
    setFormError(null)
    if (problem) return
    if (name.trim() === currentName) return onClose()
    rename.mutate(
      { id, name: name.trim() },
      {
        onSuccess: () => {
          notifySaved('Đã đổi tên')
          onClose()
        },
        onError: (err) => {
          const fields = serverFieldErrors(err)
          if (fields?.name) setError(fields.name)
          else setFormError(errorMessage(err))
        },
      },
    )
  }

  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={kind === 'cv' ? 'Đổi tên CV' : 'Đổi tên JD'}
      submitLabel="Lưu"
      pending={rename.isPending}
      formError={formError}
      onSubmit={submit}
    >
      <NameField
        label="Tên mới"
        value={name}
        onChange={setName}
        error={error}
        disabled={rename.isPending}
      />
    </FormDialog>
  )
}

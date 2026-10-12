import { FileText, Upload } from 'lucide-react'
import { useId, useRef, useState, type DragEvent } from 'react'
import { Button } from '@/components/ui/button'
import { formatFileSize, UPLOAD_ACCEPT, validateUploadFile } from '@/lib/files'
import { cn } from '@/lib/utils'

const DEFAULT_NOTE = 'CV được lưu trong thư viện của bạn, bạn xóa được bất cứ lúc nào.'

/**
 * Upload box for a CV or JD file: drag & drop or "Chọn file". PDF/DOCX only, max 5 MB.
 * Invalid files never reach `onChange`; the error shows right under the box and
 * the previously chosen file (if any) is kept.
 *
 * `error` is for errors found later, e.g. the server's `file_too_large` / `unsupported_file`.
 */
export function FileDropzone({
  value,
  onChange,
  error,
  note = DEFAULT_NOTE,
  label = 'File CV',
  disabled = false,
  className,
}: {
  value: File | null
  onChange: (file: File) => void
  error?: string | null
  note?: string | null
  label?: string
  disabled?: boolean
  className?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const errorId = useId()
  const noteId = useId()
  const [dragging, setDragging] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const shownError = localError ?? error ?? null

  const pick = (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    if (files.length > 1) return setLocalError('Chỉ chọn một file.')
    const problem = validateUploadFile(file)
    setLocalError(problem)
    if (!problem) onChange(file)
  }

  const onDragOver = (e: DragEvent) => {
    e.preventDefault()
    if (!disabled) setDragging(true)
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (!disabled) pick(e.dataTransfer.files)
  }

  const describedBy = [shownError && errorId, note && noteId].filter(Boolean).join(' ') || undefined

  return (
    <div className={cn('grid gap-1.5', className)}>
      <div
        onDragOver={onDragOver}
        onDragEnter={onDragOver}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'rounded-xl border border-dashed bg-surface p-4 transition-colors',
          shownError ? 'border-danger' : 'border-line',
          dragging && 'border-accent bg-accent-soft/50',
          disabled && 'opacity-60',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={UPLOAD_ACCEPT}
          aria-label={label}
          aria-invalid={shownError ? true : undefined}
          aria-describedby={describedBy}
          disabled={disabled}
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            pick(e.target.files)
            e.target.value = '' // let the same file be picked again after fixing it
          }}
        />
        {value ? (
          <div className="flex items-center gap-3">
            <FileText className="size-5 shrink-0 text-accent" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink" title={value.name}>
                {value.name}
              </p>
              <p className="text-xs text-ink2">{formatFileSize(value.size)}</p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={disabled}
              aria-describedby={describedBy}
              onClick={() => inputRef.current?.click()}
            >
              Đổi file
            </Button>
          </div>
        ) : (
          <div className="grid justify-items-center gap-2 py-4 text-center">
            <Upload className="size-5 text-ink2" aria-hidden="true" />
            <p className="text-sm text-ink">{dragging ? 'Thả file vào đây' : 'Kéo thả PDF/DOCX'}</p>
            <p className="flex items-center gap-2 text-sm text-ink2">
              hoặc
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={disabled}
                aria-describedby={describedBy}
                onClick={() => inputRef.current?.click()}
              >
                Chọn file
              </Button>
              · tối đa 5 MB
            </p>
          </div>
        )}
      </div>
      {shownError && (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {shownError}
        </p>
      )}
      {note && (
        <p id={noteId} className="text-xs text-ink2">
          {note}
        </p>
      )}
    </div>
  )
}

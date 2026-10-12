import { useId, type ReactNode } from 'react'
import { LIMITS } from '@/api/types'
import { FileDropzone } from '@/components/FileDropzone'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  suggestFileName,
  suggestJdName,
  type CvDraft,
  type FieldErrors,
  type JdDraft,
  type JdInput,
} from './drafts'

// Form fields for adding a CV / JD. Shared by the library dialogs (UI-4.1) and page 2 (UI-5.1).

/** Label + control + error line under it. `children` gets the ids to wire aria attributes. */
export function Field({
  label,
  error,
  hint,
  children,
  className,
  hideLabel,
}: {
  label: string
  error?: string
  /** Keep the label for screen readers only (the context already says what the field is). */
  hideLabel?: boolean
  hint?: ReactNode
  children: (ids: { id: string; describedBy?: string }) => ReactNode
  className?: string
}) {
  const id = useId()
  const errorId = `${id}-error`
  return (
    <div className={cn('grid gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className={cn('text-sm font-medium text-ink', hideLabel && 'sr-only')}>
          {label}
        </label>
        {hint && <span className="text-xs text-ink2">{hint}</span>}
      </div>
      {children({ id, describedBy: error ? errorId : undefined })}
      {error && (
        <p id={errorId} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

export function NameField({
  label,
  value,
  onChange,
  error,
  disabled,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  error?: string
  disabled?: boolean
  placeholder?: string
}) {
  return (
    <Field label={label} error={error}>
      {({ id, describedBy }) => (
        <Input
          id={id}
          value={value}
          maxLength={LIMITS.nameMaxChars}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  )
}

export function CvUploadFields({
  value,
  onChange,
  errors = {},
  disabled,
}: {
  value: CvDraft
  onChange: (v: CvDraft) => void
  errors?: FieldErrors
  disabled?: boolean
}) {
  return (
    <div className="grid gap-4">
      <FileDropzone
        value={value.file}
        error={errors.file}
        disabled={disabled}
        onChange={(file) =>
          onChange({ ...value, file, name: value.nameTouched ? value.name : suggestFileName(file) })
        }
      />
      <NameField
        label="Tên CV"
        placeholder="vd: CV Backend 2026"
        value={value.name}
        error={errors.name}
        disabled={disabled}
        onChange={(name) => onChange({ ...value, name, nameTouched: true })}
      />
    </div>
  )
}

const JD_INPUT_LABEL: Record<JdInput, string> = { paste: 'Dán nội dung', file: 'Tải file' }

/** New JD: paste the text, or upload a PDF/DOCX file. */
export function JdFields({
  value,
  onChange,
  errors = {},
  disabled,
}: {
  value: JdDraft
  onChange: (v: JdDraft) => void
  errors?: FieldErrors
  disabled?: boolean
}) {
  const count = value.text.length
  return (
    <div className="grid gap-4">
      <Tabs
        value={value.input}
        onValueChange={(input) => onChange({ ...value, input: input as JdInput })}
      >
        <TabsList aria-label="Cách thêm JD" className="h-9 border border-line bg-surface">
          {(['paste', 'file'] as const).map((input) => (
            <TabsTrigger
              key={input}
              value={input}
              disabled={disabled}
              className="px-3 text-ink2 data-[state=active]:bg-accent-soft data-[state=active]:text-accent data-[state=active]:shadow-none"
            >
              {JD_INPUT_LABEL[input]}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="paste">
          <Field
            label="Nội dung JD"
            error={errors.text}
            hint={
              <span className={cn(count > LIMITS.jdMaxChars && 'text-danger')}>
                {count.toLocaleString('vi-VN')} / {LIMITS.jdMaxChars.toLocaleString('vi-VN')} ký tự
              </span>
            }
          >
            {({ id, describedBy }) => (
              <Textarea
                id={id}
                value={value.text}
                rows={10}
                placeholder="Dán mô tả công việc vào đây"
                disabled={disabled}
                aria-invalid={errors.text ? true : undefined}
                aria-describedby={describedBy}
                className="max-h-[50vh] min-h-48"
                onChange={(e) => {
                  const text = e.target.value
                  onChange({
                    ...value,
                    text,
                    name: value.nameTouched ? value.name : suggestJdName(text),
                  })
                }}
              />
            )}
          </Field>
        </TabsContent>
        <TabsContent value="file">
          <FileDropzone
            label="File JD"
            note="AI đọc chữ trong file. Xem lại nội dung trong thư viện sau khi thêm."
            value={value.file}
            error={errors.file}
            disabled={disabled}
            onChange={(file) =>
              onChange({
                ...value,
                file,
                name: value.nameTouched ? value.name : suggestFileName(file),
              })
            }
          />
        </TabsContent>
      </Tabs>
      <NameField
        label="Tên JD"
        placeholder="vd: Backend Engineer – ACME"
        value={value.name}
        error={errors.name}
        disabled={disabled}
        onChange={(name) => onChange({ ...value, name, nameTouched: true })}
      />
    </div>
  )
}

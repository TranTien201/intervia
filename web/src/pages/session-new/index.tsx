import { ArrowRight } from 'lucide-react'
import { useId, useRef, useState, type ComponentProps, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useCreateJd, useCreateSession, useCvs, useJds, useRoles, useUploadCv } from '@/api/hooks'
import { LIMITS, type CvSummary, type JdSummary, type Level, type Role } from '@/api/types'
import { Card } from '@/components/Card'
import { Page, PageTitle } from '@/components/Page'
import { ErrorState, PageSkeleton } from '@/components/PageStates'
import { SectionLabel } from '@/components/SectionLabel'
import { SESSION_STEPS, Stepper } from '@/components/Stepper'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  emptyCvDraft,
  emptyJdDraft,
  serverFieldErrors,
  jdInputOf,
  jdSourceOf,
  validateJdDraft,
  validateName,
  type CvDraft,
  type FieldErrors,
  type JdDraft,
} from '@/features/library/drafts'
import { CvUploadFields, Field, JdFields } from '@/features/library/fields'
import { errorMessage } from '@/lib/errors'
import { LEVEL_LABEL, shortDate } from '@/lib/format'
import { cn } from '@/lib/utils'

type Source = 'existing' | 'new'
/** Upload/paste field errors plus `pick` for the "use existing" select. */
type ColumnErrors = FieldErrors & { pick?: string }
interface FormErrors {
  cv: ColumnErrors
  jd: ColumnErrors
  role?: string
  roleCustom?: string
  level?: string
}

const OTHER_ROLE = '__other'
const LEVELS: Level[] = ['junior', 'mid', 'senior']
const isLevel = (v: string | null): v is Level => LEVELS.includes(v as Level)
const hasErrors = (e: FormErrors) =>
  [e.role, e.roleCustom, e.level, ...Object.values(e.cv), ...Object.values(e.jd)].some(Boolean)

// [2] Create session: pick CV + JD (from the library or new), role and level (docs/design/ui-pages.md, page 2).
export function SessionNewPage() {
  const cvs = useCvs()
  const jds = useJds()
  const roles = useRoles()
  const queries = [cvs, jds, roles]
  const failed = queries.find((q) => q.isError)

  return (
    <Page>
      <Stepper steps={SESSION_STEPS.map((label) => ({ label }))} current={0} className="mb-6" />
      <PageTitle className="mb-6">Tạo phiên</PageTitle>
      {failed ? (
        <ErrorState
          error={failed.error}
          onRetry={() => queries.forEach((q) => q.isError && void q.refetch())}
        />
      ) : cvs.data && jds.data && roles.data ? (
        <SessionNewForm cvs={cvs.data} jds={jds.data} roles={roles.data} />
      ) : (
        <PageSkeleton variant="detail" />
      )}
    </Page>
  )
}

function SessionNewForm({
  cvs,
  jds,
  roles,
}: {
  cvs: CvSummary[]
  jds: JdSummary[]
  roles: Role[]
}) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const uploadCv = useUploadCv()
  const createJd = useCreateJd()
  const createSession = useCreateSession()

  // Initial values: URL (?cv=…&jd=…&role=…&level=…) for "Tạo phiên với CV này" / "Luyện lại",
  // otherwise the most recently used item (lists come newest first).
  // `cv=new` / `jd=new` opens the upload / paste option ("Tải file khác" on page 3).
  const [cvSource, setCvSource] = useState<Source>(
    cvs.length && params.get('cv') !== 'new' ? 'existing' : 'new',
  )
  const [cvId, setCvId] = useState(() => pickInitial(cvs, params.get('cv')))
  const [cvDraft, setCvDraft] = useState<CvDraft>(emptyCvDraft)
  const [jdSource, setJdSource] = useState<Source>(
    jds.length && params.get('jd') !== 'new' ? 'existing' : 'new',
  )
  const [jdId, setJdId] = useState(() => pickInitial(jds, params.get('jd')))
  const [jdDraft, setJdDraft] = useState<JdDraft>(emptyJdDraft)
  const [role, setRole] = useState(() => {
    const r = params.get('role')
    return r && roles.some((x) => x.id === r) ? r : ''
  })
  const [roleCustom, setRoleCustom] = useState('')
  const [level, setLevel] = useState<Level | ''>(() => {
    const l = params.get('level')
    return isLevel(l) ? l : ''
  })
  const [errors, setErrors] = useState<FormErrors>({ cv: {}, jd: {} })
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  // A new CV/JD already saved by an earlier attempt that failed at a later step:
  // reuse it on retry instead of adding a duplicate to the library.
  const savedCv = useRef<{ file: File; id: string } | null>(null)
  const savedJd = useRef<{ source: File | string; id: string } | null>(null)

  const validate = (): FormErrors => ({
    cv:
      cvSource === 'existing'
        ? { pick: cvId ? undefined : 'Chọn một CV.' }
        : {
            file: cvDraft.file ? undefined : 'Chọn một file CV.',
            name: validateName(cvDraft.name),
          },
    jd:
      jdSource === 'existing'
        ? { pick: jdId ? undefined : 'Chọn một JD.' }
        : validateJdDraft(jdDraft),
    role: role ? undefined : 'Chọn vị trí.',
    roleCustom: role === OTHER_ROLE ? validateRoleCustom(roleCustom) : undefined,
    level: level ? undefined : 'Chọn cấp độ.',
  })

  const showErrors = (next: FormErrors) => {
    setErrors(next)
    // Move focus to the first field that needs fixing.
    requestAnimationFrame(() =>
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
    )
  }

  const ensureCv = async () => {
    if (cvSource === 'existing') return cvId
    const file = cvDraft.file!
    if (savedCv.current?.file === file) return savedCv.current.id
    const cv = await uploadCv.mutateAsync({ file, name: cvDraft.name.trim() })
    savedCv.current = { file, id: cv.id }
    return cv.id
  }

  const ensureJd = async () => {
    if (jdSource === 'existing') return jdId
    const source = jdSourceOf(jdDraft)
    if (savedJd.current?.source === source) return savedJd.current.id
    const jd = await createJd.mutateAsync(jdInputOf(jdDraft))
    savedJd.current = { source, id: jd.id }
    return jd.id
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setFormError(null)
    const next = validate()
    if (hasErrors(next)) return showErrors(next)
    setErrors({ cv: {}, jd: {} })
    setSubmitting(true)

    let stage: 'cv' | 'jd' | 'session' = 'cv'
    try {
      const cv_id = await ensureCv()
      stage = 'jd'
      const jd_id = await ensureJd()
      stage = 'session'
      const session = await createSession.mutateAsync({
        cv_id,
        jd_id,
        role_id: role === OTHER_ROLE ? null : role,
        role_custom: role === OTHER_ROLE ? roleCustom.trim() : null,
        level: level as Level,
      })
      navigate(`/sessions/${session.id}/match`)
    } catch (err) {
      setSubmitting(false)
      const fields = serverFieldErrors(err)
      if (fields && stage === 'session') {
        // 422 from POST /sessions is keyed by request field names.
        const f: Record<string, string | undefined> = fields
        showErrors({
          cv: { pick: f.cv_id },
          jd: { pick: f.jd_id },
          role: f.role ?? f.role_id,
          roleCustom: f.role_custom,
          level: f.level,
        })
      } else if (fields) {
        showErrors(stage === 'cv' ? { cv: fields, jd: {} } : { cv: {}, jd: fields })
      } else {
        setFormError(errorMessage(err))
      }
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="grid gap-6">
      <div className="grid gap-4 md:grid-cols-2">
        <SourceColumn
          title="CV"
          source={cvSource}
          onSourceChange={setCvSource}
          hasLibrary={cvs.length > 0}
          existingLabel="Dùng CV có sẵn"
          newLabel="Tải CV mới"
          disabled={submitting}
          existing={
            <LibrarySelect
              label="CV có sẵn"
              items={cvs}
              value={cvId}
              onChange={setCvId}
              error={errors.cv.pick}
              disabled={submitting}
              status={cvStatus}
            />
          }
          fresh={
            <CvUploadFields
              value={cvDraft}
              onChange={setCvDraft}
              errors={errors.cv}
              disabled={submitting}
            />
          }
        />
        <SourceColumn
          title="Mô tả công việc (JD)"
          source={jdSource}
          onSourceChange={setJdSource}
          hasLibrary={jds.length > 0}
          existingLabel="Dùng JD có sẵn"
          newLabel="Thêm JD mới"
          disabled={submitting}
          existing={
            <LibrarySelect
              label="JD có sẵn"
              items={jds}
              value={jdId}
              onChange={setJdId}
              error={errors.jd.pick}
              disabled={submitting}
              status={jdStatus}
            />
          }
          fresh={
            <JdFields
              value={jdDraft}
              onChange={setJdDraft}
              errors={errors.jd}
              disabled={submitting}
            />
          }
        />
      </div>

      <Card className="grid gap-5 p-5">
        <div className="grid gap-3 sm:max-w-sm">
          <Field label="Vị trí" error={errors.role}>
            {({ id, describedBy }) => (
              <NativeSelect
                id={id}
                value={role}
                disabled={submitting}
                aria-invalid={errors.role ? true : undefined}
                aria-describedby={describedBy}
                onChange={(e) => setRole(e.target.value)}
              >
                <option value="" disabled>
                  Chọn vị trí
                </option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
                <option value={OTHER_ROLE}>Khác…</option>
              </NativeSelect>
            )}
          </Field>
          {role === OTHER_ROLE && (
            <Field label="Tên vị trí" error={errors.roleCustom}>
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  value={roleCustom}
                  maxLength={LIMITS.nameMaxChars}
                  placeholder="vd: Mobile Engineer"
                  disabled={submitting}
                  aria-invalid={errors.roleCustom ? true : undefined}
                  aria-describedby={describedBy}
                  onChange={(e) => setRoleCustom(e.target.value)}
                />
              )}
            </Field>
          )}
        </div>
        <LevelField value={level} onChange={setLevel} error={errors.level} disabled={submitting} />
      </Card>

      {formError && (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" loading={submitting}>
          Tiếp tục <ArrowRight />
        </Button>
      </div>
    </form>
  )
}

/** Id from the URL if it is in the library, else the newest item, else nothing. */
function pickInitial(items: { id: string }[], fromUrl: string | null) {
  if (fromUrl && items.some((x) => x.id === fromUrl)) return fromUrl
  return items[0]?.id ?? ''
}

function validateRoleCustom(v: string): string | undefined {
  if (!v.trim()) return 'Nhập tên vị trí.'
  if (v.length > LIMITS.nameMaxChars) return `Tên dài tối đa ${LIMITS.nameMaxChars} ký tự.`
}

type AnalysisItem = Pick<CvSummary, 'analysis_status' | 'created_at' | 'updated_at'>

/** Pending / failed analysis wins over the item's own details. */
function analysisNote(item: AnalysisItem, done: string): ReactNode {
  if (item.analysis_status === 'pending' || item.analysis_status === 'running')
    return <span className="text-ai">Đang phân tích…</span>
  if (item.analysis_status === 'failed') return <span className="text-danger">Phân tích lỗi</span>
  return `Đã phân tích · ${done}`
}

/** "Đã phân tích · sửa 08/10" */
const cvStatus = (cv: CvSummary) =>
  analysisNote(
    cv,
    cv.updated_at > cv.created_at
      ? `sửa ${shortDate(cv.updated_at)}`
      : `thêm ${shortDate(cv.created_at)}`,
  )

/** "Đã phân tích · 5 yêu cầu" */
const jdStatus = (jd: JdSummary) => analysisNote(jd, `${jd.requirement_count} yêu cầu`)

/** One input column: "(•) Dùng … có sẵn" / "( ) Tải/Dán … mới". Empty library → only the "new" part. */
function SourceColumn({
  title,
  source,
  onSourceChange,
  hasLibrary,
  existingLabel,
  newLabel,
  existing,
  fresh,
  disabled,
}: {
  title: string
  source: Source
  onSourceChange: (s: Source) => void
  hasLibrary: boolean
  existingLabel: string
  newLabel: string
  existing: ReactNode
  fresh: ReactNode
  disabled?: boolean
}) {
  const id = useId()
  return (
    <Card className="grid content-start gap-4 p-5">
      <SectionLabel id={`${id}-title`}>{title}</SectionLabel>
      {hasLibrary ? (
        <RadioGroup
          value={source}
          onValueChange={(v) => onSourceChange(v as Source)}
          disabled={disabled}
          aria-labelledby={`${id}-title`}
          className="gap-4"
        >
          <SourceOption id={`${id}-existing`} value="existing" label={existingLabel}>
            {source === 'existing' && existing}
          </SourceOption>
          <SourceOption id={`${id}-new`} value="new" label={newLabel}>
            {source === 'new' && fresh}
          </SourceOption>
        </RadioGroup>
      ) : (
        fresh
      )}
    </Card>
  )
}

function SourceOption({
  id,
  value,
  label,
  children,
}: {
  id: string
  value: Source
  label: string
  children: ReactNode
}) {
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <RadioGroupItem id={id} value={value} />
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
      </div>
      {children && <div className="pl-6">{children}</div>}
    </div>
  )
}

function LibrarySelect<T extends { id: string; name: string }>({
  label,
  items,
  value,
  onChange,
  error,
  disabled,
  status,
}: {
  label: string
  items: T[]
  value: string
  onChange: (id: string) => void
  error?: string
  disabled?: boolean
  status: (item: T) => ReactNode
}) {
  const selected = items.find((x) => x.id === value)
  return (
    <div className="grid gap-1.5">
      <Field label={label} error={error} hideLabel>
        {({ id, describedBy }) => (
          <NativeSelect
            id={id}
            value={value}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            onChange={(e) => onChange(e.target.value)}
          >
            {items.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </NativeSelect>
        )}
      </Field>
      {selected && <p className="text-sm text-ink2">{status(selected)}</p>}
    </div>
  )
}

function LevelField({
  value,
  onChange,
  error,
  disabled,
}: {
  value: Level | ''
  onChange: (l: Level) => void
  error?: string
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className="grid gap-2">
      <span id={`${id}-label`} className="text-sm font-medium text-ink">
        Cấp độ
      </span>
      <RadioGroup
        value={value}
        onValueChange={(v) => onChange(v as Level)}
        disabled={disabled}
        aria-labelledby={`${id}-label`}
        aria-describedby={error ? `${id}-error` : undefined}
        className="flex flex-wrap gap-5"
      >
        {LEVELS.map((l) => (
          <div key={l} className="flex items-center gap-2">
            <RadioGroupItem id={`${id}-${l}`} value={l} aria-invalid={error ? true : undefined} />
            <label htmlFor={`${id}-${l}`} className="text-sm text-ink">
              {LEVEL_LABEL[l]}
            </label>
          </div>
        ))}
      </RadioGroup>
      {error && (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

/** Native select styled like `Input`: keyboard and screen readers work out of the box. */
function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-9 w-full min-w-0 rounded-md border border-input bg-surface px-3 py-1 text-base shadow-xs outline-none md:text-sm',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
        className,
      )}
      {...props}
    />
  )
}

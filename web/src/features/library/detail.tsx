import type { UseQueryResult } from '@tanstack/react-query'
import { ArrowLeft, Check, ChevronDown, Circle, Loader2, Pencil, X } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useRenameCv, useRenameJd } from '@/api/hooks'
import type { AnalysisProgress, SessionSummary, StepStatus, VersionInfo } from '@/api/types'
import { PageTitle } from '@/components/Page'
import { PageSkeleton } from '@/components/PageStates'
import { SectionLabel } from '@/components/SectionLabel'
import { StatusDot } from '@/components/StatusDot'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { sessionLabel, sessionPath } from '@/features/sessions/session-nav'
import { errorMessage } from '@/lib/errors'
import { shortDate } from '@/lib/format'
import { notifySaved } from '@/lib/notify'
import { cn } from '@/lib/utils'
import { serverFieldErrors, validateName } from './drafts'

// Building blocks of the CV detail [8] and JD detail [9] pages (UI-4.5, UI-4.6).

type Kind = 'cv' | 'jd'
const LABEL: Record<Kind, string> = { cv: 'CV', jd: 'JD' }

/** "← Thư viện", the name (renamed in place), "Tạo phiên với … này" and ⋮. */
export function DetailHeader({
  kind,
  item,
  menu,
}: {
  kind: Kind
  item: { id: string; name: string }
  menu: ReactNode
}) {
  return (
    <div className="grid gap-2">
      <Link
        to={kind === 'jd' ? '/library?tab=jd' : '/library'}
        className="inline-flex items-center gap-1 justify-self-start text-sm text-ink2 hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden /> Thư viện
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <InlineName kind={kind} id={item.id} name={item.name} />
        <div className="flex items-center gap-1">
          <Button asChild>
            {/* Page 2 reads ?cv= / ?jd= to preselect it (UI-5.1). */}
            <Link to={`/sessions/new?${kind}=${encodeURIComponent(item.id)}`}>
              Tạo phiên với {LABEL[kind]} này
            </Link>
          </Button>
          {menu}
        </div>
      </div>
    </div>
  )
}

function InlineName({ kind, id, name }: { kind: Kind; id: string; name: string }) {
  const renameCv = useRenameCv()
  const renameJd = useRenameJd()
  const rename = kind === 'cv' ? renameCv : renameJd
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name)
  const [error, setError] = useState<string | undefined>()

  const cancel = () => {
    setEditing(false)
    setError(undefined)
    rename.reset()
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const problem = validateName(value)
    setError(problem)
    if (problem) return
    if (value.trim() === name) return cancel()
    rename.mutate(
      { id, name: value.trim() },
      {
        onSuccess: () => {
          notifySaved('Đã đổi tên')
          setEditing(false)
        },
        onError: (err) => setError(serverFieldErrors(err)?.name ?? errorMessage(err)),
      },
    )
  }

  if (!editing) {
    return (
      <div className="flex min-w-0 items-center gap-1">
        <PageTitle className="min-w-0 break-words">{name}</PageTitle>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Đổi tên ${LABEL[kind]}`}
          onClick={() => {
            setValue(name)
            setEditing(true)
          }}
        >
          <Pencil />
        </Button>
      </div>
    )
  }
  return (
    <form onSubmit={submit} className="grid min-w-0 flex-1 gap-1 sm:max-w-md">
      <div className="flex items-center gap-1">
        <Input
          autoFocus
          aria-label={`Tên ${LABEL[kind]}`}
          aria-invalid={!!error}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && cancel()}
          disabled={rename.isPending}
        />
        <Button type="submit" size="icon-sm" aria-label="Lưu tên" loading={rename.isPending}>
          <Check />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Hủy đổi tên"
          disabled={rename.isPending}
          onClick={cancel}
        >
          <X />
        </Button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  )
}

const ORIGIN_LABEL: Record<VersionInfo['origin'], string> = {
  analysis: 'AI phân tích',
  user_edit: 'Bạn sửa',
  reanalysis: 'Phân tích lại',
}

/** "bản 3 ▾": pick a version from the history. Old versions open view-only. */
export function VersionPicker({
  versions,
  current,
  onSelect,
}: {
  /** Newest first, as the API returns them. */
  versions: VersionInfo[] | undefined
  current: number
  onSelect: (version: number) => void
}) {
  const latest = versions?.[0]?.version
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="xs" variant="ghost" aria-label={`Bản ${current}, xem lịch sử phiên bản`}>
          bản {current} <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56 rounded-lg border-line bg-surface">
        {!versions ? (
          <p className="px-2 py-1.5 text-sm text-ink2">Đang tải…</p>
        ) : (
          <DropdownMenuRadioGroup
            value={String(current)}
            onValueChange={(v) => onSelect(Number(v))}
          >
            {versions.map((v) => (
              <DropdownMenuRadioItem key={v.version} value={String(v.version)}>
                <span className="font-medium text-ink">bản {v.version}</span>
                <span className="text-ink2">
                  {shortDate(v.created_at)} · {ORIGIN_LABEL[v.origin]}
                  {v.version === latest && ' · mới nhất'}
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Main column + "Đã dùng trong" side column; stacks on narrow screens. */
export function DetailColumns({
  main,
  side,
  sideLabel = 'Đã dùng trong',
}: {
  main: ReactNode
  side: ReactNode
  sideLabel?: string
}) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0">{main}</div>
      <aside aria-label={sideLabel} className="grid gap-3">
        {side}
      </aside>
    </div>
  )
}

/** Sessions that used this CV/JD, with the version each one used. Opens the session. */
export function UsedInSessions({
  kind,
  query,
}: {
  kind: Kind
  query: UseQueryResult<SessionSummary[]>
}) {
  return (
    <>
      <SectionLabel>Đã dùng trong</SectionLabel>
      {query.isPending ? (
        <PageSkeleton rows={2} />
      ) : query.isError ? (
        <p className="text-sm text-danger">
          Không tải được danh sách phiên.{' '}
          <button type="button" className="underline" onClick={() => void query.refetch()}>
            Thử lại
          </button>
        </p>
      ) : query.data.length === 0 ? (
        <p className="text-sm text-ink2">Chưa dùng trong phiên nào.</p>
      ) : (
        <ul className="grid gap-1">
          {query.data.map((s) => {
            const version = s[kind].version
            return (
              <li key={s.id}>
                <Link
                  to={sessionPath(s)}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-subtle"
                >
                  <StatusDot status={s.status} />
                  <span className="min-w-0 flex-1 truncate text-ink">{sessionLabel(s)}</span>
                  <span className="shrink-0 text-ink2">
                    {shortDate(s.created_at)}
                    {version !== null && ` · b${version}`}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

const STEP_ICON: Record<StepStatus, ReactNode> = {
  done: <Check className="size-4 text-ok" aria-hidden />,
  running: <Loader2 className="size-4 animate-spin text-ai" aria-hidden />,
  pending: <Circle className="size-4 text-line" aria-hidden />,
  failed: <X className="size-4 text-danger" aria-hidden />,
}
const STEP_STATUS_TEXT: Record<StepStatus, string> = {
  done: 'xong',
  running: 'đang chạy',
  pending: 'chưa chạy',
  failed: 'lỗi',
}

/** ✓ done / ◌ running / ○ not yet, for a CV/JD analysis (shared with page 3, UI-5.2). */
export function AnalysisSteps({
  progress,
  className,
}: {
  progress: AnalysisProgress | undefined
  className?: string
}) {
  return (
    <div className={cn('grid gap-4', className)}>
      <ol className="grid gap-2" aria-label="Tiến trình phân tích">
        {(progress?.steps ?? []).map((s) => (
          <li
            key={s.key}
            className={cn(
              'flex items-center gap-2 text-sm',
              s.status === 'pending' ? 'text-ink2' : 'text-ink',
            )}
          >
            {STEP_ICON[s.status]}
            {s.label}
            {s.status === 'running' && '…'}
            <span className="sr-only">({STEP_STATUS_TEXT[s.status]})</span>
          </li>
        ))}
      </ol>
      <PageSkeleton variant="list" rows={3} />
    </div>
  )
}

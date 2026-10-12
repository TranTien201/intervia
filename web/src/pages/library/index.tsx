import { Pencil, Plus, PlayCircle, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useCvs, useJds } from '@/api/hooks'
import type { AnalysisStatus, CvSummary, JdSummary } from '@/api/types'
import { KebabMenu } from '@/components/KebabMenu'
import { Page, PageTitle } from '@/components/Page'
import { EmptyState, PageSkeleton, QueryView } from '@/components/PageStates'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DeleteItemConfirm } from '@/features/library/DeleteItemConfirm'
import { AddCvDialog, AddJdDialog, RenameDialog } from '@/features/library/dialogs'
import { shortDate } from '@/lib/format'

type Tab = 'cv' | 'jd'
type Kind = Tab

type DialogState =
  | { type: 'add-cv' }
  | { type: 'add-jd' }
  | { type: 'rename'; kind: Kind; id: string; name: string }
  | null

// [7] Library: CVs and JDs kept for reuse across sessions (docs/design/ui-pages.md, page 7).
export function LibraryPage() {
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'jd' ? 'jd' : 'cv'
  const cvs = useCvs()
  const jds = useJds()
  const [dialog, setDialog] = useState<DialogState>(null)
  // Only one delete confirmation open at a time, shown under its row.
  const [deleting, setDeleting] = useState<{ kind: Kind; id: string } | null>(null)
  const close = () => setDialog(null)
  const rename = (kind: Kind, item: { id: string; name: string }) =>
    setDialog({ type: 'rename', kind, id: item.id, name: item.name })
  const rowActions = (kind: Kind, item: { id: string; name: string; session_count: number }) => ({
    onRename: () => rename(kind, item),
    onDelete: () => setDeleting({ kind, id: item.id }),
    confirm: deleting?.kind === kind && deleting.id === item.id && (
      <DeleteItemConfirm kind={kind} item={item} onClose={() => setDeleting(null)} />
    ),
  })

  const addCv = (
    <Button onClick={() => setDialog({ type: 'add-cv' })}>
      <Plus /> Tải CV mới
    </Button>
  )
  const addJd = (
    <Button onClick={() => setDialog({ type: 'add-jd' })}>
      <Plus /> Thêm JD
    </Button>
  )

  return (
    <Page>
      <PageTitle>Thư viện</PageTitle>
      <Tabs
        value={tab}
        // Default tab keeps a clean URL; replace so tab switches don't fill the history.
        onValueChange={(v) => setParams(v === 'jd' ? { tab: 'jd' } : {}, { replace: true })}
        className="mt-6 gap-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList className="h-10 border border-line bg-surface">
            <TabTrigger value="cv" label="CV" count={cvs.data?.length} />
            <TabTrigger value="jd" label="JD" count={jds.data?.length} />
          </TabsList>
          {tab === 'cv' ? addCv : addJd}
        </div>

        <TabsContent value="cv">
          <QueryView
            query={cvs}
            loading={<PageSkeleton rows={3} />}
            isEmpty={(d) => d.length === 0}
            empty={
              <EmptyState
                message="Chưa có CV nào. Thêm CV để dùng lại cho nhiều phiên luyện tập."
                action={addCv}
              />
            }
          >
            {(data) => (
              <ItemList>
                {data.map((cv) => (
                  <CvRow key={cv.id} cv={cv} {...rowActions('cv', cv)} />
                ))}
              </ItemList>
            )}
          </QueryView>
        </TabsContent>

        <TabsContent value="jd">
          <QueryView
            query={jds}
            loading={<PageSkeleton rows={3} />}
            isEmpty={(d) => d.length === 0}
            empty={
              <EmptyState
                message="Chưa có JD nào. Thêm JD để dùng lại cho nhiều phiên luyện tập."
                action={addJd}
              />
            }
          >
            {(data) => (
              <ItemList>
                {data.map((jd) => (
                  <JdRow key={jd.id} jd={jd} {...rowActions('jd', jd)} />
                ))}
              </ItemList>
            )}
          </QueryView>
        </TabsContent>
      </Tabs>

      {dialog?.type === 'add-cv' && <AddCvDialog onClose={close} />}
      {dialog?.type === 'add-jd' && <AddJdDialog onClose={close} />}
      {dialog?.type === 'rename' && (
        <RenameDialog kind={dialog.kind} id={dialog.id} currentName={dialog.name} onClose={close} />
      )}
    </Page>
  )
}

function TabTrigger({ value, label, count }: { value: Tab; label: string; count?: number }) {
  return (
    <TabsTrigger
      value={value}
      className="px-4 text-ink2 data-[state=active]:bg-accent-soft data-[state=active]:text-accent data-[state=active]:shadow-none"
    >
      {count === undefined ? label : `${label} (${count})`}
    </TabsTrigger>
  )
}

function ItemList({ children }: { children: ReactNode }) {
  return <ul className="grid gap-2">{children}</ul>
}

interface RowActions {
  onRename: () => void
  onDelete: () => void
  /** Delete confirmation, when open for this row. */
  confirm: ReactNode
}

/** One CV/JD: the whole row opens the detail page, ⋮ sits on top of it. */
function ItemRow({
  to,
  name,
  meta,
  usage,
  menu,
  confirm,
}: {
  to: string
  name: string
  meta: ReactNode
  usage: ReactNode
  menu: ReactNode
  confirm: ReactNode
}) {
  return (
    <li className="grid gap-2">
      <div className="flex items-start gap-2 rounded-xl border border-line bg-surface shadow-card transition-colors hover:border-accent/40">
        <Link to={to} className="grid min-w-0 flex-1 gap-0.5 py-3 pl-4">
          <span className="truncate font-semibold text-ink">{name}</span>
          <span className="truncate text-sm text-ink2">{meta}</span>
          <span className="text-sm text-ink2">{usage}</span>
        </Link>
        <div className="pt-2 pr-2">{menu}</div>
      </div>
      {confirm}
    </li>
  )
}

/** "bản 3 · sửa 08/10", or the analysis state while there is no version yet. */
function versionMeta(item: {
  latest_version: number | null
  analysis_status: AnalysisStatus
  created_at: string
  updated_at: string
}): ReactNode[] {
  const parts: ReactNode[] = []
  if (item.latest_version !== null) parts.push(`bản ${item.latest_version}`)
  parts.push(
    item.updated_at > item.created_at
      ? `sửa ${shortDate(item.updated_at)}`
      : `thêm ${shortDate(item.created_at)}`,
  )
  if (item.analysis_status === 'pending' || item.analysis_status === 'running')
    parts.push(<span className="text-ai">Đang phân tích…</span>)
  if (item.analysis_status === 'failed')
    parts.push(<span className="text-danger">Phân tích lỗi</span>)
  return parts
}

function joinMeta(parts: ReactNode[]) {
  return parts.map((p, i) => (
    <span key={i}>
      {i > 0 && ' · '}
      {p}
    </span>
  ))
}

const usageText = (n: number) => (n === 0 ? 'Chưa dùng trong phiên nào' : `Dùng trong ${n} phiên`)

function ItemMenu({
  kind,
  item,
  onRename,
  onDelete,
}: {
  kind: Kind
  item: { id: string; name: string }
  onRename: () => void
  onDelete: () => void
}) {
  const navigate = useNavigate()
  const label = kind === 'cv' ? 'CV' : 'JD'
  return (
    <KebabMenu
      label={`Tùy chọn cho ${label} ${item.name}`}
      items={[
        { label: 'Đổi tên', icon: <Pencil />, onSelect: onRename },
        {
          label: `Tạo phiên mới với ${label} này`,
          icon: <PlayCircle />,
          // Page 2 reads ?cv= / ?jd= to preselect it (UI-5.1).
          onSelect: () => navigate(`/sessions/new?${kind}=${encodeURIComponent(item.id)}`),
        },
        { label: 'Xóa', icon: <Trash2 />, danger: true, onSelect: onDelete },
      ]}
    />
  )
}

function CvRow({ cv, onRename, onDelete, confirm }: { cv: CvSummary } & RowActions) {
  return (
    <ItemRow
      to={`/library/cv/${cv.id}`}
      name={cv.name}
      meta={joinMeta([cv.file_name, ...versionMeta(cv)])}
      usage={usageText(cv.session_count)}
      menu={<ItemMenu kind="cv" item={cv} onRename={onRename} onDelete={onDelete} />}
      confirm={confirm}
    />
  )
}

function JdRow({ jd, onRename, onDelete, confirm }: { jd: JdSummary } & RowActions) {
  const where = [jd.position, jd.company].filter(Boolean).join(' · ')
  return (
    <ItemRow
      to={`/library/jd/${jd.id}`}
      name={jd.name}
      meta={joinMeta([...(where ? [where] : []), ...versionMeta(jd)])}
      usage={joinMeta([
        ...(jd.latest_version !== null ? [`${jd.requirement_count} yêu cầu`] : []),
        usageText(jd.session_count),
      ])}
      menu={<ItemMenu kind="jd" item={jd} onRename={onRename} onDelete={onDelete} />}
      confirm={confirm}
    />
  )
}

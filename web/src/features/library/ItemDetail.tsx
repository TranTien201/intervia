import { useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Trash2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import {
  useCvAnalysis,
  useCvSessions,
  useCvVersions,
  useJdAnalysis,
  useJdSessions,
  useJdVersions,
  useReanalyzeCv,
  useReanalyzeJd,
} from '@/api/hooks'
import { qk } from '@/api/keys'
import type { AnalysisStatus } from '@/api/types'
import { Banner } from '@/components/Banner'
import { Card } from '@/components/Card'
import { KebabMenu } from '@/components/KebabMenu'
import { SectionLabel } from '@/components/SectionLabel'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/errors'
import { notifyError } from '@/lib/notify'
import { DeleteItemConfirm } from './DeleteItemConfirm'
import { AnalysisSteps, DetailColumns, DetailHeader, UsedInSessions, VersionPicker } from './detail'

type Kind = 'cv' | 'jd'
const LABEL: Record<Kind, string> = { cv: 'CV', jd: 'JD' }

interface Item {
  id: string
  name: string
  latest_version: number | null
  analysis_status: AnalysisStatus
  session_count: number
}

/**
 * Shared layout of the CV detail [8] and JD detail [9] pages (UI-4.5, UI-4.6):
 * header, version history (?v=N opens an old version view-only), re-analysis with progress,
 * the editor, "Đã dùng trong", and delete at the bottom.
 */
export function ItemDetail({
  kind,
  item,
  info,
  before,
  editorLabel,
  renderEditor,
}: {
  kind: Kind
  item: Item
  /** Start of the info line, before "bản N ▾" (file name, company…). */
  info: ReactNode[]
  /** Inside the main card, above the editor (e.g. the JD text). */
  before?: ReactNode
  editorLabel: string
  /** The editor for `version` ('latest' is editable, a number is an old version, view-only). */
  renderEditor: (version: number | 'latest') => ReactNode
}) {
  const navigate = useNavigate()
  const isCv = kind === 'cv'
  const cvSessions = useCvSessions(item.id, isCv)
  const jdSessions = useJdSessions(item.id, !isCv)
  const sessions = isCv ? cvSessions : jdSessions
  const cvVersions = useCvVersions(item.id, isCv)
  const jdVersions = useJdVersions(item.id, !isCv)
  const versions = isCv ? cvVersions : jdVersions
  const reanalyzeCv = useReanalyzeCv()
  const reanalyzeJd = useReanalyzeJd()
  const reanalyze = isCv ? reanalyzeCv : reanalyzeJd
  const analysis = useWatchAnalysis(kind, item)
  const [deleting, setDeleting] = useState(false)

  const [params, setParams] = useSearchParams()
  const latest = item.latest_version
  const asked = Number(params.get('v'))
  // ?v=N opens an old version (links from page 6); anything else means the latest.
  const selected = latest !== null && asked > 0 && asked !== latest ? asked : null
  const select = (v: number) => setParams(v === latest ? {} : { v: String(v) }, { replace: true })

  const runAnalysis = () =>
    reanalyze.mutate(item.id, { onError: (err) => notifyError(errorMessage(err)) })
  const label = LABEL[kind]

  const main = (
    <Card className="grid gap-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink2">
        {[
          ...info,
          latest !== null && !analysis.active && (
            <VersionPicker
              key="version"
              versions={versions.data}
              current={selected ?? latest}
              onSelect={select}
            />
          ),
        ]
          .filter(Boolean)
          .map((part, i) => (
            <span key={i} className="contents">
              {i > 0 && <span aria-hidden>·</span>}
              {part}
            </span>
          ))}
      </div>

      {selected !== null && !analysis.active && (
        <Banner
          title={`Đang xem bản ${selected} (chỉ xem)`}
          action={
            <Button size="sm" variant="secondary" onClick={() => select(latest!)}>
              Về bản mới nhất
            </Button>
          }
        >
          Bản cũ không sửa được. Các phiên đã dùng bản này vẫn giữ nguyên.
        </Banner>
      )}

      {before}

      <SectionLabel>{editorLabel}</SectionLabel>
      {analysis.active ? (
        <AnalysisSteps progress={analysis.progress} />
      ) : (
        <>
          {analysis.failed && (
            <Banner
              variant="error"
              title={`Phân tích ${label} bị lỗi`}
              action={
                <Button size="sm" variant="secondary" onClick={runAnalysis}>
                  Thử lại
                </Button>
              }
            >
              {analysis.progress?.error?.message ?? 'Thử lại sau ít phút.'}
            </Banner>
          )}
          {latest !== null && renderEditor(selected ?? 'latest')}
        </>
      )}
    </Card>
  )

  return (
    <div className="grid gap-6">
      <DetailHeader
        kind={kind}
        item={item}
        menu={
          <KebabMenu
            label={`Tùy chọn cho ${label} ${item.name}`}
            items={[
              {
                label: 'Phân tích lại',
                icon: <RefreshCw />,
                disabled: analysis.active || reanalyze.isPending,
                onSelect: runAnalysis,
              },
            ]}
          />
        }
      />

      <DetailColumns main={main} side={<UsedInSessions kind={kind} query={sessions} />} />

      <div className="grid justify-items-end gap-3 border-t border-line pt-4">
        {deleting ? (
          <DeleteItemConfirm
            kind={kind}
            item={{ ...item, session_count: sessions.data?.length ?? item.session_count }}
            className="w-full"
            onClose={() => setDeleting(false)}
            onDeleted={() => navigate(isCv ? '/library' : '/library?tab=jd', { replace: true })}
          />
        ) : (
          <Button variant="danger" onClick={() => setDeleting(true)}>
            <Trash2 /> Xóa {label} và dữ liệu liên quan
          </Button>
        )}
      </div>
    </div>
  )
}

/**
 * Follow a running analysis (first one or "Phân tích lại"). When it ends, refetch the item
 * so the new version shows up. Survives a page reload: the state comes from the server.
 */
function useWatchAnalysis(kind: Kind, item: Item) {
  const qc = useQueryClient()
  const running = item.analysis_status === 'pending' || item.analysis_status === 'running'
  const failed = item.analysis_status === 'failed'
  const watch = running || failed
  const cvProgress = useCvAnalysis(item.id, kind === 'cv' && watch)
  const jdProgress = useJdAnalysis(item.id, kind === 'jd' && watch)
  const progress = (kind === 'cv' ? cvProgress : jdProgress).data
  const status = progress?.status

  useEffect(() => {
    if (running && (status === 'done' || status === 'failed')) {
      void qc.invalidateQueries({ queryKey: kind === 'cv' ? qk.cv(item.id) : qk.jd(item.id) })
      void qc.invalidateQueries({ queryKey: kind === 'cv' ? qk.cvs : qk.jds })
    }
  }, [running, status, kind, item.id, qc])

  return { active: running, failed, progress }
}

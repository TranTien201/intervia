import { useQuery } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { ApiError, NetworkError } from '@/api/client'
import { useCvVersion } from '@/api/hooks'
import { Badge } from '@/components/Badge'
import { Banner } from '@/components/Banner'
import { Card } from '@/components/Card'
import { InlineConfirm } from '@/components/InlineConfirm'
import { KebabMenu } from '@/components/KebabMenu'
import { NotAssessed } from '@/components/NotAssessed'
import { Page, PageTitle } from '@/components/Page'
import { FileDropzone } from '@/components/FileDropzone'
import { EmptyState, ErrorState, PageSkeleton, QueryView } from '@/components/PageStates'
import { SectionLabel } from '@/components/SectionLabel'
import { StatusDot } from '@/components/StatusDot'
import { SESSION_STEPS, Stepper } from '@/components/Stepper'
import { Tag, TagInput } from '@/components/Tag'
import { type VoiceState, VoiceStatusPill } from '@/components/VoiceStatusPill'
import { WeightBar } from '@/components/WeightBar'
import { Button } from '@/components/ui/button'
import { ProfileEditor } from '@/features/profile/ProfileEditor'
import { notifySaved } from '@/lib/notify'

const COLORS = [
  'bg',
  'surface',
  'subtle',
  'line',
  'ink',
  'ink2',
  'accent',
  'accent-soft',
  'accent-strong',
  'ai',
  'ai-soft',
  'amber',
  'amber-soft',
  'ok',
  'ok-soft',
  'danger',
  'danger-soft',
] as const

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10 grid gap-3">
      <SectionLabel>{title}</SectionLabel>
      {children}
    </section>
  )
}

type DemoState = 'loading' | 'error' | 'empty' | 'data'
const DEMO_STATES: { value: DemoState; label: string }[] = [
  { value: 'loading', label: 'Đang tải' },
  { value: 'error', label: 'Lỗi' },
  { value: 'empty', label: 'Trống' },
  { value: 'data', label: 'Có dữ liệu' },
]

// A real query whose outcome is picked by the switcher, to show QueryView choosing a state.
function useDemoQuery(state: DemoState) {
  return useQuery({
    queryKey: ['dev-demo', state],
    queryFn: () =>
      new Promise<string[]>((resolve, reject) => {
        if (state === 'loading') return // never settles
        if (state === 'error') return reject(new NetworkError())
        resolve(state === 'empty' ? [] : ['CV Backend 2026', 'CV Fullstack'])
      }),
    retry: false,
  })
}

function QueryViewDemo() {
  const [state, setState] = useState<DemoState>('data')
  const query = useDemoQuery(state)
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {DEMO_STATES.map((s) => (
          <Button
            key={s.value}
            size="sm"
            variant={state === s.value ? 'default' : 'secondary'}
            onClick={() => setState(s.value)}
          >
            {s.label}
          </Button>
        ))}
      </div>
      <div className="max-w-xl">
        <QueryView
          query={query}
          loading={<PageSkeleton rows={2} />}
          isEmpty={(d) => d.length === 0}
          empty={<EmptyState message="Chưa có CV nào." />}
        >
          {(data) => (
            <ul className="grid gap-2">
              {data.map((name) => (
                <li key={name}>
                  <Card>{name}</Card>
                </li>
              ))}
            </ul>
          )}
        </QueryView>
      </div>
    </>
  )
}

const CV_SESSIONS = [
  'Backend · Mid · 10/10/2026',
  'Backend · Senior · 08/10/2026',
  'Fullstack · Mid · 02/10/2026',
  'Backend · Junior · 28/09/2026',
  'Backend · Mid · 21/09/2026',
  'Data · Mid · 15/09/2026',
  'Backend · Mid · 01/09/2026',
]

type ConfirmDemo = 'session' | 'cv' | 'stop'

function InlineConfirmDemo({ onDone }: { onDone: (msg: string) => void }) {
  const [open, setOpen] = useState<ConfirmDemo | null>(null)
  const [pending, setPending] = useState(false)
  const run = (msg: string) => {
    setPending(true)
    setTimeout(() => {
      setPending(false)
      setOpen(null)
      onDone(msg)
    }, 1200)
  }
  const cancel = () => setOpen(null)
  return (
    <div className="grid max-w-xl gap-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setOpen('session')}>
          Xóa phiên
        </Button>
        <Button variant="secondary" onClick={() => setOpen('cv')}>
          Xóa CV (đang dùng trong 7 phiên)
        </Button>
        <Button variant="secondary" onClick={() => setOpen('stop')}>
          Dừng phỏng vấn
        </Button>
      </div>
      {open === 'session' && (
        <InlineConfirm
          title="Xóa phiên Backend · Mid · 10/10/2026?"
          description="Transcript, câu trả lời và file ghi âm của phiên này sẽ bị xóa. Không hoàn tác được."
          confirmLabel="Xóa phiên và dữ liệu"
          pending={pending}
          onConfirm={() => run('Đã xóa phiên')}
          onCancel={cancel}
        />
      )}
      {open === 'cv' && (
        <InlineConfirm
          title="Xóa CV Backend 2026?"
          description="CV, mọi phiên bản hồ sơ trích từ nó và các phiên bên dưới sẽ bị xóa. Không hoàn tác được."
          affected={{
            summary: `CV này được dùng trong ${CV_SESSIONS.length} phiên. Xóa CV sẽ xóa luôn ${CV_SESSIONS.length} phiên đó, gồm transcript và file ghi âm.`,
            items: CV_SESSIONS,
            moreLabel: (n) => `và ${n} phiên khác`,
          }}
          confirmLabel={`Xóa CV và ${CV_SESSIONS.length} phiên`}
          pending={pending}
          onConfirm={() => run('Đã xóa CV')}
          onCancel={cancel}
        />
      )}
      {open === 'stop' && (
        <InlineConfirm
          tone="default"
          title="Dừng ở đây?"
          description="Các câu đã trả lời vẫn được lưu. Competency chưa hỏi tới sẽ ghi là “chưa đánh giá”."
          confirmLabel="Dừng phỏng vấn"
          cancelLabel="Tiếp tục"
          pending={pending}
          onConfirm={() => run('Đã dừng phiên')}
          onCancel={cancel}
        />
      )}
    </div>
  )
}

const STEP_HREFS = ['/dev/components?step=1', '/dev/components?step=2', '/dev/components?step=3']

function StepperDemo() {
  const [current, setCurrent] = useState(1)
  return (
    <div className="grid max-w-2xl gap-4">
      <div className="flex flex-wrap gap-2">
        {SESSION_STEPS.map((label, i) => (
          <Button
            key={label}
            size="sm"
            variant={current === i ? 'default' : 'secondary'}
            onClick={() => setCurrent(i)}
          >
            Đang ở bước {i + 1}
          </Button>
        ))}
      </div>
      <Stepper
        current={current}
        steps={SESSION_STEPS.map((label, i) => ({ label, href: STEP_HREFS[i] }))}
      />
      <p className="text-sm text-ink2">Thu hẹp cửa sổ dưới 640px để thấy dạng rút gọn.</p>
    </div>
  )
}

function FileDropzoneDemo() {
  const [file, setFile] = useState<File | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  return (
    <div className="grid max-w-md gap-3">
      <FileDropzone
        value={file}
        onChange={(f) => {
          setFile(f)
          setServerError(null)
        }}
        error={serverError}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setServerError('Máy chủ không đọc được file này. Thử xuất lại PDF.')}
        >
          Giả lập lỗi từ máy chủ
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setFile(null)
            setServerError(null)
          }}
        >
          Đặt lại
        </Button>
      </div>
      <FileDropzone value={null} onChange={() => {}} disabled note={null} />
    </div>
  )
}

const VOICE_STATES: VoiceState[] = [
  'connecting',
  'listening',
  'thinking',
  'processing',
  'speaking',
  'mic_unavailable',
]

function VoiceStatusDemo() {
  const [state, setState] = useState<VoiceState>('listening')
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        {VOICE_STATES.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={state === s ? 'default' : 'secondary'}
            onClick={() => setState(s)}
          >
            {s}
          </Button>
        ))}
      </div>
      <div>
        <VoiceStatusPill state={state} />
      </div>
      <div className="flex flex-wrap gap-2">
        {VOICE_STATES.map((s) => (
          <VoiceStatusPill key={s} state={s} />
        ))}
      </div>
      <p className="text-sm text-ink2">
        Bật “Giảm chuyển động” trong cài đặt hệ điều hành để thấy chuyển động tắt.
      </p>
    </div>
  )
}

const ALL_BANNERS = ['info', 'warning', 'error'] as const

// Dev-only gallery (/dev/components). UI-2 components get added here.
export function DevComponentsPage() {
  const [skills, setSkills] = useState(['Python', 'FastAPI', 'PostgreSQL'])
  const [loading, setLoading] = useState(false)
  const [lastAction, setLastAction] = useState<string | null>(null)
  const [banners, setBanners] = useState<readonly string[]>(ALL_BANNERS)
  const closeBanner = (b: string) => setBanners((list) => list.filter((x) => x !== b))

  return (
    <Page>
      <PageTitle>Thành phần giao diện</PageTitle>

      <Section title="Màu · Sương lam">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
          {COLORS.map((c) => (
            <div
              key={c}
              className="overflow-hidden rounded-lg border border-line bg-surface text-xs"
            >
              <div className="h-12" style={{ background: `var(--${c})` }} />
              <div className="px-2 py-1.5 font-mono">--{c}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Chữ">
        <p className="text-page-title font-semibold">Tiêu đề trang 28/600 · Phỏng vấn, Đối chiếu</p>
        <p className="text-question">
          Câu hỏi AI 18/400: Khi gọi API thanh toán bị timeout, bạn xử lý retry thế nào?
        </p>
        <p className="text-body">Thân 15/400: ượ ữ ặ ỹ ộ — Người phỏng vấn, Kế hoạch.</p>
        <p className="label-caps text-ink2">Nhãn 12/600 · Hồ sơ của bạn</p>
        <pre className="font-mono text-code">
          {'CREATE INDEX idx_payments_created ON payments (created_at);'}
        </pre>
      </Section>

      <Section title="Button">
        <div className="flex flex-wrap gap-2">
          <Button>Bắt đầu phỏng vấn</Button>
          <Button variant="secondary">Quay lại</Button>
          <Button variant="ghost">Bỏ qua</Button>
          <Button variant="danger">
            <Trash2 /> Xóa phiên và dữ liệu
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled>Primary tắt</Button>
          <Button variant="secondary" disabled>
            Secondary tắt
          </Button>
          <Button
            loading={loading}
            onClick={() => {
              setLoading(true)
              setTimeout(() => setLoading(false), 1500)
            }}
          >
            {loading ? 'Đang tạo phiên…' : 'Bấm để thử trạng thái đang chạy'}
          </Button>
        </div>
      </Section>

      <Section title="SectionLabel">
        <div className="flex gap-8">
          <SectionLabel>Hồ sơ của bạn</SectionLabel>
          <SectionLabel>Yêu cầu của JD</SectionLabel>
        </div>
      </Section>

      <Section title="Card">
        <Card className="max-w-md">
          <p className="font-medium">Giảm 40% độ trễ API</p>
          <p className="text-sm text-ink2">“…giảm 40% độ trễ p95 của API thanh toán…”</p>
        </Card>
      </Section>

      <Section title="Tag · TagInput">
        <div className="flex flex-wrap gap-1.5">
          <Tag>Chỉ xem</Tag>
          <Tag onRemove={() => setLastAction('Xóa tag Docker')}>Docker</Tag>
        </div>
        <TagInput value={skills} onChange={setSkills} />
        <p className="text-sm text-ink2">Giá trị: {skills.join(', ') || '(trống)'}</p>
        <TagInput value={skills} onChange={setSkills} disabled />
      </Section>

      <Section title="Badge">
        <div className="flex flex-wrap gap-2">
          <Badge variant="required" />
          <Badge variant="preferred" />
          <Badge variant="saved" />
          <Badge variant="unplanned" />
        </div>
      </Section>

      <Section title="StatusDot">
        <div className="flex flex-wrap gap-6">
          <StatusDot status="draft" showLabel />
          <StatusDot status="in_progress" showLabel />
          <StatusDot status="completed" showLabel />
        </div>
        <p className="flex items-center gap-2 text-sm">
          <StatusDot status="in_progress" /> Chỉ chấm (chữ ẩn, vẫn đọc được bằng trình đọc màn hình)
        </p>
      </Section>

      <Section title="KebabMenu">
        <div className="flex items-center gap-3">
          <span className="text-sm">CV Backend 2026</span>
          <KebabMenu
            label="Tùy chọn cho CV Backend 2026"
            items={[
              { label: 'Đổi tên', icon: <Pencil />, onSelect: () => setLastAction('Đổi tên') },
              {
                label: 'Tạo phiên mới với CV này',
                icon: <Plus />,
                onSelect: () => setLastAction('Tạo phiên mới'),
              },
              {
                label: 'Xóa',
                icon: <Trash2 />,
                danger: true,
                onSelect: () => setLastAction('Xóa'),
              },
            ]}
          />
        </div>
      </Section>

      <Section title="WeightBar">
        <div className="grid max-w-md grid-cols-[1fr_auto] items-center gap-x-6 gap-y-2">
          <span>Thiết kế API</span>
          <WeightBar value={0.3} name="Thiết kế API" />
          <span>Database</span>
          <WeightBar value={0.25} name="Database" />
          <span>Xử lý lỗi (độ phủ)</span>
          <WeightBar value={2 / 3} label="2 câu" name="Xử lý lỗi" />
        </div>
      </Section>

      <Section title="NotAssessed">
        <p className="flex items-center gap-3">
          Giao tiếp <NotAssessed />
        </p>
      </Section>

      <Section title="Stepper">
        <StepperDemo />
      </Section>

      <Section title="FileDropzone">
        <FileDropzoneDemo />
      </Section>

      <Section title="VoiceStatusPill">
        <VoiceStatusDemo />
      </Section>

      <Section title="PageSkeleton">
        <div className="grid gap-8">
          <PageSkeleton rows={2} />
          <PageSkeleton variant="detail" rows={3} />
          <PageSkeleton variant="transcript" rows={2} />
        </div>
      </Section>

      <Section title="EmptyState">
        <EmptyState
          title="Chưa có CV nào"
          message="Thêm CV để dùng lại cho nhiều phiên luyện tập."
          action={
            <Button>
              <Plus /> Tải CV lên
            </Button>
          }
        />
      </Section>

      <Section title="ErrorState">
        <ErrorState error={new NetworkError()} onRetry={() => setLastAction('Thử lại')} />
        <ErrorState
          error={new ApiError(502, { code: 'llm_error', message: 'upstream failed' })}
          onRetry={() => setLastAction('Thử lại')}
        />
        <ErrorState
          error={new ApiError(404, { code: 'not_found', message: 'not found' })}
          notFoundMessage="Không tìm thấy CV này. Có thể nó đã bị xóa."
        />
      </Section>

      <Section title="QueryView · 4 trạng thái">
        <QueryViewDemo />
      </Section>

      <Section title="Banner">
        {banners.includes('info') && (
          <Banner onDismiss={() => closeBanner('info')}>
            Đã khôi phục phiên. Hội thoại được lấy lại từ máy chủ.
          </Banner>
        )}
        {banners.includes('warning') && (
          <Banner
            variant="warning"
            title="Mất kết nối"
            onDismiss={() => closeBanner('warning')}
            action={
              <Button size="sm" variant="secondary">
                Chuyển sang gõ chữ
              </Button>
            }
          >
            Đang kết nối lại… Câu trả lời của bạn vẫn được giữ.
          </Banner>
        )}
        {banners.includes('error') && (
          <Banner
            variant="error"
            title="Mic không dùng được"
            onDismiss={() => closeBanner('error')}
          >
            Trình duyệt chưa cho phép dùng mic. Phiên đã chuyển sang chế độ Text.
          </Banner>
        )}
        {banners.length < ALL_BANNERS.length && (
          <Button
            variant="ghost"
            size="sm"
            className="justify-self-start"
            onClick={() => setBanners(ALL_BANNERS)}
          >
            Hiện lại các banner
          </Button>
        )}
      </Section>

      <Section title="Thông báo nhỏ (sonner)">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => notifySaved()}>
            Hiện “Đã lưu”
          </Button>
          <Button
            variant="secondary"
            onClick={() => notifySaved('Đã lưu hồ sơ', 'CV Backend 2026 · bản 4')}
          >
            “Đã lưu” kèm mô tả
          </Button>
        </div>
      </Section>

      <Section title="InlineConfirm">
        <InlineConfirmDemo onDone={setLastAction} />
      </Section>

      <Section title="ProfileEditor (CV mẫu, lưu vào API giả)">
        <ProfileEditorDemo />
      </Section>

      {lastAction && (
        <p role="status" className="mt-10 text-sm text-ink2">
          Hành động gần nhất: {lastAction}
        </p>
      )}
    </Page>
  )
}

function ProfileEditorDemo() {
  const [readOnly, setReadOnly] = useState(false)
  const version = useCvVersion('cv-backend')
  return (
    <div className="grid max-w-2xl gap-4">
      <label className="flex items-center gap-2 text-sm text-ink2">
        <input type="checkbox" checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} />
        Chỉ xem
      </label>
      <Card>
        {version.data ? (
          <ProfileEditor cvId="cv-backend" version={version.data} readOnly={readOnly} />
        ) : (
          <PageSkeleton rows={3} />
        )}
      </Card>
    </div>
  )
}

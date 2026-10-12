import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { AnalysisProgress, StepStatus } from '@/api/types'
import * as db from '@/mocks/db'
import { server } from '@/mocks/node'
import { renderRoute } from '@/test/render'

const main = () => within(screen.getByRole('main'))

/** A draft session whose CV and JD are both still being analysed. */
function analysingSession(cvFile = 'cv-moi.pdf') {
  const cv = db.createCv('CV mới', cvFile)
  const jd = db.createJd('JD mới', 'Backend Engineer\nYêu cầu: Python')
  const s = db.createSession({
    cv_id: cv.id,
    jd_id: jd.id,
    role: { id: 'backend_engineer', name: 'Backend Engineer' },
    level: 'mid',
  })
  return { cv, jd, s }
}

const steps = (labels: string[], statuses: StepStatus[]) =>
  labels.map((label, i) => ({ key: String(i), label, status: statuses[i]! }))

/** Serve the analysis progress from variables the test changes; counts reanalyze calls. */
function controlProgress() {
  const state = {
    cv: {
      status: 'running',
      steps: steps(['Đã tải CV', 'Đang đọc CV'], ['done', 'running']),
      error: null,
    } as AnalysisProgress,
    jd: {
      status: 'running',
      steps: steps(['Phân tích JD'], ['pending']),
      error: null,
    } as AnalysisProgress,
    reanalyzed: 0,
  }
  server.use(
    http.get('/api/cvs/:id/analysis', () => HttpResponse.json(state.cv)),
    http.get('/api/jds/:id/analysis', () => HttpResponse.json(state.jd)),
    http.post('/api/cvs/:id/reanalyze', () => {
      state.reanalyzed += 1
      state.cv = {
        status: 'running',
        steps: steps(['Đã tải CV', 'Đang đọc CV'], ['done', 'running']),
        error: null,
      }
      return HttpResponse.json(state.cv, { status: 202 })
    }),
  )
  return state
}

function failCv(code: string, message: string) {
  return {
    status: 'failed',
    steps: steps(['Đã tải CV', 'Đang đọc CV'], ['done', 'failed']),
    error: { code, message },
  } as AnalysisProgress
}

describe('SessionMatchPage while analysing (UI-5.2)', () => {
  it('lists CV then JD steps with their state, over a skeleton', async () => {
    controlProgress()
    const { s } = analysingSession()
    renderRoute(`/sessions/${s.id}/match`)

    const list = await main().findByRole('list', { name: 'Tiến trình phân tích' })
    const items = within(list).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual([
      'Đã tải CV(xong)',
      'Đang đọc CV…(đang chạy)',
      'Phân tích JD(chưa chạy)',
    ])
    expect(main().getByLabelText('Đang tải')).toBeInTheDocument()
    expect(main().getByText('Backend Engineer · Mid')).toBeInTheDocument()
  })

  it('keeps polling and leaves the progress screen when both are done', async () => {
    const state = controlProgress()
    const { s } = analysingSession()
    renderRoute(`/sessions/${s.id}/match`)
    await main().findByText('Đang đọc CV…')

    state.cv = {
      ...state.cv,
      status: 'done',
      steps: steps(['Đã tải CV', 'Đang đọc CV'], ['done', 'done']),
    }
    state.jd = { ...state.jd, status: 'done', steps: steps(['Phân tích JD'], ['done']) }

    await waitFor(
      () => expect(main().queryByRole('list', { name: 'Tiến trình phân tích' })).toBeNull(),
      { timeout: 3000 },
    )
  })

  it('a reload mid-way follows the running job without restarting it', async () => {
    const state = controlProgress()
    const { s } = analysingSession()
    const first = renderRoute(`/sessions/${s.id}/match`)
    await main().findByText('Đang đọc CV…')
    // Reload: fresh app and cache, the progress still comes from the same server job.
    first.unmount()
    state.cv = {
      ...state.cv,
      steps: steps(['Đã tải CV', 'Đang đọc CV'], ['done', 'done']),
    }
    state.jd = { ...state.jd, steps: steps(['Phân tích JD'], ['running']) }
    renderRoute(`/sessions/${s.id}/match`)
    await main().findByText('Phân tích JD…')
    expect(state.reanalyzed).toBe(0)
  })

  it('LLM error: says why, "Thử lại" re-runs the CV analysis', async () => {
    const user = userEvent.setup()
    const state = controlProgress()
    state.cv = failCv('llm_error', 'raw')
    const { s } = analysingSession()
    renderRoute(`/sessions/${s.id}/match`)

    const alert = await main().findByRole('alert')
    expect(alert).toHaveTextContent('Chưa phân tích được CV “CV mới”')
    expect(alert).toHaveTextContent('Dịch vụ AI đang lỗi')
    await user.click(within(alert).getByRole('button', { name: 'Thử lại' }))

    await main().findByText('Đang đọc CV…')
    expect(state.reanalyzed).toBe(1)
  })

  it('scanned file: no retry, "Tải file khác" goes to page 2 keeping JD, role, level', async () => {
    const user = userEvent.setup()
    const state = controlProgress()
    state.cv = failCv('no_text_in_file', 'raw')
    const { s, jd } = analysingSession('cv-scan.pdf')
    const { router } = renderRoute(`/sessions/${s.id}/match`)

    const alert = await main().findByRole('alert')
    expect(alert).toHaveTextContent('ảnh scan')
    expect(within(alert).queryByRole('button', { name: 'Thử lại' })).toBeNull()
    await user.click(within(alert).getByRole('link', { name: 'Tải file khác' }))

    expect(router.state.location.pathname).toBe('/sessions/new')
    const params = new URLSearchParams(router.state.location.search)
    expect(Object.fromEntries(params)).toEqual({
      cv: 'new',
      jd: jd.id,
      role: 'backend_engineer',
      level: 'mid',
    })
    expect(await main().findByRole('radio', { name: 'Tải CV mới' })).toBeChecked()
    expect(main().getByLabelText('JD có sẵn')).toHaveValue(jd.id)
  })

  it('JD error offers "Thêm JD khác"', async () => {
    const state = controlProgress()
    state.cv = { ...state.cv, status: 'done', steps: steps(['Đã tải CV'], ['done']) }
    state.jd = {
      status: 'failed',
      steps: steps(['Phân tích JD'], ['failed']),
      error: { code: 'llm_error', message: 'raw' },
    }
    const { s } = analysingSession()
    renderRoute(`/sessions/${s.id}/match`)

    const alert = await main().findByRole('alert')
    expect(alert).toHaveTextContent('Chưa phân tích được JD “JD mới”')
    expect(within(alert).getByRole('link', { name: 'Thêm JD khác' })).toHaveAttribute(
      'href',
      expect.stringContaining('jd=new'),
    )
  })

  it('analysed CV/JD: no progress screen', async () => {
    renderRoute('/sessions/s-match/match')
    await main().findByText('Backend Engineer · Junior')
    await waitFor(() => expect(main().queryByLabelText('Đang tải')).toBeNull())
    expect(main().queryByRole('list', { name: 'Tiến trình phân tích' })).toBeNull()
  })
})

/** A draft session on the newest analysed versions of cv-backend and jd-abc, no plan yet. */
function readySession() {
  return db.createSession({
    cv_id: 'cv-backend',
    jd_id: 'jd-abc',
    role: { id: 'backend_engineer', name: 'Backend Engineer' },
    level: 'mid',
  })
}

/** Count POST /sessions/:id/blueprint calls, passing them on to the mock. */
function countBlueprintPosts() {
  const calls = { n: 0 }
  server.events.on('request:start', ({ request }) => {
    if (request.method === 'POST' && /\/blueprint$/.test(new URL(request.url).pathname)) calls.n++
  })
  return calls
}

describe('SessionMatchPage when analysed (UI-5.3)', () => {
  afterEach(() => server.events.removeAllListeners())

  it('shows profile | requirements with versions, library links and the match', async () => {
    const s = readySession()
    const row = db.sessionRow(s.id)!
    renderRoute(`/sessions/${s.id}/match`)

    const cv = await main().findByRole('heading', { name: /CV Backend 2026/ })
    expect(cv).toHaveTextContent(`bản ${row.cv_version}`)
    expect(main().getByRole('heading', { name: /ABC · Backend/ })).toHaveTextContent(
      `bản ${row.jd_version}`,
    )
    const links = main().getAllByRole('link', { name: /Sửa trong thư viện/ })
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/library/cv/cv-backend',
      '/library/jd/jd-abc',
    ])
    expect(await main().findByRole('heading', { name: 'Kỹ năng' })).toBeInTheDocument()
    expect(main().getByRole('heading', { name: 'Yêu cầu' })).toBeInTheDocument()

    const m = db.match(row)!
    const total = m.required.covered.length + m.required.missing.length
    expect(
      await main().findByText(`Có trong CV: ${m.required.covered.length}/${total} bắt buộc`),
    ).toBeInTheDocument()
    const block = within(main().getByRole('heading', { name: 'Đối chiếu' }).parentElement!)
    for (const c of m.required.missing) expect(block.getByText(c.name)).toBeInTheDocument()
  })

  it('saving an edit creates a new version and switches the session to it', async () => {
    const user = userEvent.setup()
    const s = readySession()
    const before = db.sessionRow(s.id)!.cv_version!
    renderRoute(`/sessions/${s.id}/match`)

    await user.click(await main().findByRole('button', { name: 'Xóa Python' }))
    await user.click(main().getByRole('button', { name: `Lưu thành bản ${before + 1}` }))

    await waitFor(() => expect(db.sessionRow(s.id)!.cv_version).toBe(before + 1))
    expect(await main().findByRole('heading', { name: /CV Backend 2026/ })).toHaveTextContent(
      `bản ${before + 1}`,
    )
    expect(main().getByText(`Đã lưu · bản ${before + 1}`)).toBeInTheDocument()
  })

  it('"Lưu và tạo kế hoạch" saves pending edits, creates the plan and opens page 4', async () => {
    const user = userEvent.setup()
    const posts = countBlueprintPosts()
    const s = readySession()
    const before = db.sessionRow(s.id)!.cv_version!
    const { router } = renderRoute(`/sessions/${s.id}/match`)

    await user.click(await main().findByRole('button', { name: 'Xóa Python' }))
    await user.click(main().getByRole('button', { name: /Lưu và tạo kế hoạch/ }))

    await waitFor(() => expect(router.state.location.pathname).toBe(`/sessions/${s.id}/plan`))
    const row = db.sessionRow(s.id)!
    expect(row.cv_version).toBe(before + 1)
    expect(
      db
        .cvRow('cv-backend')!
        .versions.at(-1)!
        .profile.skills.map((k) => k.name),
    ).not.toContain('Python')
    expect(posts.n).toBe(1)
    expect(row.blueprint).not.toBeNull()
  })

  it('keeps a ready plan when nothing changed', async () => {
    const user = userEvent.setup()
    const posts = countBlueprintPosts()
    const { router } = renderRoute('/sessions/s-plan/match')

    await main().findByRole('heading', { name: 'Kỹ năng' })
    await user.click(main().getByRole('button', { name: /Lưu và tạo kế hoạch/ }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/sessions/s-plan/plan'))
    expect(posts.n).toBe(0)
  })

  it('a failed save stays on the page with the edits', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('/api/cvs/:id/versions', () =>
        HttpResponse.json({ code: 'internal_error', message: 'x' }, { status: 500 }),
      ),
    )
    const s = readySession()
    const { router } = renderRoute(`/sessions/${s.id}/match`)

    await user.click(await main().findByRole('button', { name: 'Xóa Python' }))
    await user.click(main().getByRole('button', { name: /Lưu và tạo kế hoạch/ }))

    expect(await main().findByText(/Chưa lưu được/)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(`/sessions/${s.id}/match`)
    expect(main().queryByText('Python')).toBeNull()
  })

  it('session on an older version: view-only until switched to the newest', async () => {
    const user = userEvent.setup()
    // s-match uses CV bản 2; the library has bản 3.
    renderRoute('/sessions/s-match/match')

    const banner = await main().findByText('Thư viện đã có bản 3 mới hơn')
    expect(main().queryByRole('button', { name: 'Xóa Python' })).toBeNull()
    await user.click(main().getByRole('button', { name: 'Dùng bản 3' }))

    await waitFor(() => expect(db.sessionRow('s-match')!.cv_version).toBe(3))
    await waitFor(() => expect(banner).not.toBeInTheDocument())
    expect(await main().findByRole('button', { name: 'Xóa Python' })).toBeInTheDocument()
  })

  it('started session: inputs are locked', async () => {
    renderRoute('/sessions/s-active/match')
    expect(await main().findByText('Phiên đã bắt đầu nên đầu vào đã khóa')).toBeInTheDocument()
    await main().findByRole('heading', { name: 'Kỹ năng' })
    expect(main().queryByRole('button', { name: /^Xóa / })).toBeNull()
    expect(main().getByRole('button', { name: /Xem kế hoạch/ })).toBeInTheDocument()
  })
})

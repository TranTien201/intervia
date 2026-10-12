import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { vi } from 'vitest'
import type { BlueprintView } from '@/api/types'
import { getStartStream } from '@/features/sessions/start-interview'
import * as db from '@/mocks/db'
import { server } from '@/mocks/node'
import { renderRoute } from '@/test/render'

const main = () => within(screen.getByRole('main'))

const PLAN: BlueprintView = {
  status: 'done',
  stale: false,
  total_questions: 12,
  competencies: [
    {
      id: 'API_DESIGN',
      name: 'Thiết kế API',
      weight: 0.3,
      depth_band: ['L3', 'L4'],
      questions_min: 3,
      questions_max: 4,
    },
    {
      id: 'DATABASE',
      name: 'Database',
      weight: 0.25,
      depth_band: ['L3', 'L4'],
      questions_min: 3,
      questions_max: 3,
    },
  ],
  error: null,
}

/** Serve the blueprint from a variable the test changes; counts POST calls. */
function controlBlueprint(initial: BlueprintView) {
  const state = { view: initial, created: 0 }
  server.use(
    http.get('/api/sessions/:id/blueprint', () => HttpResponse.json(state.view)),
    http.post('/api/sessions/:id/blueprint', () => {
      state.created += 1
      state.view = { ...PLAN, status: 'running', competencies: [], total_questions: 0 }
      return HttpResponse.json(state.view, { status: 202 })
    }),
  )
  return state
}

/** Fake getUserMedia + Web Audio: a mic that hears a loud signal, or fails with `error`. */
function fakeMic(error?: string) {
  const stopTrack = vi.fn()
  const getUserMedia = vi.fn(() =>
    error
      ? Promise.reject(new DOMException('mic', error))
      : Promise.resolve({ getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream),
  )
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia },
    configurable: true,
  })
  class FakeAudioContext {
    createAnalyser() {
      return {
        fftSize: 0,
        getByteTimeDomainData: (a: Uint8Array) => a.forEach((_, i) => (a[i] = i % 2 ? 200 : 56)),
      }
    }
    createMediaStreamSource() {
      return { connect: () => {} }
    }
    close() {
      return Promise.resolve()
    }
  }
  vi.stubGlobal('AudioContext', FakeAudioContext)
  // One frame is enough to show the level; don't loop forever.
  vi.stubGlobal('requestAnimationFrame', () => 0)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  return { getUserMedia, stopTrack }
}

afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'mediaDevices')
})

describe('SessionPlanPage (UI-5.4)', () => {
  it('shows the plan: topic, weight, depth band, question count, "khoảng N câu"', async () => {
    controlBlueprint(PLAN)
    renderRoute('/sessions/s-plan/plan')

    const table = await main().findByRole('table', { name: /khoảng 12 câu/i })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((r) => r.textContent)).toEqual(['Thiết kế API30%L3–L43–4', 'Database25%L3–L43'])
    expect(within(table).getByRole('meter', { name: 'Trọng số Thiết kế API' })).toHaveAttribute(
      'aria-valuenow',
      '30',
    )
  })

  it('explains depth L1–L7 on demand', async () => {
    controlBlueprint(PLAN)
    renderRoute('/sessions/s-plan/plan')
    const toggle = await main().findByRole('button', { name: /Độ sâu L1–L7 là gì/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(main().queryByText('Tìm và sửa lỗi')).not.toBeInTheDocument()

    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(main().getByText('Tìm và sửa lỗi')).toBeInTheDocument()
  })

  it('shows progress while the plan is being made, then the plan', async () => {
    const bp = controlBlueprint({ ...PLAN, status: 'running', competencies: [] })
    renderRoute('/sessions/s-plan/plan')

    const list = await main().findByRole('list', { name: 'Tiến trình phân tích' })
    expect(within(list).getByText(/Đang lập kế hoạch phỏng vấn/)).toBeInTheDocument()
    expect(main().getByLabelText('Đang tải')).toBeInTheDocument()

    bp.view = PLAN
    expect(await main().findByRole('table', {}, { timeout: 4000 })).toBeInTheDocument()
  })

  it('makes the plan when opened before one exists', async () => {
    const bp = controlBlueprint({ ...PLAN, status: 'pending', competencies: [] })
    renderRoute('/sessions/s-plan/plan')
    await main().findByRole('list', { name: 'Tiến trình phân tích' })
    await waitFor(() => expect(bp.created).toBe(1))
  })

  it('offers to retry when making the plan failed', async () => {
    const bp = controlBlueprint({
      ...PLAN,
      status: 'failed',
      competencies: [],
      error: { code: 'llm_error', message: 'x' },
    })
    renderRoute('/sessions/s-plan/plan')

    const alert = await main().findByRole('alert')
    expect(alert).toHaveTextContent('Dịch vụ AI đang lỗi')
    await userEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }))
    await waitFor(() => expect(bp.created).toBe(1))
    expect(await main().findByRole('list', { name: 'Tiến trình phân tích' })).toBeInTheDocument()
  })

  it('asks to remake a stale plan and blocks starting until then', async () => {
    const bp = controlBlueprint({ ...PLAN, stale: true })
    renderRoute('/sessions/s-plan/plan')

    expect(await main().findByText('Hồ sơ đã thay đổi, tạo lại kế hoạch?')).toBeInTheDocument()
    expect(main().getByRole('button', { name: /Bắt đầu phỏng vấn/ })).toBeDisabled()

    await userEvent.click(main().getByRole('button', { name: 'Tạo lại kế hoạch' }))
    await waitFor(() => expect(bp.created).toBe(1))
    expect(await main().findByRole('list', { name: 'Tiến trình phân tích' })).toBeInTheDocument()
  })

  it('shows the mic check only for spoken modes', async () => {
    controlBlueprint(PLAN)
    renderRoute('/sessions/s-plan/plan')
    const text = await main().findByRole('radio', { name: 'Text' })
    expect(text).toBeChecked()
    expect(main().getByText('Đổi được trong lúc phỏng vấn.')).toBeInTheDocument()
    expect(main().queryByText('Kiểm tra mic')).not.toBeInTheDocument()

    await userEvent.click(main().getByRole('radio', { name: 'Nói → Nói' }))
    expect(main().getByText('Kiểm tra mic')).toBeInTheDocument()
  })

  it('shows the mic level and releases the mic when the check stops', async () => {
    const mic = fakeMic()
    controlBlueprint(PLAN)
    renderRoute('/sessions/s-plan/plan')
    await userEvent.click(await main().findByRole('radio', { name: 'Nói → Chữ' }))
    await userEvent.click(main().getByRole('button', { name: 'Bắt đầu kiểm tra' }))

    expect(mic.getUserMedia).toHaveBeenCalledWith({ audio: true })
    expect(await main().findByText('Nghe rõ')).toBeInTheDocument()
    expect(main().getByRole('meter', { name: 'Mức âm thanh từ mic' })).toBeInTheDocument()

    await userEvent.click(main().getByRole('button', { name: 'Dừng kiểm tra' }))
    expect(mic.stopTrack).toHaveBeenCalled()
  })

  it('switches to Text with the reason and the fix when the mic is blocked', async () => {
    fakeMic('NotAllowedError')
    controlBlueprint(PLAN)
    renderRoute('/sessions/s-plan/plan')
    await userEvent.click(await main().findByRole('radio', { name: 'Nói → Nói' }))
    await userEvent.click(main().getByRole('button', { name: 'Bắt đầu kiểm tra' }))

    expect(await main().findByText(/Đã chuyển sang Text/)).toBeInTheDocument()
    expect(main().getByText(/Trình duyệt đang chặn quyền dùng mic/)).toBeInTheDocument()
    expect(main().getByText(/ổ khóa cạnh thanh địa chỉ/)).toBeInTheDocument()
    expect(main().getByRole('radio', { name: 'Text' })).toBeChecked()
    expect(main().queryByText('Kiểm tra mic')).not.toBeInTheDocument()
  })

  it('starts with the chosen mode and opens the interview page', async () => {
    let body: unknown
    server.use(
      http.post('/api/sessions/:id/start', async ({ request }) => {
        body = await request.json()
        return new HttpResponse('event: progress\ndata: {"asked":1,"planned":12}\n\n', {
          headers: { 'Content-Type': 'text/event-stream' },
        })
      }),
    )
    const { router } = renderRoute('/sessions/s-plan/plan')
    await userEvent.click(await main().findByRole('radio', { name: 'Nói → Chữ' }))
    await userEvent.click(main().getByRole('button', { name: /Bắt đầu phỏng vấn/ }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/sessions/s-plan/interview'))
    expect(body).toEqual({ mode: 'voice_text' })
    // The first question's stream is kept for page 5.
    expect(getStartStream('s-plan')?.events[0]).toEqual({
      event: 'progress',
      data: { asked: 1, planned: 12 },
    })
  })

  it('stays on the page with the reason when start is refused', async () => {
    server.use(
      http.post('/api/sessions/:id/start', () =>
        HttpResponse.json(
          { error: { code: 'blueprint_not_ready', message: 'x' } },
          { status: 409 },
        ),
      ),
    )
    const { router } = renderRoute('/sessions/s-plan/plan')
    await userEvent.click(await main().findByRole('button', { name: /Bắt đầu phỏng vấn/ }))

    expect(await main().findByRole('alert')).toHaveTextContent('Kế hoạch phỏng vấn chưa tạo xong')
    expect(router.state.location.pathname).toBe('/sessions/s-plan/plan')
  })

  it('links the stepper back to steps 1 and 2 before the session starts', async () => {
    renderRoute('/sessions/s-plan/plan')
    const nav = await main().findByRole('navigation', { name: /bước/i })
    await waitFor(() =>
      expect(within(nav).getByRole('link', { name: /Đối chiếu/ })).toHaveAttribute(
        'href',
        '/sessions/s-plan/match',
      ),
    )
    expect(within(nav).getByRole('link', { name: /Chọn CV & JD/ })).toBeInTheDocument()
  })

  it('is view-only once the session has started', async () => {
    renderRoute('/sessions/s-active/plan')

    expect(await main().findByText('Phiên đã bắt đầu nên kế hoạch đã khóa')).toBeInTheDocument()
    expect(await main().findByRole('table')).toBeInTheDocument()
    expect(main().queryByRole('radio')).not.toBeInTheDocument()
    expect(main().queryByRole('button', { name: /Bắt đầu phỏng vấn/ })).not.toBeInTheDocument()
    expect(main().getByRole('link', { name: /Vào phỏng vấn/ })).toHaveAttribute(
      'href',
      '/sessions/s-active/interview',
    )
    expect(within(main().getByRole('navigation', { name: /bước/i })).queryByRole('link')).toBeNull()
  })
})

// The real mock API end to end: the plan comes from the mock DB, start flips the session.
describe('SessionPlanPage with the mock API', () => {
  it('starts the seeded draft session', async () => {
    const { router } = renderRoute('/sessions/s-plan/plan')
    await userEvent.click(await main().findByRole('button', { name: /Bắt đầu phỏng vấn/ }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/sessions/s-plan/interview'))
    expect(db.sessionRow('s-plan')?.status).toBe('in_progress')
  })
})

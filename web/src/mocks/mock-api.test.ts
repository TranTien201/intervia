// @vitest-environment node
// Node environment: jsdom's FormData/File are not understood by Node's fetch.
import { ApiError, request } from '@/api/client'
import { postStream } from '@/api/sse'
import type {
  AnalysisProgress,
  CvSummary,
  JdDetail,
  JdSummary,
  StreamEvent,
  Transcript,
} from '@/api/types'
import { ANALYSIS_MS, MOCK_MAX_QUESTIONS } from './db'

async function collect(path: string, body: Record<string, unknown>) {
  const events: StreamEvent[] = []
  await postStream(path, body, (e) => events.push(e))
  return events
}

vi.stubGlobal('location', new URL('http://localhost:3000/'))

describe('mock API', () => {
  it('streams a full text interview until session_ended', async () => {
    const start = await collect('/sessions/s-plan/start', { mode: 'text' })
    expect(start.map((e) => e.event)).toEqual(
      expect.arrayContaining(['message_start', 'token', 'message_done', 'progress']),
    )

    const hint = await collect('/sessions/s-plan/events', { type: 'HINT' })
    const hintDone = hint.find((e) => e.event === 'message_done')
    expect(hintDone?.data).toMatchObject({ item: { kind: 'event', type: 'HINT', hint_level: 1 } })

    let ended = false
    for (let i = 0; i < MOCK_MAX_QUESTIONS && !ended; i++) {
      const events = await collect('/sessions/s-plan/turns', { text: `Câu trả lời ${i}` })
      expect(events[0]?.event).toBe('user_item')
      ended = events.some((e) => e.event === 'session_ended')
    }
    expect(ended).toBe(true)

    const t = await request<Transcript>('/sessions/s-plan/transcript')
    expect(t.session.status).toBe('completed')
    expect(t.items.filter((i) => i.kind === 'question')).toHaveLength(MOCK_MAX_QUESTIONS)
    expect(t.summary?.question_count).toBe(MOCK_MAX_QUESTIONS)
  })

  it('analyses an uploaded CV step by step', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const form = new FormData()
    form.append('file', new File(['x'], 'cv-moi.pdf'))
    form.append('name', 'CV mới')
    const cv = await request<CvSummary>('/cvs', { method: 'POST', body: form })
    expect(cv.analysis_status).toBe('running')

    const p1 = await request<AnalysisProgress>(`/cvs/${cv.id}/analysis`)
    expect(p1.steps[0]?.status).toBe('running')

    vi.setSystemTime(Date.now() + ANALYSIS_MS + 10)
    const p2 = await request<AnalysisProgress>(`/cvs/${cv.id}/analysis`)
    expect(p2.status).toBe('done')
    expect((await request<CvSummary>(`/cvs/${cv.id}`)).latest_version).toBe(1)
    vi.useRealTimers()
  })

  it('fails analysis for scanned files', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const form = new FormData()
    form.append('file', new File(['x'], 'ban-scan.pdf'))
    form.append('name', 'CV scan')
    const cv = await request<CvSummary>('/cvs', { method: 'POST', body: form })
    vi.setSystemTime(Date.now() + ANALYSIS_MS)
    const p = await request<AnalysisProgress>(`/cvs/${cv.id}/analysis`)
    expect(p.status).toBe('failed')
    expect(p.error?.code).toBe('no_text_in_file')
    vi.useRealTimers()
  })

  it('adds a JD from an uploaded file with its text extracted', async () => {
    const form = new FormData()
    form.append('file', new File(['x'], 'jd-acme.docx'))
    form.append('name', 'JD ACME')
    const jd = await request<JdSummary>('/jds', { method: 'POST', body: form })
    expect(jd.analysis_status).toBe('running')
    const detail = await request<JdDetail>(`/jds/${jd.id}`)
    expect(detail.text).toContain('jd-acme.docx')
  })

  it('rejects a scanned JD file on upload', async () => {
    const form = new FormData()
    form.append('file', new File(['x'], 'jd-scan.pdf'))
    form.append('name', 'JD scan')
    const err = await request('/jds', { method: 'POST', body: form }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).code).toBe('no_text_in_file')
  })

  it('rejects deleting a CV that does not exist', async () => {
    await expect(request('/cvs/nope', { method: 'DELETE' })).rejects.toMatchObject({
      code: 'not_found',
      status: 404,
    })
  })
})

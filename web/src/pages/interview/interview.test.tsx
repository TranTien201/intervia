import { act, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { LIMITS, type QuestionItem, type StreamEvent, type TranscriptItem } from '@/api/types'
import { startInterview } from '@/features/sessions/start-interview'
import * as db from '@/mocks/db'
import { server } from '@/mocks/node'
import { durationLabel, progressLabel } from '@/lib/format'
import { renderRoute } from '@/test/render'
import { answerToSend } from './conversation-state'
import { AWAIT_GIVE_UP_MS, AWAIT_POLL_MS, useAwaitReply } from './use-await-reply'

const conversation = () => within(screen.getByRole('log'))

describe('Interview page frame (UI-6.1)', () => {
  it('shows role, level, progress, mode switch and stop, without the sidebar', async () => {
    renderRoute('/sessions/s-active/interview')
    await screen.findByText('AI Engineer · Senior')
    const bar = screen.getByRole('banner')
    expect(within(bar).getByText(/^Câu \d+\/~\d+$/)).toBeInTheDocument()
    expect(within(bar).getByRole('button', { name: 'Dừng' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Hội thoại' })).toBeInTheDocument()
  })

  it('has Text selected and locks the voice modes until UI-9', async () => {
    renderRoute('/sessions/s-active/interview')
    const modes = await screen.findByRole('radiogroup', { name: 'Chế độ phỏng vấn' })
    expect(within(modes).getByRole('radio', { name: 'Text' })).toBeChecked()
    expect(within(modes).getByRole('radio', { name: /Nói → Chữ/ })).toBeDisabled()
    expect(within(modes).getByRole('radio', { name: /Nói → Nói/ })).toBeDisabled()
  })

  it('formats progress as an estimate', () => {
    expect(progressLabel({ asked: 4, planned: 12 })).toBe('Câu 4/~12')
  })
})

/** An SSE response the test writes to event by event. */
function controlledSse() {
  const enc = new TextEncoder()
  let ctrl!: ReadableStreamDefaultController<Uint8Array>
  const body = new ReadableStream<Uint8Array>({ start: (c) => void (ctrl = c) })
  return {
    response: () => new HttpResponse(body, { headers: { 'Content-Type': 'text/event-stream' } }),
    send: (e: StreamEvent) =>
      ctrl.enqueue(enc.encode(`event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`)),
    close: () => ctrl.close(),
  }
}

const QUESTION: QuestionItem = {
  kind: 'question',
  id: 'q-new',
  index: 1,
  text: 'Bạn kể về hệ thống hàng đợi đã làm nhé.',
  competency: { id: 'MESSAGING', name: 'Hàng đợi' },
  depth: 'L3',
  unplanned: false,
  created_at: new Date().toISOString(),
}

/** Start s-plan through a controlled stream, as page 4 would, then open page 5. */
async function startAndOpen() {
  const sse = controlledSse()
  server.use(http.post('/api/sessions/:id/start', () => sse.response()))
  db.startSession(db.sessionRow('s-plan')!, 'text')
  const started = startInterview('s-plan', 'text')
  sse.send({ event: 'message_start', data: { item_id: QUESTION.id, kind: 'question' } })
  await started
  renderRoute('/sessions/s-plan/interview')
  await screen.findByRole('log')
  return sse
}

describe('Interview conversation (UI-6.2)', () => {
  it('rebuilds the conversation from the transcript, latest question large', async () => {
    renderRoute('/sessions/s-active/interview')
    const log = await screen.findByRole('log')
    await within(log).findByText(/RAG trên tài liệu nội bộ/)

    expect(within(log).getAllByText('Người phỏng vấn')).toHaveLength(3)
    expect(within(log).getAllByText('Bạn')).toHaveLength(2)
    const questions = db.sessionRow('s-active')!.items.filter((i) => i.kind === 'question')
    expect(within(log).getByText(questions[2]!.text)).toHaveClass('text-question', 'text-ink')
    expect(within(log).getByText(questions[0]!.text)).toHaveClass('text-ink2')
    // No competency names, depth or marks during the interview.
    for (const q of questions) expect(within(log).queryByText(q.competency!.name)).toBeNull()
    expect(within(log).queryByText(/L\d/)).toBeNull()
  })

  it('shows repeat / hint / skip events as amber notes and code answers in mono', async () => {
    const s = db.sessionRow('s-active')!
    const q3 = s.items.at(-1)!
    const at = new Date().toISOString()
    db.addItem(s, {
      kind: 'event',
      id: 'e-hint',
      question_id: q3.id,
      type: 'HINT',
      hint_level: 1,
      text: 'Thử nghĩ về cache.',
      created_at: at,
    })
    db.addItem(s, {
      kind: 'answer',
      id: 'a-code',
      question_id: q3.id,
      text_original: 'Mình dùng `lru_cache`:\n\n```python\n@lru_cache\ndef f(): ...\n```',
      text_edited: null,
      source: 'text',
      has_audio: false,
      duration_ms: null,
      created_at: at,
    })
    db.addItem(s, {
      kind: 'event',
      id: 'e-skip',
      question_id: q3.id,
      type: 'SKIP',
      hint_level: null,
      text: null,
      created_at: at,
    })
    renderRoute('/sessions/s-active/interview')
    await screen.findByRole('log')

    expect(await conversation().findByText('Bạn xin gợi ý')).toHaveClass('text-amber')
    expect(conversation().getByText('Bạn đã bỏ qua câu này')).toHaveClass('text-amber')
    // The hint is now the interviewer's current line.
    expect(conversation().getByText('Thử nghĩ về cache.')).toHaveClass('text-question')
    expect(conversation().getByText('lru_cache')).toHaveClass('font-mono')
    expect(
      conversation()
        .getByText(/def f\(\)/)
        .closest('pre'),
    ).toHaveClass('font-mono')
  })

  it('streams the first question from page 4 with a cursor, then shows the saved line', async () => {
    const sse = await startAndOpen()
    act(() => sse.send({ event: 'token', data: { text: 'Bạn kể về ' } }))
    const line = await conversation().findByText(/^Bạn kể về/)
    expect(line).toHaveTextContent('▌')
    expect(screen.getByRole('log')).toHaveAttribute('aria-busy', 'true')

    act(() => {
      sse.send({ event: 'token', data: { text: 'hệ thống hàng đợi đã làm nhé.' } })
      sse.send({ event: 'message_done', data: { item: QUESTION } })
      sse.close()
    })
    await waitFor(() => expect(screen.getByRole('log')).toHaveAttribute('aria-busy', 'false'))
    expect(conversation().getByText(QUESTION.text)).not.toHaveTextContent('▌')
    expect(conversation().getAllByText('Người phỏng vấn')).toHaveLength(1)
  })

  it('drops the half line when the stream fails and shows the saved question', async () => {
    const sse = await startAndOpen()
    act(() => sse.send({ event: 'token', data: { text: 'Bạn kể ' } }))
    await conversation().findByText(/^Bạn kể/)

    // The server saved the full question before the stream broke.
    db.addItem(db.sessionRow('s-plan')!, QUESTION)
    act(() => {
      sse.send({ event: 'error', data: { code: 'llm_error', message: 'Gián đoạn.' } })
      sse.close()
    })
    expect(await conversation().findByText(QUESTION.text)).not.toHaveTextContent('▌')
    expect(conversation().queryByText(/^Bạn kể$/)).toBeNull()
  })

  it('stops following while the user reads above, with a button back to the latest', async () => {
    const sse = await startAndOpen()
    const geometry = (scrollY: number) => {
      Object.defineProperty(document.documentElement, 'scrollHeight', {
        configurable: true,
        value: 3000,
      })
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
      Object.defineProperty(window, 'scrollY', { configurable: true, value: scrollY })
      window.dispatchEvent(new Event('scroll'))
    }
    act(() => geometry(500)) // scrolled up
    act(() => sse.send({ event: 'token', data: { text: 'Bạn kể ' } }))
    const jump = await screen.findByRole('button', { name: '↓ Mới nhất' })

    const scrollTo = vi.spyOn(window, 'scrollTo')
    await userEvent.click(jump)
    expect(scrollTo).toHaveBeenCalledWith({ top: 3000 })
    expect(screen.queryByRole('button', { name: '↓ Mới nhất' })).toBeNull()

    act(() => geometry(2200)) // at the bottom: keeps following
    act(() => sse.send({ event: 'token', data: { text: 'thêm.' } }))
    await conversation().findByText(/thêm\./)
    expect(screen.queryByRole('button', { name: '↓ Mới nhất' })).toBeNull()
  })
})

describe('Text mode bottom bar (UI-6.3)', () => {
  const box = () => screen.getByRole('textbox', { name: 'Câu trả lời' })
  const open = async () => {
    renderRoute('/sessions/s-active/interview')
    await within(await screen.findByRole('log')).findByText(/RAG trên tài liệu nội bộ/)
    await waitFor(() => expect(box()).not.toHaveAttribute('readonly'))
  }

  it('sends with Ctrl+Enter, Enter alone makes a new line', async () => {
    await open()
    const before = db.sessionRow('s-active')!.items.length
    await userEvent.type(box(), 'Dòng một{Enter}dòng hai')
    expect(box()).toHaveValue('Dòng một\ndòng hai')
    expect(db.sessionRow('s-active')!.items).toHaveLength(before)

    await userEvent.keyboard('{Control>}{Enter}{/Control}')
    await waitFor(() => expect(box()).toHaveValue(''))
    expect(conversation().getByText(/Dòng một\s+dòng hai/)).toBeInTheDocument()
    const answer = db
      .sessionRow('s-active')!
      .items.find((i) => i.kind === 'answer' && i.text_original.startsWith('Dòng một'))
    expect(answer).toBeDefined()
    // The next question streams in and becomes the current line.
    await waitFor(() => expect(screen.getByRole('log')).toHaveAttribute('aria-busy', 'false'))
    expect(db.sessionRow('s-active')!.items.at(-1)!.kind).toBe('question')
  })

  it('locks the box and quick buttons while the interviewer answers', async () => {
    await open()
    const sse = controlledSse()
    server.use(http.post('/api/sessions/:id/events', () => sse.response()))
    await userEvent.type(box(), 'đang gõ dở')
    await userEvent.click(screen.getByRole('button', { name: 'Nhắc lại' }))
    act(() => {
      sse.send({
        event: 'message_start',
        data: { item_id: 'e-rep', kind: 'event', event_type: 'REPEAT' },
      })
      sse.send({ event: 'token', data: { text: 'Mình nhắc lại' } })
    })
    expect(await conversation().findByText('Bạn xin nhắc lại câu hỏi')).toHaveClass('text-amber')
    expect(box()).toHaveAttribute('readonly')
    for (const name of ['Nhắc lại', 'Giải thích', 'Gợi ý', 'Bỏ qua', 'Gửi'])
      expect(screen.getByRole('button', { name })).toBeDisabled()

    act(() => {
      sse.send({
        event: 'message_done',
        data: {
          item: {
            kind: 'event',
            id: 'e-rep',
            question_id: null,
            type: 'REPEAT',
            hint_level: null,
            text: 'Mình nhắc lại nhé.',
            created_at: new Date().toISOString(),
          },
        },
      })
      sse.close()
    })
    await waitFor(() => expect(box()).not.toHaveAttribute('readonly'))
    // A quick button never touches what was being typed.
    expect(box()).toHaveValue('đang gõ dở')
    expect(screen.getByRole('button', { name: 'Gợi ý' })).toBeEnabled()
  })

  it('sends quick buttons as events, not through classify', async () => {
    await open()
    let body: unknown
    server.use(
      http.post('/api/sessions/:id/events', async ({ request }) => {
        body = await request.json()
        return controlledSse().response()
      }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Gợi ý' }))
    await waitFor(() => expect(body).toEqual({ type: 'HINT' }))
  })

  it('keeps the typed answer and shows why when sending fails', async () => {
    await open()
    server.use(http.post('/api/sessions/:id/turns', () => HttpResponse.error()))
    await userEvent.type(box(), 'Câu trả lời quan trọng')
    await userEvent.click(screen.getByRole('button', { name: 'Gửi' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Không kết nối được máy chủ')
    expect(box()).toHaveValue('Câu trả lời quan trọng')
    expect(box()).not.toHaveAttribute('readonly')
  })

  it('code mode switches to mono and sends the answer fenced', async () => {
    await open()
    let body: { text?: string } = {}
    server.use(
      http.post('/api/sessions/:id/turns', async ({ request }) => {
        body = (await request.json()) as { text: string }
        return controlledSse().response()
      }),
    )
    const toggle = screen.getByRole('button', { name: /Code/ })
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(box()).toHaveClass('font-mono')
    await userEvent.type(box(), 'def f():{Enter}    return 1')
    await userEvent.click(screen.getByRole('button', { name: 'Gửi' }))
    await waitFor(() => expect(body.text).toBe('```\ndef f():\n    return 1\n```'))
  })

  it('turns code mode on when pasting a fenced block', async () => {
    await open()
    await userEvent.click(box())
    await userEvent.paste('```sql\nSELECT 1\n```')
    expect(box()).toHaveClass('font-mono')
    expect(screen.getByRole('button', { name: /Code/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows a counter near the limit and blocks sending over it', async () => {
    await open()
    await userEvent.click(box())
    await userEvent.paste('a'.repeat(LIMITS.answerMaxChars - 10))
    expect(screen.getByText(/7\.990 \/ 8\.000 ký tự/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gửi' })).toBeEnabled()
    await userEvent.paste('b'.repeat(20))
    expect(screen.getByText(/8\.010 \/ 8\.000 ký tự/)).toHaveClass('text-danger')
    expect(screen.getByRole('button', { name: 'Gửi' })).toBeDisabled()
  })
})

describe('Progress, stop, end (UI-6.4)', () => {
  const box = () => screen.getByRole('textbox', { name: 'Câu trả lời' })
  const bar = () => within(screen.getByRole('banner'))
  const open = async () => {
    renderRoute('/sessions/s-active/interview')
    await within(await screen.findByRole('log')).findByText(/RAG trên tài liệu nội bộ/)
    await waitFor(() => expect(box()).not.toHaveAttribute('readonly'))
  }

  it('updates "Câu x/~y" from the progress event', async () => {
    const sse = await startAndOpen()
    act(() => sse.send({ event: 'progress', data: { asked: 1, planned: 9 } }))
    expect(await bar().findByText('Câu 1/~9')).toBeInTheDocument()
  })

  it('asks before stopping; "Tiếp tục" keeps the session and what was typed', async () => {
    await open()
    await userEvent.type(box(), 'chưa gửi')
    await userEvent.click(bar().getByRole('button', { name: 'Dừng' }))
    const confirm = screen.getByRole('alertdialog', { name: 'Dừng ở đây?' })
    expect(confirm).toHaveTextContent('Các câu đã trả lời vẫn được lưu.')
    await userEvent.click(within(confirm).getByRole('button', { name: 'Tiếp tục' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(box()).toHaveValue('chưa gửi')
    expect(db.sessionRow('s-active')!.status).toBe('in_progress')
  })

  it('stops, then shows the summary instead of the bottom bar', async () => {
    await open()
    await userEvent.click(bar().getByRole('button', { name: 'Dừng' }))
    await userEvent.click(screen.getByRole('button', { name: 'Dừng phỏng vấn' }))

    const end = await screen.findByRole('region', { name: /Buổi phỏng vấn đã kết thúc/ })
    const summary = db.sessionRow('s-active')!.summary!
    expect(db.sessionRow('s-active')!.status).toBe('completed')
    expect(end).toHaveTextContent(`${summary.question_count} câu`)
    expect(end).toHaveTextContent(`Đã hỏi: ${summary.assessed.map((c) => c.name).join(' · ')}`)
    if (summary.not_assessed.length > 0)
      expect(end).toHaveTextContent(
        `Chưa đánh giá: ${summary.not_assessed.map((c) => c.name).join(' · ')}`,
      )
    expect(end).toHaveFocus()
    expect(within(end).getByRole('link', { name: 'Về danh sách' })).toHaveAttribute('href', '/')
    expect(within(end).getByRole('link', { name: 'Xem lại phiên →' })).toHaveAttribute(
      'href',
      '/sessions/s-active/review',
    )
    expect(screen.queryByRole('textbox', { name: 'Câu trả lời' })).toBeNull()
    expect(bar().queryByRole('button', { name: 'Dừng' })).toBeNull()
    expect(await conversation().findByText('Bạn đã dừng phiên')).toBeInTheDocument()
  })

  it('keeps the confirm box open with the reason when stopping fails', async () => {
    await open()
    server.use(http.post('/api/sessions/:id/stop', () => HttpResponse.error()))
    await userEvent.click(bar().getByRole('button', { name: 'Dừng' }))
    await userEvent.click(screen.getByRole('button', { name: 'Dừng phỏng vấn' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Không kết nối được máy chủ')
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(box()).toBeInTheDocument()
  })

  it('stopping while the interviewer is streaming drops the half line', async () => {
    const sse = await startAndOpen()
    act(() => sse.send({ event: 'token', data: { text: 'Bạn kể về' } }))
    expect(await conversation().findByText(/Bạn kể về/)).toBeInTheDocument()
    await userEvent.click(bar().getByRole('button', { name: 'Dừng' }))
    await userEvent.click(screen.getByRole('button', { name: 'Dừng phỏng vấn' }))
    await screen.findByRole('region', { name: /Buổi phỏng vấn đã kết thúc/ })
    // Tokens still arriving from the old stream add nothing.
    act(() => sse.send({ event: 'token', data: { text: ' hệ thống' } }))
    expect(screen.getByRole('log')).toHaveAttribute('aria-busy', 'false')
    expect(conversation().queryByText(/Bạn kể về hệ thống/)).toBeNull()
  })

  it('shows the summary when the server ends the session', async () => {
    await open()
    const sse = controlledSse()
    server.use(http.post('/api/sessions/:id/turns', () => sse.response()))
    await userEvent.type(box(), 'Câu trả lời cuối')
    await userEvent.click(screen.getByRole('button', { name: 'Gửi' }))
    act(() =>
      sse.send({
        event: 'session_ended',
        data: {
          question_count: 5,
          duration_seconds: 24 * 60 + 10,
          assessed: [{ id: 'RAG', name: 'RAG' }],
          not_assessed: [{ id: 'COMM', name: 'Giao tiếp' }],
        },
      }),
    )
    const end = await screen.findByRole('region', { name: /Buổi phỏng vấn đã kết thúc/ })
    expect(end).toHaveTextContent('Buổi phỏng vấn đã kết thúc · 5 câu · 24 phút')
    expect(end).toHaveTextContent('Đã hỏi: RAG')
    expect(end).toHaveTextContent('Chưa đánh giá: Giao tiếp')
    expect(within(end).getByText('Chưa đánh giá')).not.toHaveClass('text-danger')
  })

  it('formats the duration', () => {
    expect(durationLabel(20)).toBe('dưới 1 phút')
    expect(durationLabel(24 * 60)).toBe('24 phút')
    expect(durationLabel(60 * 60)).toBe('1 giờ')
    expect(durationLabel(65 * 60)).toBe('1 giờ 5 phút')
  })
})

describe('answerToSend', () => {
  it('trims around the answer but keeps inner whitespace', () => {
    expect(answerToSend('\n  a\n    b  \n\n', false)).toBe('  a\n    b')
  })
  it('fences code once', () => {
    expect(answerToSend('x = 1', true)).toBe('```\nx = 1\n```')
    expect(answerToSend('```py\nx = 1\n```', true)).toBe('```py\nx = 1\n```')
  })
})

describe('Recovery and network (UI-6.5)', () => {
  const box = () => screen.getByRole('textbox', { name: 'Câu trả lời' })
  const draftKey = 'intervia.draft.s-active'
  const answerItem = (id: string, text: string): TranscriptItem => ({
    kind: 'answer',
    id,
    question_id: db.currentQuestion(db.sessionRow('s-active')!)!.id,
    text_original: text,
    text_edited: null,
    source: 'text',
    has_audio: false,
    duration_ms: null,
    created_at: new Date().toISOString(),
  })
  const nextQuestion: QuestionItem = { ...QUESTION, id: 'q-next', index: 4 }

  it('opens the step of a session not started yet, the review of one already over', async () => {
    const plan = renderRoute('/sessions/s-match/interview')
    await waitFor(() => expect(plan.router.state.location.pathname).toBe('/sessions/s-match/match'))
    plan.unmount()
    const done = renderRoute('/sessions/s-done/interview')
    await waitFor(() => expect(done.router.state.location.pathname).toBe('/sessions/s-done/review'))
  })

  it('says the session was restored and keeps the answer typed before the reload', async () => {
    localStorage.setItem(draftKey, JSON.stringify({ text: 'đang gõ dở', code: false }))
    renderRoute('/sessions/s-active/interview')
    const banner = await screen.findByText('Đã khôi phục phiên')
    expect(banner.closest('[role="status"]')).toHaveTextContent(/đang gõ dở vẫn còn/)
    expect(box()).toHaveValue('đang gõ dở')
  })

  it('keeps what is typed in localStorage and drops it once sent', async () => {
    renderRoute('/sessions/s-active/interview')
    await waitFor(() => expect(box()).not.toHaveAttribute('readonly'))
    await userEvent.type(box(), 'Câu trả lời')
    expect(JSON.parse(localStorage.getItem(draftKey)!)).toEqual({
      text: 'Câu trả lời',
      code: false,
    })
    await userEvent.click(screen.getByRole('button', { name: 'Gửi' }))
    await waitFor(() => expect(box()).toHaveValue(''))
    expect(localStorage.getItem(draftKey)).toBeNull()
  })

  it('drops the draft as soon as the answer is saved, before the next question streams in', async () => {
    renderRoute('/sessions/s-active/interview')
    await waitFor(() => expect(box()).not.toHaveAttribute('readonly'))
    const sse = controlledSse()
    server.use(http.post('/api/sessions/:id/turns', () => sse.response()))
    await userEvent.type(box(), 'Câu trả lời đã lưu')
    await userEvent.click(screen.getByRole('button', { name: 'Gửi' }))
    act(() => {
      sse.send({
        event: 'user_item',
        data: {
          item: {
            kind: 'answer',
            id: 'a-saved',
            question_id: 'q-current',
            text_original: 'Câu trả lời đã lưu',
            text_edited: null,
            source: 'text',
            has_audio: false,
            duration_ms: null,
            created_at: new Date().toISOString(),
          },
        },
      })
      sse.send({ event: 'message_start', data: { item_id: 'q-next', kind: 'question' } })
    })
    // A reload now must not bring the saved answer back to send twice.
    await waitFor(() => expect(box()).toHaveValue(''))
    expect(localStorage.getItem(draftKey)).toBeNull()
    expect(box()).toHaveAttribute('readonly')
  })

  it('reloaded while the interviewer was speaking: waits for the saved question', async () => {
    const s = db.sessionRow('s-active')!
    db.addItem(s, answerItem('a-before-reload', 'Trả lời trước khi tải lại'))
    // Still being generated on the server: not in the transcript yet.
    db.addItem(s, nextQuestion, Date.now() + 60_000)
    renderRoute('/sessions/s-active/interview')

    expect(await screen.findByText('Đang lấy lại câu hỏi của người phỏng vấn…')).toBeVisible()
    expect(box()).toHaveAttribute('readonly')

    db.revealItem(s, nextQuestion.id)
    expect(await conversation().findByText(nextQuestion.text, {}, { timeout: 3000 })).toHaveClass(
      'text-ink',
    )
    expect(screen.queryByText('Đang lấy lại câu hỏi của người phỏng vấn…')).toBeNull()
    await waitFor(() => expect(box()).not.toHaveAttribute('readonly'))
  })

  it('offline: says it is reconnecting, keeps the answer, resyncs when back', async () => {
    renderRoute('/sessions/s-active/interview')
    await waitFor(() => expect(box()).not.toHaveAttribute('readonly'))
    db.setMockFlags({ network: true })
    await userEvent.type(box(), 'Chưa gửi được')
    await userEvent.click(screen.getByRole('button', { name: 'Gửi' }))

    expect(await screen.findByText('Đang kết nối lại…')).toBeVisible()
    expect(box()).toHaveValue('Chưa gửi được')
    expect(box()).not.toHaveAttribute('readonly')
    expect(screen.getByRole('button', { name: 'Gửi' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Gợi ý' })).toBeDisabled()
    // A failed probe keeps the banner.
    act(() => window.dispatchEvent(new Event('online')))
    expect(screen.getByText('Đang kết nối lại…')).toBeVisible()

    db.setMockFlags({ network: false })
    act(() => window.dispatchEvent(new Event('online')))
    expect(await screen.findByText('Đã kết nối lại')).toBeVisible()
    expect(screen.queryByText('Đang kết nối lại…')).toBeNull()
    expect(box()).toHaveValue('Chưa gửi được')
    expect(screen.getByRole('button', { name: 'Gửi' })).toBeEnabled()
  })

  it('an answer the server saved before the connection dropped is not left to send twice', async () => {
    renderRoute('/sessions/s-active/interview')
    await waitFor(() => expect(box()).not.toHaveAttribute('readonly'))
    const s = db.sessionRow('s-active')!
    server.use(
      http.post('/api/sessions/:id/turns', async ({ request }) => {
        const { text } = (await request.json()) as { text: string }
        db.addItem(s, answerItem('a-lost', text))
        db.addItem(s, nextQuestion)
        return HttpResponse.error()
      }),
    )
    await userEvent.type(box(), 'Đã tới máy chủ')
    await userEvent.click(screen.getByRole('button', { name: 'Gửi' }))
    await screen.findByText('Đang kết nối lại…')
    expect(box()).toHaveValue('Đã tới máy chủ')

    act(() => window.dispatchEvent(new Event('online')))
    await screen.findByText('Đã kết nối lại')
    expect(await conversation().findByText(nextQuestion.text)).toBeInTheDocument()
    expect(box()).toHaveValue('')
  })

  it('drops the draft when the session ends', async () => {
    renderRoute('/sessions/s-active/interview')
    await waitFor(() => expect(box()).not.toHaveAttribute('readonly'))
    await userEvent.type(box(), 'bỏ dở')
    await userEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Dừng' }))
    await userEvent.click(screen.getByRole('button', { name: 'Dừng phỏng vấn' }))
    await screen.findByRole('region', { name: /Buổi phỏng vấn đã kết thúc/ })
    expect(localStorage.getItem(draftKey)).toBeNull()
  })
})

describe('useAwaitReply', () => {
  afterEach(() => vi.useRealTimers())

  it('polls until the line arrives, gives up after a while, and retries on demand', () => {
    vi.useFakeTimers()
    const refetch = vi.fn(() => Promise.resolve())
    const { result, rerender } = renderHook(({ waiting }) => useAwaitReply(waiting, refetch), {
      initialProps: { waiting: true },
    })
    act(() => vi.advanceTimersByTime(AWAIT_POLL_MS * 3))
    expect(refetch).toHaveBeenCalledTimes(3)
    expect(result.current.active).toBe(true)

    act(() => vi.advanceTimersByTime(AWAIT_GIVE_UP_MS))
    expect(result.current).toMatchObject({ active: false, timedOut: true })
    const calls = refetch.mock.calls.length
    act(() => vi.advanceTimersByTime(AWAIT_POLL_MS * 5))
    expect(refetch).toHaveBeenCalledTimes(calls)

    act(() => result.current.retry())
    expect(result.current).toMatchObject({ active: true, timedOut: false })

    rerender({ waiting: false })
    expect(result.current).toMatchObject({ active: false, timedOut: false })
  })
})

import type { AnswerItem, EventItem, QuestionItem, StreamEvent } from '@/api/types'
import { emptyLive, liveReducer, mergeItems, toRows } from './conversation-state'

const question = (id: string, text = `Câu ${id}`): QuestionItem => ({
  kind: 'question',
  id,
  index: 1,
  text,
  competency: { id: 'API_DESIGN', name: 'Thiết kế API' },
  depth: 'L3',
  unplanned: false,
  created_at: '2026-10-12T00:00:00Z',
})

const answer = (id: string, text: string, edited: string | null = null): AnswerItem => ({
  kind: 'answer',
  id,
  question_id: 'q1',
  text_original: text,
  text_edited: edited,
  source: 'text',
  has_audio: false,
  duration_ms: null,
  created_at: '2026-10-12T00:00:00Z',
})

const event = (id: string, type: EventItem['type'], text: string | null = null): EventItem => ({
  kind: 'event',
  id,
  question_id: 'q1',
  type,
  hint_level: type === 'HINT' ? 1 : null,
  text,
  created_at: '2026-10-12T00:00:00Z',
})

const run = (events: StreamEvent[]) => events.reduce(liveReducer, emptyLive)

describe('liveReducer', () => {
  it('builds a streaming line from tokens, then keeps the saved item', () => {
    const streaming = run([
      { event: 'message_start', data: { item_id: 'q2', kind: 'question' } },
      { event: 'token', data: { text: 'Bạn ' } },
      { event: 'token', data: { text: 'kể đi.' } },
    ])
    expect(streaming.pending).toEqual({
      itemId: 'q2',
      kind: 'question',
      eventType: undefined,
      text: 'Bạn kể đi.',
    })

    const done = liveReducer(streaming, { event: 'message_done', data: { item: question('q2') } })
    expect(done).toEqual({ ...emptyLive, items: [question('q2')] })
  })

  it('replaces a user item with the same id instead of adding it twice', () => {
    const s = run([
      { event: 'user_item', data: { item: answer('a1', 'tạm') } },
      { event: 'user_item', data: { item: answer('a1', 'đã lưu') } },
    ])
    expect(s.items).toEqual([answer('a1', 'đã lưu')])
  })

  it('drops the half line when the stream fails', () => {
    const started = run([
      { event: 'message_start', data: { item_id: 'q2', kind: 'question' } },
      { event: 'token', data: { text: 'Bạn ' } },
    ])
    expect(
      liveReducer(started, { event: 'error', data: { code: 'llm_error', message: '' } }).pending,
    ).toBeNull()
    expect(liveReducer(started, { event: 'stream_broken' }).pending).toBeNull()
  })
})

describe('mergeItems', () => {
  it('keeps the saved order and adds only live items it does not have', () => {
    expect(
      mergeItems([question('q1'), answer('a1', 'x')], [answer('a1', 'x'), question('q2')]).map(
        (i) => i.id,
      ),
    ).toEqual(['q1', 'a1', 'q2'])
  })
})

describe('toRows', () => {
  it('marks only the last interviewer line as current', () => {
    const rows = toRows([question('q1'), answer('a1', 'Trả lời'), question('q2')], null)
    expect(rows.map((r) => r.type === 'ai' && r.current)).toEqual([false, false, true])
  })

  it('shows the edited answer when there is one', () => {
    expect(toRows([answer('a1', 'ừm gốc', 'đã sửa')], null)).toEqual([
      { type: 'answer', key: 'a1', text: 'đã sửa' },
    ])
  })

  it('shows events as notes, with what the interviewer said for repeat / clarify / hint', () => {
    const rows = toRows(
      [question('q1'), event('e1', 'HINT', 'Thử nghĩ về idempotency.'), event('e2', 'SKIP')],
      null,
    )
    expect(rows).toEqual([
      expect.objectContaining({ type: 'ai', key: 'q1', current: false }),
      { type: 'note', key: 'e1-note', text: 'Bạn xin gợi ý', tone: 'amber' },
      expect.objectContaining({
        type: 'ai',
        key: 'e1',
        text: 'Thử nghĩ về idempotency.',
        current: true,
      }),
      { type: 'note', key: 'e2-note', text: 'Bạn đã bỏ qua câu này', tone: 'amber' },
    ])
  })

  it('appends the streaming line, with its note when it answers an event', () => {
    const rows = toRows([question('q1')], {
      itemId: 'e1',
      kind: 'event',
      eventType: 'CLARIFY',
      text: 'Ý mình là',
    })
    expect(rows.slice(1)).toEqual([
      { type: 'note', key: 'e1-note', text: 'Bạn xin giải thích thêm', tone: 'amber' },
      { type: 'ai', key: 'e1', text: 'Ý mình là', streaming: true, current: true },
    ])
  })

  it('never shows competency or depth', () => {
    expect(JSON.stringify(toRows([question('q1')], null))).not.toMatch(/Thiết kế API|L3/)
  })
})

describe('liveReducer: progress and end (UI-6.4)', () => {
  const summary = { question_count: 3, duration_seconds: 600, assessed: [], not_assessed: [] }

  it('keeps the latest progress', () => {
    const s = liveReducer(emptyLive, { event: 'progress', data: { asked: 2, planned: 8 } })
    expect(s.progress).toEqual({ asked: 2, planned: 8 })
  })

  it('ending drops the half line and ignores later tokens', () => {
    let s = liveReducer(emptyLive, {
      event: 'message_start',
      data: { item_id: 'q9', kind: 'question' },
    })
    s = liveReducer(s, { event: 'stopped', data: summary })
    expect(s.pending).toBeNull()
    expect(s.ended).toEqual(summary)
    s = liveReducer(s, { event: 'message_start', data: { item_id: 'q10', kind: 'question' } })
    s = liveReducer(s, { event: 'token', data: { text: 'x' } })
    expect(s.pending).toBeNull()
  })

  it('keeps the first summary', () => {
    let s = liveReducer(emptyLive, { event: 'session_ended', data: summary })
    s = liveReducer(s, { event: 'stopped', data: { ...summary, question_count: 9 } })
    expect(s.ended!.question_count).toBe(3)
  })
})

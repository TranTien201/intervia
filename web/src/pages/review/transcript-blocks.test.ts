import type { AnswerItem, EventItem, EventType, QuestionItem } from '@/api/types'
import { toBlocks } from './transcript-blocks'

const at = '2026-10-10T09:00:00Z'
const question = (id: string, index: number): QuestionItem => ({
  kind: 'question',
  id,
  index,
  text: `Câu ${index}?`,
  competency: null,
  depth: null,
  unplanned: false,
  created_at: at,
})
const answer = (id: string, question_id: string): AnswerItem => ({
  kind: 'answer',
  id,
  question_id,
  text_original: 'Trả lời',
  text_edited: null,
  source: 'text',
  has_audio: false,
  duration_ms: null,
  created_at: at,
})
const event = (
  id: string,
  type: EventType,
  question_id: string | null,
  extra: Partial<EventItem> = {},
): EventItem => ({
  kind: 'event',
  id,
  question_id,
  type,
  hint_level: null,
  text: null,
  created_at: at,
  ...extra,
})

describe('toBlocks', () => {
  it('groups answers and events under their question', () => {
    const blocks = toBlocks([
      question('q1', 1),
      event('e1', 'REPEAT', 'q1'),
      answer('a1', 'q1'),
      question('q2', 2),
      event('e2', 'HINT', 'q2', { hint_level: 2, text: 'Gợi ý' }),
      answer('a2', 'q2'),
    ])
    expect(blocks.map((b) => [b.question.id, b.answers.map((a) => a.id), b.outcome])).toEqual([
      ['q1', ['a1'], 'answered'],
      ['q2', ['a2'], 'answered'],
    ])
    expect(blocks[0]!.notes).toEqual([{ id: 'e1', text: 'Nhắc lại câu hỏi', tone: 'amber' }])
    expect(blocks[1]!.notes).toEqual([{ id: 'e2', text: 'Xin gợi ý mức 2', tone: 'amber' }])
  })

  it('marks skipped and unanswered questions, a skip is not a note', () => {
    const blocks = toBlocks([
      question('q1', 1),
      event('e1', 'SKIP', 'q1'),
      question('q2', 2),
      event('e2', 'STOP', 'q2'),
    ])
    expect(blocks.map((b) => b.outcome)).toEqual(['skipped', 'unanswered'])
    expect(blocks[0]!.notes).toEqual([])
    expect(blocks[1]!.notes).toEqual([{ id: 'e2', text: 'Dừng phiên ở câu này', tone: 'muted' }])
  })

  it('attaches items without a known question to the one before, drops leading ones', () => {
    const blocks = toBlocks([
      event('e0', 'MODE_CHANGE', null, { text: 'voice_text' }),
      question('q1', 1),
      event('e1', 'MODE_CHANGE', null, { text: 'voice_voice' }),
      answer('a1', 'q-unknown'),
    ])
    expect(blocks).toHaveLength(1)
    expect(blocks[0]!.answers.map((a) => a.id)).toEqual(['a1'])
    expect(blocks[0]!.notes).toEqual([
      { id: 'e1', text: 'Đổi sang chế độ Nói → Nói', tone: 'muted' },
    ])
  })
})

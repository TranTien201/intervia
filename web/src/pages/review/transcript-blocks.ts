import type { AnswerItem, EventItem, Mode, QuestionItem, TranscriptItem } from '@/api/types'
import { MODE_LABEL } from '@/lib/format'

/** Anchor of a question on page 6, for the jump list (UI-7.3). */
export const questionAnchor = (index: number) => `cau-${index}`

/**
 * One question with what happened under it. `outcome`:
 * - `answered`: has at least one answer.
 * - `skipped`: the candidate skipped it (shown as "Đã bỏ qua", never as an empty answer).
 * - `unanswered`: the session ended before an answer (stopped, question limit).
 */
export interface QuestionBlock {
  question: QuestionItem
  answers: AnswerItem[]
  notes: EventNote[]
  outcome: 'answered' | 'skipped' | 'unanswered'
}

/** A small note under the answer. Amber: something the candidate asked for. Muted: bookkeeping. */
export interface EventNote {
  id: string
  text: string
  tone: 'amber' | 'muted'
}

/**
 * Group the flat transcript by question. Answers and events attach to their `question_id`;
 * one without (or with an unknown id) goes to the question before it. Anything before the
 * first question is dropped: there is nothing to read it against.
 */
export function toBlocks(items: TranscriptItem[]): QuestionBlock[] {
  const blocks: QuestionBlock[] = []
  const byId = new Map<string, QuestionBlock>()
  for (const item of items) {
    if (item.kind === 'question') {
      const block: QuestionBlock = { question: item, answers: [], notes: [], outcome: 'unanswered' }
      blocks.push(block)
      byId.set(item.id, block)
      continue
    }
    const block = (item.question_id && byId.get(item.question_id)) || blocks.at(-1)
    if (!block) continue
    if (item.kind === 'answer') {
      block.answers.push(item)
      block.outcome = 'answered'
    } else if (item.type === 'SKIP') {
      if (block.outcome !== 'answered') block.outcome = 'skipped'
    } else {
      block.notes.push(eventNote(item))
    }
  }
  return blocks
}

const AMBER_NOTE: Partial<Record<EventItem['type'], string>> = {
  REPEAT: 'Nhắc lại câu hỏi',
  CLARIFY: 'Xin giải thích thêm',
  THINKING: 'Xin thêm thời gian suy nghĩ',
  OFF_TOPIC: 'Có lượt nói ngoài nội dung phỏng vấn',
}

function eventNote(e: EventItem): EventNote {
  const note = (text: string, tone: EventNote['tone'] = 'amber') => ({ id: e.id, text, tone })
  switch (e.type) {
    case 'HINT':
      return note(e.hint_level ? `Xin gợi ý mức ${e.hint_level}` : 'Xin gợi ý')
    case 'MODE_CHANGE': {
      // The event text holds the new mode.
      const mode = MODE_LABEL[e.text as Mode] as string | undefined
      return note(mode ? `Đổi sang chế độ ${mode}` : 'Đổi chế độ', 'muted')
    }
    case 'STOP':
      return note('Dừng phiên ở câu này', 'muted')
    default:
      return note(AMBER_NOTE[e.type] ?? e.type)
  }
}

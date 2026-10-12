import type {
  EventItem,
  EventType,
  SessionEndSummary,
  SessionSummary,
  StreamEvent,
  TranscriptItem,
} from '@/api/types'

/** An interviewer line that is still streaming (between `message_start` and `message_done`). */
export interface PendingMessage {
  itemId: string
  kind: 'question' | 'event'
  eventType?: EventType
  text: string
}

/**
 * What the streams of this page added on top of the saved transcript: items saved since the
 * transcript was loaded, the line being streamed now, the latest progress and, once the
 * session is over, its summary.
 */
export interface LiveConversation {
  items: TranscriptItem[]
  pending: PendingMessage | null
  progress: SessionSummary['progress'] | null
  ended: SessionEndSummary | null
}

/**
 * `stream_broken`: the connection dropped mid-stream (no `error` event).
 * `stopped`: the candidate stopped the session (`POST …/stop` answered with the summary).
 */
export type ConversationAction =
  StreamEvent | { event: 'stream_broken' } | { event: 'stopped'; data: SessionEndSummary }

export const emptyLive: LiveConversation = { items: [], pending: null, progress: null, ended: null }

const upsert = (items: TranscriptItem[], item: TranscriptItem) =>
  items.some((i) => i.id === item.id)
    ? items.map((i) => (i.id === item.id ? item : i))
    : [...items, item]

export function liveReducer(state: LiveConversation, action: ConversationAction): LiveConversation {
  // Over: a stream still running (e.g. the first question from page 4) adds nothing more.
  if (state.ended && (action.event === 'message_start' || action.event === 'token')) return state
  switch (action.event) {
    case 'message_start':
      return {
        ...state,
        pending: {
          itemId: action.data.item_id,
          kind: action.data.kind,
          eventType: action.data.event_type,
          text: '',
        },
      }
    case 'token':
      return state.pending
        ? { ...state, pending: { ...state.pending, text: state.pending.text + action.data.text } }
        : state
    case 'message_done':
      return { ...state, items: upsert(state.items, action.data.item), pending: null }
    case 'user_item':
      return { ...state, items: upsert(state.items, action.data.item) }
    // Never show half a line: the page reloads the transcript, which has the full saved line.
    case 'error':
    case 'stream_broken':
      return { ...state, pending: null }
    case 'progress':
      return { ...state, progress: action.data }
    // Stopped mid-line: the half line goes, the page reloads the transcript (STOP note).
    case 'session_ended':
    case 'stopped':
      return { ...state, pending: null, ended: state.ended ?? action.data }
  }
}

/** Saved transcript first, then live items it does not have yet (by id). */
export function mergeItems(saved: TranscriptItem[], live: TranscriptItem[]): TranscriptItem[] {
  const ids = new Set(saved.map((i) => i.id))
  return [...saved, ...live.filter((i) => !ids.has(i.id))]
}

/**
 * The interviewer still owes a line: nothing asked yet, or the last thing the candidate did
 * (an answer, a skip) has no reply saved. Happens when the page reloads or the connection
 * drops while the line is generated; the server saves it in full, the page fetches it again.
 * A mode change is not a turn, so it is looked through.
 */
export function owesReply(items: TranscriptItem[]): boolean {
  const last = items.findLast((i) => !(i.kind === 'event' && i.type === 'MODE_CHANGE'))
  if (!last) return true
  return last.kind === 'answer' || (last.kind === 'event' && last.type === 'SKIP')
}

// ---- What the page shows ----

export type ConversationRow =
  | { type: 'ai'; key: string; text: string; streaming: boolean; current: boolean }
  | { type: 'answer'; key: string; text: string }
  | { type: 'note'; key: string; text: string; tone: 'amber' | 'muted' }

/**
 * A short note for an event between turns. Hint levels are left out here: they matter on the
 * review page, and a streaming hint does not know its level yet.
 */
const EVENT_NOTE: Record<EventType, { text: string; tone: 'amber' | 'muted' }> = {
  REPEAT: { text: 'Bạn xin nhắc lại câu hỏi', tone: 'amber' },
  CLARIFY: { text: 'Bạn xin giải thích thêm', tone: 'amber' },
  HINT: { text: 'Bạn xin gợi ý', tone: 'amber' },
  SKIP: { text: 'Bạn đã bỏ qua câu này', tone: 'amber' },
  THINKING: { text: 'Bạn xin thêm thời gian suy nghĩ', tone: 'amber' },
  OFF_TOPIC: { text: 'Lượt nói ngoài nội dung phỏng vấn', tone: 'amber' },
  MODE_CHANGE: { text: 'Đã đổi chế độ', tone: 'muted' },
  STOP: { text: 'Bạn đã dừng phiên', tone: 'muted' },
}

const note = (key: string, type: EventType): ConversationRow => ({
  type: 'note',
  key,
  ...EVENT_NOTE[type],
})

/**
 * Turn transcript items into rows. Competency, depth and anything score-like are never shown
 * during the interview. An event with text (repeat, clarify, hint) is a note followed by what
 * the interviewer said. The last interviewer line is the current one (shown large).
 */
export function toRows(items: TranscriptItem[], pending: PendingMessage | null): ConversationRow[] {
  const rows: ConversationRow[] = []
  for (const item of items) {
    if (item.kind === 'question') {
      rows.push({ type: 'ai', key: item.id, text: item.text, streaming: false, current: false })
    } else if (item.kind === 'answer') {
      rows.push({ type: 'answer', key: item.id, text: item.text_edited ?? item.text_original })
    } else {
      rows.push(note(`${item.id}-note`, item.type))
      if (hasSpokenText(item)) {
        rows.push({ type: 'ai', key: item.id, text: item.text, streaming: false, current: false })
      }
    }
  }
  if (pending && !items.some((i) => i.id === pending.itemId)) {
    if (pending.kind === 'event' && pending.eventType) {
      rows.push(note(`${pending.itemId}-note`, pending.eventType))
    }
    rows.push({
      type: 'ai',
      key: pending.itemId,
      text: pending.text,
      streaming: true,
      current: false,
    })
  }
  const last = rows.findLastIndex((r) => r.type === 'ai')
  if (last !== -1)
    rows[last] = { ...(rows[last] as Extract<ConversationRow, { type: 'ai' }>), current: true }
  return rows
}

const SPOKEN_EVENTS: ReadonlySet<EventType> = new Set(['REPEAT', 'CLARIFY', 'HINT'])

const hasSpokenText = (item: EventItem): item is EventItem & { text: string } =>
  SPOKEN_EVENTS.has(item.type) && !!item.text

// ---- Code in answers ----

export const FENCE = '```'

/**
 * What is sent: in code mode the answer is wrapped in a fence so the conversation shows it as
 * code (unless the candidate already wrote fences). Whitespace is kept as typed.
 */
export function answerToSend(text: string, code: boolean): string {
  const body = text.replace(/^\n+|\s+$/g, '')
  return code && !body.includes(FENCE) ? `${FENCE}\n${body}\n${FENCE}` : body
}

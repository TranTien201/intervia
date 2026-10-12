import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Navigate, useParams } from 'react-router'
import { request } from '@/api/client'
import { useSession, useStopSession } from '@/api/hooks'
import { qk } from '@/api/keys'
import type { Mode, SessionSummary, Transcript } from '@/api/types'
import { Banner } from '@/components/Banner'
import { InlineConfirm } from '@/components/InlineConfirm'
import { ErrorState, PageSkeleton } from '@/components/PageStates'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { sessionPath } from '@/features/sessions/session-nav'
import { errorMessage } from '@/lib/errors'
import { Conversation } from './Conversation'
import { InterviewTopBar } from './InterviewTopBar'
import { SessionEndBlock } from './SessionEndBlock'
import { TextComposer } from './TextComposer'
import { useAnswerDraft } from './use-answer-draft'
import { useAwaitReply } from './use-await-reply'
import { useConnection } from './use-connection'
import { useConversation } from './use-conversation'
import { useFollowLatest } from './use-follow-latest'
import { useTurns } from './use-turns'

/** Voice modes unlock in UI-9. */
const AVAILABLE_MODES: readonly Mode[] = ['text']

/** A notice at the top of the conversation column (offline, session restored, mic failed). */
export interface InterviewNotice {
  id: string
  variant: 'info' | 'warning' | 'error'
  title: string
  text?: ReactNode
  action?: ReactNode
  dismissible?: boolean
}

/** How long "Đã kết nối lại" stays. */
const RECONNECTED_MS = 4000

/**
 * [5] Interview. Fullscreen (no sidebar): top bar, conversation column (max 760px, centered)
 * with its banner area, bottom bar (Text: `TextComposer`; once over: `SessionEndBlock`).
 * Opened for a session not started yet → its step (page 3 or 4); already over → page 6. Recovery (UI-6.5):
 * a reload rebuilds the conversation from the transcript; a line the interviewer still owes is
 * fetched again; offline, a banner says it is reconnecting and the typed answer is kept.
 */
export function InterviewPage() {
  const { id = '' } = useParams()
  // Another session id is another conversation: start from a clean state.
  return <InterviewScreen key={id} id={id} />
}

function InterviewScreen({ id }: { id: string }) {
  const qc = useQueryClient()
  const session = useSession(id)
  const conversation = useConversation(id)
  const draft = useAnswerDraft(id)
  const [notices, setNotices] = useState<InterviewNotice[]>([])
  const addNotice = useCallback(
    (n: InterviewNotice) => setNotices((ns) => [...ns.filter((x) => x.id !== n.id), n]),
    [],
  )
  const dropNotice = useCallback(
    (nid: string) => setNotices((ns) => ns.filter((n) => n.id !== nid)),
    [],
  )

  const connection = useConnection(
    () => request<SessionSummary>(`/sessions/${id}`),
    () => void resync(),
  )
  const turns = useTurns(id, conversation.apply, connection.report)

  /** Back online: refresh the session and transcript, then settle the answer lost on the way. */
  const resync = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: qk.session(id), exact: true }),
      qc.invalidateQueries({ queryKey: qk.transcript(id) }),
    ])
    // Sent, then the connection dropped before the server confirmed: if it was saved after
    // all, it is in the conversation now and must not stay in the box to be sent twice.
    const lost = turns.unconfirmed
    const lastAnswer = qc
      .getQueryData<Transcript>(qk.transcript(id))
      ?.items.findLast((i) => i.kind === 'answer')
    if (lost && lastAnswer?.text_original === lost) draft.clear()
    turns.settle()
    addNotice({ id: 'reconnected', variant: 'info', title: 'Đã kết nối lại', dismissible: true })
  }

  useEffect(() => {
    if (!notices.some((n) => n.id === 'reconnected')) return
    const t = setTimeout(() => dropNotice('reconnected'), RECONNECTED_MS)
    return () => clearTimeout(t)
  }, [notices, dropNotice])

  // A failed transcript refresh (polling, resync after a broken stream) also means offline.
  const { report } = connection
  useEffect(() => report(conversation.syncError ?? null), [conversation.syncError, report])

  const isActive = session.data?.status === 'in_progress'
  const awaiting = useAwaitReply(
    isActive && conversation.awaitingReply && !turns.busy && !connection.offline,
    conversation.retry,
  )
  const lastRow = conversation.rows.at(-1)
  const { hasNew, jump } = useFollowLatest(
    `${conversation.rows.length}:${lastRow?.type === 'ai' ? lastRow.text.length : 0}`,
  )
  // Until UI-9 every session runs in Text, whatever mode page 4 picked.
  const [mode, setMode] = useState<Mode>('text')
  const [confirmStop, setConfirmStop] = useState(false)
  const stop = useStopSession()
  const ended = conversation.ended

  // Over: nothing left to send, the draft goes (it is the candidate's text, PII), and
  // "session restored" no longer matters.
  const clearDraft = draft.clear
  useEffect(() => {
    if (!ended) return
    clearDraft()
    dropNotice('restored')
  }, [ended, clearDraft, dropNotice])

  // Opened again (reload, link, sidebar) rather than just started from page 4.
  const restoredHere = !conversation.fromStart && isActive && !conversation.loading
  const draftRestored = draft.restored
  useEffect(() => {
    if (!restoredHere) return
    addNotice({
      id: 'restored',
      variant: 'info',
      title: 'Đã khôi phục phiên',
      text: `Hội thoại được lấy lại từ lần lưu gần nhất.${
        draftRestored ? ' Câu trả lời bạn đang gõ dở vẫn còn trong ô nhập.' : ''
      }`,
      dismissible: true,
    })
    // Once per visit: later changes (e.g. sending the draft) do not bring it back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoredHere])

  const doStop = () =>
    stop.mutate(id, {
      onError: connection.report,
      onSuccess: (summary) => {
        // A line still streaming is dropped; the transcript reload brings the saved one.
        turns.cancel()
        conversation.apply({ event: 'stopped', data: summary })
        setConfirmStop(false)
      },
    })

  // Errors (gone, server down) are shown by SessionGate.
  if (!session.data) return <InterviewSkeleton />
  // Not started (and not just started by page 4): the step it is at (match or plan). Already
  // over before this page opened: the review page. Ending here keeps the summary block instead.
  if (session.data.status === 'draft' && !conversation.fromStart)
    return <Navigate to={sessionPath(session.data)} replace />
  if (session.data.status === 'completed' && !conversation.endedHere)
    return <Navigate to={`/sessions/${id}/review`} replace />

  const shownNotices: InterviewNotice[] = [
    ...(connection.offline
      ? [
          {
            id: 'offline',
            variant: 'warning' as const,
            title: 'Đang kết nối lại…',
            text: 'Mất kết nối tới máy chủ. Bạn vẫn gõ được, câu trả lời được giữ lại và gửi được khi có mạng.',
          },
        ]
      : []),
    ...(awaiting.timedOut
      ? [
          {
            id: 'reply-timeout',
            variant: 'error' as const,
            title: 'Chưa lấy lại được câu hỏi tiếp theo',
            text: 'Người phỏng vấn chưa trả lời xong lượt trước. Bạn thử lại, hoặc dừng phiên.',
            action: (
              <Button variant="secondary" size="sm" onClick={awaiting.retry}>
                Thử lại
              </Button>
            ),
          },
        ]
      : []),
    ...notices.filter((n) => !(n.id === 'reconnected' && connection.offline)),
  ]

  return (
    <>
      <InterviewTopBar
        session={session.data}
        progress={conversation.progress ?? session.data.progress}
        mode={mode}
        onModeChange={setMode}
        availableModes={AVAILABLE_MODES}
        ended={!!ended}
        onStop={() => {
          stop.reset()
          setConfirmStop(true)
        }}
      />
      <main className="flex flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-[760px] flex-1 flex-col px-4 py-6">
          <NoticeArea notices={shownNotices} onDismiss={dropNotice} />
          <section aria-label="Hội thoại" className="flex-1">
            {conversation.loading ? (
              <PageSkeleton variant="transcript" rows={2} />
            ) : conversation.error ? (
              <ErrorState error={conversation.error} onRetry={() => void conversation.retry()} />
            ) : (
              <Conversation rows={conversation.rows} streaming={conversation.streaming} />
            )}
            {awaiting.active && (
              <p role="status" className="mt-6 text-sm text-ink2">
                Đang lấy lại câu hỏi của người phỏng vấn…
              </p>
            )}
          </section>
        </div>
      </main>
      <footer className="sticky bottom-0 border-t border-line bg-surface">
        {hasNew && (
          <Button
            variant="secondary"
            size="sm"
            onClick={jump}
            className="absolute -top-12 left-1/2 -translate-x-1/2 shadow-card"
          >
            ↓ Mới nhất
          </Button>
        )}
        <div className="mx-auto grid w-full max-w-[760px] gap-3 px-4 py-3">
          {ended ? (
            <SessionEndBlock sessionId={id} summary={ended} />
          ) : (
            <>
              {confirmStop && (
                <InlineConfirm
                  tone="default"
                  title="Dừng ở đây?"
                  description={
                    <>
                      Các câu đã trả lời vẫn được lưu. Phiên sẽ kết thúc, không tiếp tục được.
                      {stop.isError && (
                        <span role="alert" className="mt-1 block text-danger">
                          {errorMessage(stop.error)}
                        </span>
                      )}
                    </>
                  }
                  confirmLabel="Dừng phỏng vấn"
                  cancelLabel="Tiếp tục"
                  pending={stop.isPending}
                  onConfirm={doStop}
                  onCancel={() => setConfirmStop(false)}
                />
              )}
              {/* Stays mounted under the confirm box: cancelling keeps what was typed. */}
              <TextComposer
                draft={draft}
                locked={
                  turns.busy ||
                  conversation.streaming ||
                  conversation.loading ||
                  conversation.awaitingReply ||
                  conversation.rows.length === 0
                }
                offline={connection.offline}
                error={turns.error}
                onSend={turns.sendAnswer}
                onQuickEvent={(type) => void turns.sendEvent(type)}
              />
            </>
          )}
        </div>
      </footer>
    </>
  )
}

function NoticeArea({
  notices,
  onDismiss,
}: {
  notices: InterviewNotice[]
  onDismiss: (id: string) => void
}) {
  if (notices.length === 0) return null
  return (
    <div className="mb-6 grid gap-2">
      {notices.map((n) => (
        <Banner
          key={n.id}
          variant={n.variant}
          title={n.title}
          action={n.action}
          onDismiss={n.dismissible ? () => onDismiss(n.id) : undefined}
        >
          {n.text}
        </Banner>
      ))}
    </div>
  )
}

function InterviewSkeleton() {
  return (
    <>
      <header className="flex items-center gap-4 border-b border-line bg-surface px-5 py-3">
        <Skeleton className="h-5 w-64" />
        <Skeleton className="ml-auto h-7 w-56" />
      </header>
      <main className="mx-auto w-full max-w-[760px] flex-1 px-4 py-6">
        <PageSkeleton variant="transcript" rows={2} />
      </main>
    </>
  )
}

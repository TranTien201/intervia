import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import * as db from '@/mocks/db'
import { server } from '@/mocks/node'
import { renderRoute } from '@/test/render'

/** The <li> of question N on the review page. */
async function question(n: number) {
  const heading = await screen.findByRole('heading', { name: new RegExp(`^Câu ${n}( ·|$)`) })
  return within(heading.closest('li')!)
}

describe('ReviewPage transcript (UI-7.2)', () => {
  it('shows each question with its heading, question and answer', async () => {
    renderRoute('/sessions/s-done/review')
    const q4 = await question(4)
    expect(q4.getByRole('heading')).toHaveTextContent('Câu 4 · Xử lý lỗi · L3')
    expect(q4.getByText(/idempotency key/)).toBeVisible()
    // Typed answer with code: rendered as a code block.
    const q3 = await question(3)
    expect(q3.getByText(/CREATE INDEX idx_payments_created/).tagName).toBe('CODE')
  })

  it('has an audio player only for spoken answers', async () => {
    renderRoute('/sessions/s-done/review')
    const q4 = await question(4)
    expect(q4.getByRole('button', { name: 'Phát câu trả lời câu 4' })).toBeVisible()
    expect(q4.getByText('0:00 / 0:52')).toBeVisible()
    const q1 = await question(1)
    expect(q1.queryByRole('button', { name: /^Phát/ })).toBeNull()
  })

  it('switches between the STT original and the edit, only when there is an edit', async () => {
    const user = userEvent.setup()
    renderRoute('/sessions/s-done/review')
    const q2 = await question(2)
    expect(q2.getByText(/thì để tùy chọn, không đổi/)).toBeVisible()
    await user.click(q2.getByRole('button', { name: 'Bản STT gốc' }))
    expect(q2.getByText(/thì để tùy chọn, ừm, không đổi/)).toBeVisible()
    expect(q2.getByRole('button', { name: 'Bản STT gốc' })).toHaveAttribute('aria-pressed', 'true')

    const q4 = await question(4)
    expect(q4.queryByRole('group', { name: 'Bản transcript' })).toBeNull()
    expect(q4.getByRole('button', { name: /Sửa transcript/ })).toBeVisible()
    // Typed answers are kept as sent.
    expect((await question(1)).queryByRole('button', { name: /Sửa transcript/ })).toBeNull()
  })

  it('saves an edit and keeps the original', async () => {
    const user = userEvent.setup()
    renderRoute('/sessions/s-done/review')
    const q4 = await question(4)
    await user.click(q4.getByRole('button', { name: /Sửa transcript/ }))
    const box = q4.getByRole('textbox', { name: 'Sửa transcript' })
    await user.clear(box)
    await user.type(box, 'Gửi kèm idempotency key.')
    await user.click(q4.getByRole('button', { name: 'Lưu bản sửa' }))

    await waitFor(() => expect(q4.getByText('Gửi kèm idempotency key.')).toBeVisible())
    expect(q4.getByRole('button', { name: 'Đã sửa' })).toHaveAttribute('aria-pressed', 'true')
    const saved = db.findItem('a4')
    expect(saved).toMatchObject({ text_edited: 'Gửi kèm idempotency key.' })
    expect(saved && 'text_original' in saved && saved.text_original).toMatch(/^Mình sẽ gửi kèm/)
  })

  it('keeps the editor open when saving fails', async () => {
    server.use(
      http.patch('/api/answers/:id', () =>
        HttpResponse.json({ error: { code: 'internal', message: 'boom' } }, { status: 500 }),
      ),
    )
    const user = userEvent.setup()
    renderRoute('/sessions/s-done/review')
    const q4 = await question(4)
    await user.click(q4.getByRole('button', { name: /Sửa transcript/ }))
    await user.type(q4.getByRole('textbox', { name: 'Sửa transcript' }), ' thêm')
    await user.click(q4.getByRole('button', { name: 'Lưu bản sửa' }))
    await waitFor(() => expect(q4.getByRole('button', { name: 'Lưu bản sửa' })).toBeEnabled())
    expect(q4.getByRole<HTMLTextAreaElement>('textbox', { name: 'Sửa transcript' }).value).toMatch(
      / thêm$/,
    )
  })

  it('shows events as notes, skipped and unplanned questions', async () => {
    renderRoute('/sessions/s-done/review')
    expect((await question(2)).getByText('Nhắc lại câu hỏi')).toHaveClass('text-amber')
    expect((await question(4)).getByText('Xin gợi ý mức 1')).toHaveClass('text-amber')

    const q5 = await question(5)
    expect(q5.getByText('Đã bỏ qua')).toBeVisible()
    expect(q5.queryByText('Bạn đã bỏ qua câu này')).toBeNull()

    expect((await question(7)).getByText('Ngoài kế hoạch')).toBeVisible()
    expect((await question(6)).queryByText('Ngoài kế hoạch')).toBeNull()
  })
})

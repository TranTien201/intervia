import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as db from '@/mocks/db'
import { renderRoute } from '@/test/render'

const side = async () =>
  within(await screen.findByRole('complementary', { name: 'Độ phủ và danh sách câu' }))

describe('ReviewPage side column (UI-7.3)', () => {
  it('shows coverage per competency, "Chưa đánh giá" when not asked', async () => {
    const cov = db.coverage(db.sessionRow('s-done')!)
    const asked = cov.find((c) => c.question_count > 0)!
    const notAsked = cov.find((c) => c.question_count === 0)!
    renderRoute('/sessions/s-done/review')

    const meter = await (await side()).findByRole('meter', { name: asked.competency.name })
    expect(meter).toHaveAttribute('aria-valuetext', `${asked.question_count} câu`)
    const row = (await side()).getByText(notAsked.competency.name).closest('li')!
    expect(within(row).getByText('Chưa đánh giá')).toBeInTheDocument()
    expect(within(row).queryByRole('meter')).toBeNull()
  })

  it('jumps to a question and marks it as the one being read', async () => {
    const user = userEvent.setup()
    renderRoute('/sessions/s-done/review')
    const nav = within(await (await side()).findByRole('navigation', { name: 'Nhảy tới câu' }))
    const questions = db.sessionRow('s-done')!.items.filter((i) => i.kind === 'question')
    expect(nav.getAllByRole('link')).toHaveLength(questions.length)
    expect(nav.getByRole('link', { name: 'Câu 1' })).toHaveAttribute('href', '#cau-1')

    await user.click(nav.getByRole('link', { name: 'Câu 3' }))
    expect(nav.getByRole('link', { name: 'Câu 3' })).toHaveAttribute('aria-current', 'location')
    expect(nav.getByRole('link', { name: 'Câu 1' })).not.toHaveAttribute('aria-current')
    // Focus moves to the question, for keyboard and screen reader users.
    expect(document.activeElement).toBe(document.getElementById('cau-3'))
  })

  it('collapses on phones behind a toggle', async () => {
    const user = userEvent.setup()
    renderRoute('/sessions/s-done/review')
    const toggle = await (await side()).findByRole('button', { name: 'Độ phủ và danh sách câu' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    const body = document.getElementById(toggle.getAttribute('aria-controls')!)!
    expect(body).toHaveClass('hidden', 'lg:grid')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(body).not.toHaveClass('hidden')
  })
})

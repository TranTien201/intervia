import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { reset } from '@/mocks/db'
import { renderRoute } from '@/test/render'

const sessionNav = () => screen.getByRole('navigation', { name: 'Danh sách phiên' })

describe('Sidebar session list', () => {
  it('links each session to the page for its step', async () => {
    renderRoute('/library')
    const nav = sessionNav()
    // Seed: completed → review, in progress → interview, draft → match / plan.
    expect(await within(nav).findByRole('link', { name: /AI Engineer · Senior/ })).toHaveAttribute(
      'href',
      '/sessions/s-active/interview',
    )
    expect(within(nav).getByRole('link', { name: /Backend Engineer · Mid/ })).toHaveAttribute(
      'href',
      '/sessions/s-done/review',
    )
    expect(within(nav).getByRole('link', { name: /Backend Engineer · Junior/ })).toHaveAttribute(
      'href',
      '/sessions/s-match/match',
    )
    expect(within(nav).getByText('Cũ hơn')).toBeInTheDocument()
    expect(within(nav).getByText('Đang dở')).toBeInTheDocument() // status dot, screen-reader text
  })

  it('highlights the open session', async () => {
    renderRoute('/sessions/s-match/match')
    const link = await within(sessionNav()).findByRole('link', {
      name: /Backend Engineer · Junior/,
    })
    expect(link).toHaveAttribute('aria-current', 'page')
    expect(
      within(sessionNav()).getByRole('link', { name: /Backend Engineer · Mid/ }),
    ).not.toHaveAttribute('aria-current')
  })

  it('shows an empty message when there are no sessions', async () => {
    reset(true)
    renderRoute('/library')
    expect(await within(sessionNav()).findByText('Chưa có phiên nào')).toBeInTheDocument()
  })

  it('deletes a session after confirming; cancel keeps it', async () => {
    const user = userEvent.setup()
    renderRoute('/library')
    const nav = sessionNav()
    await within(nav).findByRole('link', { name: /Backend Engineer · Junior/ })

    await user.click(
      within(nav).getByRole('button', { name: /Tùy chọn cho phiên Backend Engineer · Junior/ }),
    )
    await user.click(await screen.findByRole('menuitem', { name: 'Xóa phiên và dữ liệu' }))
    await user.click(within(nav).getByRole('button', { name: 'Giữ lại' }))
    expect(within(nav).queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /Backend Engineer · Junior/ })).toBeInTheDocument()

    await user.click(
      within(nav).getByRole('button', { name: /Tùy chọn cho phiên Backend Engineer · Junior/ }),
    )
    await user.click(await screen.findByRole('menuitem', { name: 'Xóa phiên và dữ liệu' }))
    await user.click(within(nav).getByRole('button', { name: 'Xóa phiên' }))
    await within(nav).findByRole('link', { name: /Backend Engineer · Mid/ })
    await expect
      .poll(() => within(nav).queryByRole('link', { name: /Backend Engineer · Junior/ }))
      .toBeNull()
  })

  it('deleting the open session goes back home', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute('/sessions/s-match/match')
    const nav = sessionNav()
    await within(nav).findByRole('link', { name: /Backend Engineer · Junior/ })
    await user.click(
      within(nav).getByRole('button', { name: /Tùy chọn cho phiên Backend Engineer · Junior/ }),
    )
    await user.click(await screen.findByRole('menuitem', { name: 'Xóa phiên và dữ liệu' }))
    await user.click(within(nav).getByRole('button', { name: 'Xóa phiên' }))
    await expect.poll(() => router.state.location.pathname).toBe('/')
  })
})

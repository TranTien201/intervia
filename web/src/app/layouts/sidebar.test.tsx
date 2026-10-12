import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderRoute } from '@/test/render'

// The desktop column; the phone top bar has its own logo link.
const sidebar = () => screen.getByRole('complementary', { name: 'Thanh bên' })

afterEach(() => localStorage.removeItem('intervia.sidebar.collapsed'))

describe('Sidebar (fixed part)', () => {
  it('shows logo, new-session button and library link', async () => {
    renderRoute('/library')
    const aside = sidebar()
    expect(await within(aside).findByRole('link', { name: 'Intervia' })).toHaveAttribute(
      'href',
      '/',
    )
    expect(within(aside).getByRole('link', { name: 'Phiên mới' })).toHaveAttribute(
      'href',
      '/sessions/new',
    )
    const library = within(aside).getByRole('link', { name: 'Thư viện CV & JD' })
    expect(library).toHaveAttribute('href', '/library')
    expect(library).toHaveAttribute('aria-current', 'page')
  })

  it('hides account, progress and roadmap in MVP-1', async () => {
    renderRoute('/')
    await within(sidebar()).findByRole('link', { name: 'Intervia' })
    for (const name of ['Tài khoản', 'Tiến bộ', 'Lộ trình']) {
      expect(screen.queryByRole('link', { name })).not.toBeInTheDocument()
    }
  })

  it('"Phiên mới" navigates to /sessions/new', async () => {
    const { router } = renderRoute('/library')
    await userEvent.click(await within(sidebar()).findByRole('link', { name: 'Phiên mới' }))
    expect(router.state.location.pathname).toBe('/sessions/new')
  })
})

describe('Sidebar collapse (UI-3.3)', () => {
  it('collapses to an icon strip and remembers the choice', async () => {
    const user = userEvent.setup()
    const first = renderRoute('/library')
    await user.click(within(sidebar()).getByRole('button', { name: 'Thu gọn thanh bên' }))

    const aside = sidebar()
    expect(within(aside).queryByRole('navigation', { name: 'Danh sách phiên' })).toBeNull()
    expect(within(aside).queryByRole('link', { name: 'Intervia' })).toBeNull()
    // Icon-only links keep their accessible names.
    expect(within(aside).getByRole('link', { name: 'Phiên mới' })).toHaveAttribute(
      'href',
      '/sessions/new',
    )
    const library = within(aside).getByRole('link', { name: 'Thư viện CV & JD' })
    expect(library).toHaveAttribute('aria-current', 'page')
    expect(library).toHaveClass('bg-accent-soft')

    first.unmount()
    renderRoute('/library')
    const reloaded = sidebar()
    expect(within(reloaded).getByRole('button', { name: 'Mở rộng thanh bên' })).toBeInTheDocument()
    await user.click(within(reloaded).getByRole('button', { name: 'Mở rộng thanh bên' }))
    expect(
      within(sidebar()).getByRole('navigation', { name: 'Danh sách phiên' }),
    ).toBeInTheDocument()
    expect(localStorage.getItem('intervia.sidebar.collapsed')).toBe('0')
  })
})

describe('Phone menu (UI-3.3)', () => {
  it('☰ opens the sidebar as a sheet, following a link closes it', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute('/')
    await user.click(screen.getByRole('button', { name: 'Mở menu' }))

    const sheet = await screen.findByRole('dialog', { name: 'Menu' })
    expect(within(sheet).getByRole('navigation', { name: 'Danh sách phiên' })).toBeInTheDocument()
    await user.click(within(sheet).getByRole('link', { name: 'Thư viện CV & JD' }))

    expect(router.state.location.pathname).toBe('/library')
    expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull()
  })
})

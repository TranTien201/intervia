import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as auth from '@/mocks/auth'
import { setMockFlags } from '@/mocks/db'
import { renderRoute } from '@/test/render'

const { email, password } = auth.SEED_ACCOUNT
const field = (name: string) => screen.getByLabelText(name)

async function fillLogin(user: ReturnType<typeof userEvent.setup>, e: string, p: string) {
  await user.type(await screen.findByLabelText('Email'), e)
  await user.type(field('Mật khẩu'), p)
  await user.click(screen.getByRole('button', { name: 'Đăng nhập' }))
}

describe('Login off (MVP-1 default user)', () => {
  it('opens pages directly and sends /login home', async () => {
    const { router } = renderRoute('/login', { auth: 'fetch' })
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(
      await screen.findByRole('heading', { name: 'Chào bạn, hôm nay luyện phỏng vấn gì?' }),
    ).toBeInTheDocument()
  })
})

describe('Login on (UI-11)', () => {
  beforeEach(() => setMockFlags({ auth: true }))
  afterEach(() => setMockFlags({ auth: false }))

  it('sends a logged-out user to /login, then back to the page they wanted', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute('/library?tab=jd', { auth: 'fetch' })
    expect(await screen.findByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(router.state.location.search).toBe('?next=%2Flibrary%3Ftab%3Djd')
    // No sidebar on the login page.
    expect(screen.queryByRole('navigation', { name: 'Danh sách phiên' })).toBeNull()

    await fillLogin(user, email, password)
    await waitFor(() => expect(router.state.location.pathname).toBe('/library'))
    expect(router.state.location.search).toBe('?tab=jd')
    expect(await screen.findByRole('heading', { name: 'Thư viện' })).toBeInTheDocument()
  })

  it('says only "email or password is wrong", whichever it is', async () => {
    const user = userEvent.setup()
    renderRoute('/login', { auth: 'fetch' })
    await fillLogin(user, email, 'sai-mat-khau-roi')
    expect(await screen.findByRole('alert')).toHaveTextContent('Email hoặc mật khẩu không đúng.')

    await user.clear(field('Email'))
    await user.type(field('Email'), 'chua-dang-ky@example.com')
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Email hoặc mật khẩu không đúng.'),
    )
    // What was typed stays.
    expect(field('Email')).toHaveValue('chua-dang-ky@example.com')
  })

  it('asks to wait after too many wrong passwords', async () => {
    const user = userEvent.setup()
    renderRoute('/login', { auth: 'fetch' })
    for (let i = 0; i < auth.MAX_FAILED_LOGINS; i++) auth.login(email, 'sai')
    await fillLogin(user, email, password)
    expect(await screen.findByRole('alert')).toHaveTextContent('Bạn đã thử sai nhiều lần.')
  })

  it('checks the fields before sending', async () => {
    const user = userEvent.setup()
    renderRoute('/login', { auth: 'fetch' })
    await user.click(await screen.findByRole('button', { name: 'Đăng nhập' }))
    expect(field('Email')).toHaveAccessibleDescription('Nhập email.')
    expect(field('Mật khẩu')).toHaveAccessibleDescription('Nhập mật khẩu.')
    await waitFor(() => expect(field('Email')).toHaveFocus())
    // Login does not enforce the signup rules.
    await user.type(field('Email'), 'ten@')
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }))
    expect(field('Email')).toHaveAccessibleDescription('Email chưa đúng dạng, vd: ten@example.com.')
  })

  it('signs up: at least 10 characters, typed twice, then logged in', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute('/signup', { auth: 'fetch' })
    await user.type(await screen.findByLabelText('Email'), 'Moi@Example.com')
    await user.type(field('Mật khẩu'), 'ngan')
    await user.type(field('Nhập lại mật khẩu'), 'khac')
    await user.click(screen.getByRole('button', { name: 'Đăng ký' }))
    expect(field('Mật khẩu')).toHaveAccessibleDescription('Mật khẩu cần ít nhất 10 ký tự.')
    expect(field('Nhập lại mật khẩu')).toHaveAccessibleDescription('Mật khẩu nhập lại không khớp.')

    await user.clear(field('Mật khẩu'))
    await user.type(field('Mật khẩu'), 'mat-khau-dai-du')
    await user.clear(field('Nhập lại mật khẩu'))
    await user.type(field('Nhập lại mật khẩu'), 'mat-khau-dai-du')
    await user.click(screen.getByRole('button', { name: 'Đăng ký' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(auth.currentUser()?.email).toBe('moi@example.com')
  })

  it('tells a signup with a taken email to log in instead', async () => {
    const user = userEvent.setup()
    renderRoute('/signup', { auth: 'fetch' })
    await user.type(await screen.findByLabelText('Email'), email)
    await user.type(field('Mật khẩu'), 'mat-khau-dai-du')
    await user.type(field('Nhập lại mật khẩu'), 'mat-khau-dai-du')
    await user.click(screen.getByRole('button', { name: 'Đăng ký' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Email này đã có tài khoản. Hãy đăng nhập.',
    )
  })

  it('keeps ?next= when switching between login and signup', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute('/login?next=%2Flibrary', { auth: 'fetch' })
    await user.click(await screen.findByRole('link', { name: 'Đăng ký' }))
    expect(router.state.location.pathname).toBe('/signup')
    expect(router.state.location.search).toBe('?next=%2Flibrary')
    await user.click(screen.getByRole('link', { name: 'Đăng nhập' }))
    expect(router.state.location.pathname).toBe('/login')
    expect(router.state.location.search).toBe('?next=%2Flibrary')
  })

  it('never follows ?next= to another site', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute('/login?next=https%3A%2F%2Fevil.example', { auth: 'fetch' })
    await fillLogin(user, email, password)
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('a logged-in user opening /login goes straight on', async () => {
    auth.login(email, password)
    const { router } = renderRoute('/login?next=%2Flibrary', { auth: 'fetch' })
    await waitFor(() => expect(router.state.location.pathname).toBe('/library'))
  })

  it('goes to /login when the login expires while using the app', async () => {
    auth.login(email, password)
    const { router } = renderRoute('/library', { auth: 'fetch' })
    expect(await screen.findByRole('heading', { name: 'Thư viện' })).toBeInTheDocument()

    auth.logout() // e.g. expired, or logged out in another tab
    await act(() => router.navigate('/library/cv/cv-backend'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(router.state.location.search).toBe('?next=%2Flibrary%2Fcv%2Fcv-backend')
  })
})

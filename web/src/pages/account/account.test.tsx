import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readDraft, writeDraft } from '@/lib/answer-draft'
import * as auth from '@/mocks/auth'
import { accountData, setMockFlags } from '@/mocks/db'
import { renderRoute } from '@/test/render'

const { email, password } = auth.SEED_ACCOUNT
const field = (name: string) => screen.getByLabelText(name)
const sidebar = () => screen.findByRole('complementary', { name: 'Thanh bên' })

describe('Login off (MVP-1 default user)', () => {
  it('has no account page and no sidebar link', async () => {
    renderRoute('/account', { auth: 'fetch' })
    expect(await screen.findByText('Không tìm thấy trang này')).toBeInTheDocument()
    expect(within(await sidebar()).queryByRole('link', { name: 'Tài khoản' })).toBeNull()
  })
})

describe('Account page (UI-11.2)', () => {
  beforeEach(() => {
    setMockFlags({ auth: true })
    auth.login(email, password)
  })
  afterEach(() => setMockFlags({ auth: false }))

  it('is linked from the sidebar and shows the email and the data kept', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute('/library', { auth: 'fetch' })
    await user.click(await within(await sidebar()).findByRole('link', { name: 'Tài khoản' }))
    expect(router.state.location.pathname).toBe('/account')

    expect(await screen.findByRole('heading', { name: 'Tài khoản' })).toBeInTheDocument()
    expect(screen.getByText(email)).toBeInTheDocument()
    const d = accountData()
    expect(d.audio_count).toBeGreaterThan(0)
    expect(
      await screen.findByText(
        new RegExp(
          `^${d.cv_count} CV · ${d.jd_count} JD · ${d.session_count} phiên · ` +
            `${d.audio_count} file ghi âm \\(.+\\)$`,
        ),
      ),
    ).toBeInTheDocument()
  })

  it('changes the password', async () => {
    const user = userEvent.setup()
    renderRoute('/account', { auth: 'fetch' })
    await user.click(await screen.findByRole('button', { name: 'Đổi mật khẩu' }))
    expect(field('Mật khẩu hiện tại')).toHaveFocus()

    // Checked here first: short, typed twice differently.
    await user.type(field('Mật khẩu hiện tại'), password)
    await user.type(field('Mật khẩu mới'), 'ngan')
    await user.type(field('Nhập lại mật khẩu mới'), 'khac')
    await user.click(screen.getByRole('button', { name: 'Lưu mật khẩu mới' }))
    expect(field('Mật khẩu mới')).toHaveAccessibleDescription('Mật khẩu cần ít nhất 10 ký tự.')
    expect(field('Nhập lại mật khẩu mới')).toHaveAccessibleDescription(
      'Mật khẩu nhập lại không khớp.',
    )

    // Wrong current password: the server says so under its field.
    await user.clear(field('Mật khẩu hiện tại'))
    await user.type(field('Mật khẩu hiện tại'), 'khong-phai-mat-khau')
    await user.clear(field('Mật khẩu mới'))
    await user.type(field('Mật khẩu mới'), 'mat-khau-moi-123')
    await user.clear(field('Nhập lại mật khẩu mới'))
    await user.type(field('Nhập lại mật khẩu mới'), 'mat-khau-moi-123')
    await user.click(screen.getByRole('button', { name: 'Lưu mật khẩu mới' }))
    await waitFor(() =>
      expect(field('Mật khẩu hiện tại')).toHaveAccessibleDescription(
        'Mật khẩu hiện tại không đúng.',
      ),
    )

    await user.clear(field('Mật khẩu hiện tại'))
    await user.type(field('Mật khẩu hiện tại'), password)
    await user.click(screen.getByRole('button', { name: 'Lưu mật khẩu mới' }))
    expect(await screen.findByRole('button', { name: 'Đổi mật khẩu' })).toBeInTheDocument()
    auth.logout()
    expect(auth.login(email, password)).toBe('invalid')
    expect(auth.login(email, 'mat-khau-moi-123')).toMatchObject({ email })
  })

  it('logs out: drafts gone, back to /login, nothing cached', async () => {
    const user = userEvent.setup()
    writeDraft('s-active', { text: 'Câu trả lời đang gõ dở', code: false })
    const { router } = renderRoute('/account', { auth: 'fetch' })
    await user.click(await screen.findByRole('button', { name: 'Đăng xuất' }))

    expect(await screen.findByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(router.state.location.search).toBe('')
    expect(auth.currentUser()).toBeNull()
    expect(readDraft('s-active')).toBeNull()

    // Pages need a new login, even ones visited before.
    await router.navigate('/library')
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  })

  it('deletes the account only after the email is typed again', async () => {
    const user = userEvent.setup()
    writeDraft('s-active', { text: 'Câu trả lời đang gõ dở', code: false })
    const { router } = renderRoute('/account', { auth: 'fetch' })
    await user.click(
      await screen.findByRole('button', { name: 'Xóa tài khoản và toàn bộ dữ liệu' }),
    )
    const dialog = screen.getByRole('alertdialog', { name: 'Xóa tài khoản và toàn bộ dữ liệu?' })
    expect(dialog).toHaveTextContent('Không hoàn tác được.')
    expect(within(dialog).getByText(/file ghi âm \(/)).toBeInTheDocument()
    // Focus starts on the safe button.
    expect(within(dialog).getByRole('button', { name: 'Giữ lại' })).toHaveFocus()

    const confirm = within(dialog).getByRole('button', { name: 'Xóa vĩnh viễn' })
    const input = within(dialog).getByLabelText(`Gõ lại email (${email}) để xác nhận`)
    expect(confirm).toBeDisabled()
    await user.type(input, 'nguyenvana@example')
    expect(confirm).toBeDisabled()
    await user.type(input, '.COM') // case does not matter
    expect(confirm).toBeEnabled()

    await user.click(confirm)
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(auth.currentUser()).toBeNull()
    expect(auth.login(email, password)).toBe('invalid')
    expect(accountData()).toMatchObject({ cv_count: 0, jd_count: 0, session_count: 0 })
    expect(readDraft('s-active')).toBeNull()
  })

  it('"Giữ lại" closes the confirmation and keeps everything', async () => {
    const user = userEvent.setup()
    renderRoute('/account', { auth: 'fetch' })
    await user.click(
      await screen.findByRole('button', { name: 'Xóa tài khoản và toàn bộ dữ liệu' }),
    )
    await user.click(screen.getByRole('button', { name: 'Giữ lại' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(auth.currentUser()?.email).toBe(email)
  })
})

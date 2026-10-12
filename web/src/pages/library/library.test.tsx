import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/mocks/node'
import { renderRoute } from '@/test/render'

const main = () => within(screen.getByRole('main'))

describe('LibraryPage', () => {
  it('lists CVs with file, version, date and usage', async () => {
    renderRoute('/library')
    const row = (await main().findByText('CV Backend 2026')).closest('li')!
    expect(row).toHaveTextContent('nguyen-van-a.pdf')
    expect(row).toHaveTextContent(/bản \d+/)
    expect(row).toHaveTextContent(/Dùng trong \d+ phiên/)
    expect(within(row).getByRole('link')).toHaveAttribute('href', '/library/cv/cv-backend')
    expect(main().getByRole('tab', { name: /^CV \(\d+\)$/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('keeps the JD tab in the URL', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute('/library')
    await user.click(await main().findByRole('tab', { name: /^JD/ }))
    expect(router.state.location.search).toBe('?tab=jd')
    const row = (await main().findByText('ABC · Backend')).closest('li')!
    expect(row).toHaveTextContent('Backend Engineer · Công ty ABC')
    expect(row).toHaveTextContent(/\d+ yêu cầu/)
    expect(main().getByRole('button', { name: 'Thêm JD' })).toBeInTheDocument()
  })

  it('opens on the JD tab from ?tab=jd', async () => {
    renderRoute('/library?tab=jd')
    expect(await main().findByText('ABC · Backend')).toBeInTheDocument()
  })

  it('shows the empty state with an upload button', async () => {
    server.use(http.get('/api/cvs', () => HttpResponse.json([])))
    renderRoute('/library')
    expect(
      await main().findByText('Chưa có CV nào. Thêm CV để dùng lại cho nhiều phiên luyện tập.'),
    ).toBeInTheDocument()
    expect(main().getAllByRole('button', { name: 'Tải CV mới' })).toHaveLength(2)
  })

  it('uploads a CV, suggesting the name from the file', async () => {
    // jsdom's File/FormData can't go through Node's fetch, so stub the upload itself.
    let posted = 0
    server.use(
      http.post('/api/cvs', () => {
        posted += 1
        return HttpResponse.json({}, { status: 201 })
      }),
    )
    const user = userEvent.setup()
    renderRoute('/library')
    await user.click(await main().findByRole('button', { name: 'Tải CV mới' }))
    const dialog = await screen.findByRole('dialog', { name: 'Tải CV mới' })
    await user.click(within(dialog).getByRole('button', { name: 'Tải lên' }))
    expect(within(dialog).getByLabelText('Tên CV')).toHaveAccessibleDescription(
      'Đặt tên để dễ tìm lại.',
    )
    expect(within(dialog).getByText('Chọn một file CV.')).toBeInTheDocument()
    expect(posted).toBe(0)

    await user.upload(
      within(dialog).getByLabelText('File CV'),
      new File([new Uint8Array(2048)], 'cv-moi.pdf', { type: 'application/pdf' }),
    )
    expect(within(dialog).getByLabelText('Tên CV')).toHaveValue('cv-moi')
    await user.click(within(dialog).getByRole('button', { name: 'Tải lên' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(posted).toBe(1)
  })

  it('checks the JD form before sending', async () => {
    const user = userEvent.setup()
    renderRoute('/library?tab=jd')
    await user.click(await main().findByRole('button', { name: 'Thêm JD' }))
    const dialog = await screen.findByRole('dialog', { name: 'Thêm JD' })
    await user.click(within(dialog).getByRole('button', { name: 'Thêm JD' }))
    expect(within(dialog).getByLabelText('Nội dung JD')).toHaveAccessibleDescription(
      'Dán nội dung JD.',
    )
    await user.type(
      within(dialog).getByLabelText('Nội dung JD'),
      'Senior Data Engineer{enter}Yêu cầu: Spark',
    )
    expect(within(dialog).getByLabelText('Tên JD')).toHaveValue('Senior Data Engineer')
    await user.click(within(dialog).getByRole('button', { name: 'Thêm JD' }))
    expect(await main().findByText('Senior Data Engineer')).toBeInTheDocument()
  })

  it('renames from the ⋮ menu', async () => {
    const user = userEvent.setup()
    renderRoute('/library')
    await user.click(await main().findByRole('button', { name: 'Tùy chọn cho CV CV Backend 2026' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Đổi tên' }))
    const dialog = await screen.findByRole('dialog', { name: 'Đổi tên CV' })
    const input = within(dialog).getByLabelText('Tên mới')
    await user.clear(input)
    await user.type(input, 'CV Backend mới')
    await user.click(within(dialog).getByRole('button', { name: 'Lưu' }))
    expect(await main().findByText('CV Backend mới')).toBeInTheDocument()
  })

  it('starts a new session with the chosen CV', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute('/library')
    await user.click(await main().findByRole('button', { name: 'Tùy chọn cho CV CV Backend 2026' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Tạo phiên mới với CV này' }))
    expect(router.state.location.pathname).toBe('/sessions/new')
    expect(router.state.location.search).toBe('?cv=cv-backend')
  })

  it('deletes a CV together with its sessions after confirming', async () => {
    const user = userEvent.setup()
    renderRoute('/library')
    const sessionNav = () => screen.getByRole('navigation', { name: 'Danh sách phiên' })
    const row = (await main().findByText('CV Backend 2026')).closest('li')!
    const used = Number(row.textContent!.match(/Dùng trong (\d+) phiên/)![1])
    await waitFor(() => expect(within(sessionNav()).getAllByRole('link').length).toBeGreaterThan(0))
    const before = within(sessionNav()).getAllByRole('link').length

    const openConfirm = async () => {
      await user.click(main().getByRole('button', { name: 'Tùy chọn cho CV CV Backend 2026' }))
      await user.click(await screen.findByRole('menuitem', { name: 'Xóa' }))
      return main().findByRole('alertdialog', { name: 'Xóa CV CV Backend 2026?' })
    }

    // "Giữ lại" closes it and keeps everything.
    let confirm = await openConfirm()
    await user.click(within(confirm).getByRole('button', { name: 'Giữ lại' }))
    expect(main().queryByRole('alertdialog')).toBeNull()
    expect(main().getByText('CV Backend 2026')).toBeInTheDocument()

    confirm = await openConfirm()
    expect(confirm).toHaveTextContent(
      `Xóa CV sẽ xóa luôn ${used} phiên đó, gồm transcript và file ghi âm.`,
    )
    expect(await within(confirm).findAllByRole('listitem')).toHaveLength(
      Math.min(used, 5) + (used > 5 ? 1 : 0),
    )
    // No way to delete the CV but keep its sessions.
    expect(within(confirm).getAllByRole('button')).toHaveLength(2)
    await user.click(within(confirm).getByRole('button', { name: `Xóa CV và ${used} phiên` }))

    await waitFor(() => expect(main().queryByText('CV Backend 2026')).toBeNull())
    expect(main().queryByRole('alertdialog')).toBeNull()
    await waitFor(() =>
      expect(within(sessionNav()).queryAllByRole('link')).toHaveLength(before - used),
    )
  })

  it('deletes a JD from the JD tab', async () => {
    const user = userEvent.setup()
    renderRoute('/library?tab=jd')
    await user.click(await main().findByRole('button', { name: 'Tùy chọn cho JD ABC · Backend' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Xóa' }))
    const confirm = await main().findByRole('alertdialog', { name: 'Xóa JD ABC · Backend?' })
    await user.click(within(confirm).getByRole('button', { name: /^Xóa JD/ }))
    await waitFor(() => expect(main().queryByText('ABC · Backend')).toBeNull())
  })

  it('keeps the CV and the confirmation when deleting fails', async () => {
    let calls = 0
    server.use(
      http.delete('/api/cvs/:id', () => {
        calls += 1
        return HttpResponse.json(
          { error: { code: 'internal_error', message: 'boom' } },
          { status: 500 },
        )
      }),
    )
    const user = userEvent.setup()
    renderRoute('/library')
    await user.click(await main().findByRole('button', { name: 'Tùy chọn cho CV CV Backend 2026' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Xóa' }))
    const confirm = await main().findByRole('alertdialog')
    await user.click(within(confirm).getByRole('button', { name: /^Xóa CV/ }))
    await waitFor(() => expect(calls).toBe(1))
    // The error itself goes to a toast (not mounted in tests); the confirm is ready to retry.
    await waitFor(() =>
      expect(within(confirm).getByRole('button', { name: 'Giữ lại' })).toBeEnabled(),
    )
    expect(main().getByText('CV Backend 2026')).toBeInTheDocument()
    expect(main().getByRole('alertdialog')).toBeInTheDocument()
  })
})

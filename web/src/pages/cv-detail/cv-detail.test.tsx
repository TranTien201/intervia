import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as db from '@/mocks/db'
import { renderRoute } from '@/test/render'

const main = () => within(screen.getByRole('main'))
const CV_ID = 'cv-backend'
const latestVersion = () => db.cvRow(CV_ID)!.versions.at(-1)!.version

describe('CvDetailPage', () => {
  it('shows the profile, the version and the sessions that used the CV', async () => {
    renderRoute(`/library/cv/${CV_ID}`)
    expect(await main().findByRole('heading', { name: 'CV Backend 2026' })).toBeInTheDocument()
    expect(main().getByText('nguyen-van-a.pdf')).toBeInTheDocument()
    expect(main().getByRole('link', { name: 'Xem file gốc' })).toHaveAttribute(
      'href',
      `/api/cvs/${CV_ID}/file`,
    )
    expect(
      main().getByRole('button', { name: `Bản ${latestVersion()}, xem lịch sử phiên bản` }),
    ).toBeInTheDocument()
    expect(await main().findByText('Python')).toBeInTheDocument()
    expect(main().getByRole('link', { name: 'Tạo phiên với CV này' })).toHaveAttribute(
      'href',
      `/sessions/new?cv=${CV_ID}`,
    )

    const used = within(screen.getByRole('complementary', { name: 'Đã dùng trong' }))
    const links = await used.findAllByRole('link')
    const sessions = db.listSessions((s) => s.cv_id === CV_ID)
    expect(links).toHaveLength(sessions.length)
    expect(links[0]).toHaveAttribute('href', `/sessions/${sessions[0]!.id}/${sessions[0]!.step}`)
    expect(links[0]).toHaveTextContent(`b${sessions[0]!.cv.version}`)
  })

  it('renames the CV in place', async () => {
    const user = userEvent.setup()
    renderRoute(`/library/cv/${CV_ID}`)
    await user.click(await main().findByRole('button', { name: 'Đổi tên CV' }))
    const box = main().getByRole('textbox', { name: 'Tên CV' })
    await user.clear(box)
    await user.click(main().getByRole('button', { name: 'Lưu tên' }))
    expect(main().getByText('Đặt tên để dễ tìm lại.')).toBeInTheDocument()

    await user.type(box, 'CV Backend mới{enter}')
    expect(await main().findByRole('heading', { name: 'CV Backend mới' })).toBeInTheDocument()
    expect(db.cvRow(CV_ID)!.name).toBe('CV Backend mới')
  })

  it('opens an old version from ?v= as view-only', async () => {
    const user = userEvent.setup()
    renderRoute(`/library/cv/${CV_ID}?v=1`)
    expect(await main().findByText('Đang xem bản 1 (chỉ xem)')).toBeInTheDocument()
    expect(await main().findByText('Python')).toBeInTheDocument()
    expect(main().queryByRole('button', { name: 'Xóa Python' })).toBeNull()

    await user.click(main().getByRole('button', { name: 'Về bản mới nhất' }))
    expect(main().queryByText(/Đang xem bản/)).toBeNull()
    expect(await main().findByRole('button', { name: 'Xóa Python' })).toBeInTheDocument()
  })

  it('picks an old version from the history menu', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute(`/library/cv/${CV_ID}`)
    await user.click(await main().findByRole('button', { name: /xem lịch sử phiên bản/ }))
    await user.click(await screen.findByRole('menuitemradio', { name: /^bản 1/ }))
    expect(router.state.location.search).toBe('?v=1')
    expect(await main().findByText('Đang xem bản 1 (chỉ xem)')).toBeInTheDocument()
  })

  it('re-analyzes the CV, shows the progress, then the new version', async () => {
    const user = userEvent.setup()
    const before = latestVersion()
    renderRoute(`/library/cv/${CV_ID}`)
    await user.click(await main().findByRole('button', { name: 'Tùy chọn cho CV CV Backend 2026' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Phân tích lại' }))
    expect(await main().findByRole('list', { name: 'Tiến trình phân tích' })).toBeInTheDocument()

    // Let the simulated analysis finish.
    db.cvRow(CV_ID)!.job!.started_at = 0
    expect(
      await main().findByRole(
        'button',
        { name: `Bản ${before + 1}, xem lịch sử phiên bản` },
        { timeout: 3000 },
      ),
    ).toBeInTheDocument()
    expect(main().queryByRole('list', { name: 'Tiến trình phân tích' })).toBeNull()
  })

  it('deletes the CV with its sessions and goes back to the library', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute(`/library/cv/${CV_ID}`)
    await user.click(await main().findByRole('button', { name: 'Xóa CV và dữ liệu liên quan' }))
    const n = db.listSessions((s) => s.cv_id === CV_ID).length
    await user.click(await main().findByRole('button', { name: `Xóa CV và ${n} phiên` }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/library'))
    expect(db.cvRow(CV_ID)).toBeUndefined()
  })

  it('says so when the CV does not exist', async () => {
    renderRoute('/library/cv/nope')
    expect(await main().findByText('Không tìm thấy CV này. Có thể nó đã bị xóa.')).toBeVisible()
  })
})

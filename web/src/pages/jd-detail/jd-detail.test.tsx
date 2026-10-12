import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as db from '@/mocks/db'
import { renderRoute } from '@/test/render'

const main = () => within(screen.getByRole('main'))
const JD_ID = 'jd-abc'
const row = (name: string) => within(main().getByText(name).closest('li')!)

describe('JdDetailPage', () => {
  it('shows the JD, its requirements and the sessions that used it', async () => {
    renderRoute(`/library/jd/${JD_ID}`)
    expect(await main().findByRole('heading', { name: 'ABC · Backend' })).toBeInTheDocument()
    expect(main().getByText('Backend Engineer')).toBeInTheDocument()
    expect(main().getByText('Công ty ABC')).toBeInTheDocument()
    expect(main().getByRole('link', { name: 'Thư viện' })).toHaveAttribute(
      'href',
      '/library?tab=jd',
    )
    expect(main().getByRole('link', { name: 'Tạo phiên với JD này' })).toHaveAttribute(
      'href',
      `/sessions/new?jd=${JD_ID}`,
    )
    expect(await main().findByText('Thiết kế API')).toBeInTheDocument()
    expect(main().getByText('3+ năm kinh nghiệm backend')).toBeInTheDocument()

    const used = within(screen.getByRole('complementary', { name: 'Đã dùng trong' }))
    const sessions = db.listSessions((s) => s.jd_id === JD_ID)
    expect(await used.findAllByRole('link')).toHaveLength(sessions.length)
    expect(used.getAllByRole('link')[0]).toHaveTextContent(`b${sessions[0]!.jd.version}`)
  })

  it('collapses the JD text and expands it on demand', async () => {
    const user = userEvent.setup()
    renderRoute(`/library/jd/${JD_ID}`)
    const toggle = await main().findByRole('button', { name: 'Xem toàn bộ' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(main().getByText(/Mô tả công việc/)).toHaveClass('line-clamp-4')

    await user.click(toggle)
    expect(main().getByRole('button', { name: 'Thu gọn' })).toHaveAttribute('aria-expanded', 'true')
    expect(main().getByText(/Mô tả công việc/)).not.toHaveClass('line-clamp-4')
  })

  it('edits a requirement and saves it as a new version', async () => {
    const user = userEvent.setup()
    renderRoute(`/library/jd/${JD_ID}`)
    await user.click(
      await main().findByRole('button', { name: 'Thiết kế API: Bắt buộc, đổi sang Nên có' }),
    )
    await user.click(main().getByRole('button', { name: 'Lưu thành bản 2' }))

    expect(await main().findByText('Đã lưu · bản 2')).toBeInTheDocument()
    expect(
      await main().findByRole('button', { name: 'Bản 2, xem lịch sử phiên bản' }),
    ).toBeInTheDocument()
    const saved = db.jdRow(JD_ID)!.versions.at(-1)!
    expect(saved.requirements.requirements.find((r) => r.name === 'Thiết kế API')!.kind).toBe(
      'preferred',
    )
  })

  it('opens an old version from ?v= as view-only', async () => {
    const jd = db.jdRow(JD_ID)!
    db.saveJdVersion(jd, { ...jd.versions[0]!.requirements, requirements: [] })
    renderRoute(`/library/jd/${JD_ID}?v=1`)
    expect(await main().findByText('Đang xem bản 1 (chỉ xem)')).toBeInTheDocument()
    expect(await main().findByText('Thiết kế API')).toBeInTheDocument()
    expect(row('Thiết kế API').queryByRole('button')).toBeNull()
  })

  it('deletes the JD and goes back to the JD tab of the library', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute(`/library/jd/${JD_ID}`)
    await user.click(await main().findByRole('button', { name: 'Xóa JD và dữ liệu liên quan' }))
    const n = db.listSessions((s) => s.jd_id === JD_ID).length
    await user.click(await main().findByRole('button', { name: `Xóa JD và ${n} phiên` }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/library'))
    expect(router.state.location.search).toBe('?tab=jd')
    expect(db.jdRow(JD_ID)).toBeUndefined()
  })

  it('says so when the JD does not exist', async () => {
    renderRoute('/library/jd/nope')
    expect(await main().findByText('Không tìm thấy JD này. Có thể nó đã bị xóa.')).toBeVisible()
  })
})

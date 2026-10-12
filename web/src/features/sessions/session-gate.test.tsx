import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/mocks/node'
import { renderRoute } from '@/test/render'

describe('SessionGate', () => {
  it('shows the step page for an existing session', async () => {
    renderRoute('/sessions/s-match/match')
    expect(await screen.findByRole('heading', { name: 'Đối chiếu CV–JD' })).toBeInTheDocument()
  })

  it('shows "session not found" with a way back for a missing session', async () => {
    const { router } = renderRoute('/sessions/nope/plan')
    expect(await screen.findByRole('heading', { name: 'Không tìm thấy phiên này' })).toBeVisible()
    expect(screen.getByText('Có thể phiên đã bị xóa.')).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Kế hoạch & chuẩn bị' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Về danh sách phiên' }))
    expect(router.state.location.pathname).toBe('/')
  })

  it('also guards the fullscreen interview page', async () => {
    renderRoute('/sessions/nope/interview')
    expect(await screen.findByRole('heading', { name: 'Không tìm thấy phiên này' })).toBeVisible()
  })

  it('shows "server unreachable" and recovers on retry', async () => {
    let down = true
    server.use(http.get('/api/sessions/:id', () => (down ? HttpResponse.error() : undefined)))
    renderRoute('/sessions/s-match/match')
    const main = screen.getByRole('main')
    expect(
      await within(main).findByRole('heading', { name: 'Không kết nối được máy chủ Intervia' }),
    ).toBeVisible()
    down = false
    await userEvent.click(within(main).getByRole('button', { name: 'Thử lại' }))
    expect(await screen.findByRole('heading', { name: 'Đối chiếu CV–JD' })).toBeInTheDocument()
  })

  it('opens the current step for a bare session link', async () => {
    const { router } = renderRoute('/sessions/s-done')
    await waitFor(() => expect(router.state.location.pathname).toBe('/sessions/s-done/review'))
  })
})

describe('NotFoundPage', () => {
  it('handles an unknown path', async () => {
    renderRoute('/khong-co')
    expect(await screen.findByRole('heading', { name: 'Không tìm thấy trang này' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Về danh sách phiên' })).toHaveAttribute('href', '/')
  })
})

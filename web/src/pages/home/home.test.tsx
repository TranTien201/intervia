import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { listSessions } from '@/mocks/db'
import { server } from '@/mocks/node'
import { renderRoute } from '@/test/render'

const section = (label: string) => screen.getByRole('heading', { name: label }).closest('section')!

describe('HomePage', () => {
  it('offers to resume the latest unfinished session', async () => {
    renderRoute('/')
    await screen.findByRole('heading', { name: 'Tiếp tục' })
    const resume = section('Tiếp tục')
    expect(within(resume).getByText('AI Engineer · Senior')).toBeInTheDocument()
    expect(within(resume).getByText(/Câu \d+\/~\d+/)).toBeInTheDocument()
    expect(within(resume).getByRole('link', { name: /Tiếp tục/ })).toHaveAttribute(
      'href',
      '/sessions/s-active/interview',
    )
  })

  it('hides "Tiếp tục" when no session is in progress', async () => {
    server.use(
      http.get('/api/sessions', () =>
        HttpResponse.json(listSessions((s) => s.status !== 'in_progress')),
      ),
    )
    renderRoute('/')
    await screen.findByRole('heading', { name: 'Luyện lại nhanh' })
    expect(screen.queryByRole('heading', { name: 'Tiếp tục' })).not.toBeInTheDocument()
  })

  it('starts a new session from the latest CV + JD + level and opens page 3', async () => {
    let body: unknown
    server.use(
      http.post('/api/sessions', async ({ request }) => {
        body = await request.clone().json()
        return undefined // fall through to the mock handler
      }),
    )
    const { router } = renderRoute('/')
    await screen.findByRole('heading', { name: 'Luyện lại nhanh' })
    const quick = section('Luyện lại nhanh')
    const button = within(quick).getByRole('button', { name: /Phiên mới/ })
    await waitFor(() => expect(button).toBeEnabled())
    await userEvent.click(button)
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/sessions\/.+\/match$/))
    expect(body).toEqual({
      cv_id: 'cv-backend',
      jd_id: 'jd-abc',
      role_id: 'backend_engineer',
      role_custom: null,
      level: 'mid',
    })
  })

  it('shows the three first-run steps when there is no session yet', async () => {
    server.use(http.get('/api/sessions', () => HttpResponse.json([])))
    renderRoute('/')
    const start = await screen.findByRole('link', { name: /Bắt đầu phiên đầu tiên/ })
    expect(start).toHaveAttribute('href', '/sessions/new')
    const main = screen.getByRole('main')
    for (const step of ['Thêm CV và JD', 'Kiểm tra hồ sơ', 'Phỏng vấn']) {
      expect(within(main).getByText(step)).toBeInTheDocument()
    }
    expect(screen.queryByRole('heading', { name: 'Luyện lại nhanh' })).not.toBeInTheDocument()
  })

  it('shows a network error with a retry button', async () => {
    server.use(http.get('/api/sessions', () => HttpResponse.error()))
    renderRoute('/')
    expect(await screen.findByText('Không kết nối được máy chủ Intervia.')).toBeInTheDocument()
    // The sidebar has its own retry; check the one in the page.
    expect(
      within(screen.getByRole('main')).getByRole('button', { name: 'Thử lại' }),
    ).toBeInTheDocument()
  })
})

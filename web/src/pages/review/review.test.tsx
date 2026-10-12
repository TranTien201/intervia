import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import * as db from '@/mocks/db'
import { server } from '@/mocks/node'
import { renderRoute } from '@/test/render'

const main = () => within(screen.getByRole('main'))

describe('ReviewPage header', () => {
  it('shows the session, the CV/JD versions it used and the tabs', async () => {
    renderRoute('/sessions/s-done/review')
    const s = db.sessionSummary(db.sessionRow('s-done')!)
    expect(await main().findByRole('heading', { name: 'Backend Engineer · Mid' })).toBeVisible()
    expect(main().getByText(new RegExp(`· ${s.progress.asked} câu$`))).toBeInTheDocument()

    expect(main().getByRole('link', { name: `${s.cv.name} · bản 3` })).toHaveAttribute(
      'href',
      '/library/cv/cv-backend?v=3',
    )
    expect(main().getByRole('link', { name: `${s.jd.name} · bản 1` })).toHaveAttribute(
      'href',
      '/library/jd/jd-abc?v=1',
    )

    expect(main().getByRole('tab', { name: 'Transcript' })).toHaveAttribute('aria-selected', 'true')
    expect(main().getByRole('tab', { name: /Báo cáo/ })).toBeDisabled()
  })

  it('"Luyện lại" opens page 2 with the same CV, JD, role and level', async () => {
    renderRoute('/sessions/s-done/review')
    expect(await main().findByRole('link', { name: /Luyện lại với CV & JD này/ })).toHaveAttribute(
      'href',
      '/sessions/new?cv=cv-backend&jd=jd-abc&role=backend_engineer&level=mid',
    )
  })

  it('deletes the session after confirming, then goes home', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute('/sessions/s-done/review')
    await user.click(await main().findByRole('button', { name: /Xóa phiên và dữ liệu/ }))
    await user.click(main().getByRole('button', { name: 'Giữ lại' }))
    expect(main().queryByRole('button', { name: 'Xóa phiên' })).toBeNull()

    await user.click(main().getByRole('button', { name: /Xóa phiên và dữ liệu/ }))
    await user.click(main().getByRole('button', { name: 'Xóa phiên' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(db.sessionRow('s-done')).toBeUndefined()
  })

  it('keeps the confirmation open when deleting fails', async () => {
    server.use(
      http.delete('/api/sessions/:id', () =>
        HttpResponse.json({ error: { code: 'internal', message: 'boom' } }, { status: 500 }),
      ),
    )
    const user = userEvent.setup()
    const { router } = renderRoute('/sessions/s-done/review')
    await user.click(await main().findByRole('button', { name: /Xóa phiên và dữ liệu/ }))
    await user.click(main().getByRole('button', { name: 'Xóa phiên' }))
    await waitFor(() => expect(main().getByRole('button', { name: 'Xóa phiên' })).toBeEnabled())
    expect(router.state.location.pathname).toBe('/sessions/s-done/review')
    expect(db.sessionRow('s-done')).toBeDefined()
  })

  it('sends unfinished sessions to the step they are at', async () => {
    const active = renderRoute('/sessions/s-active/review')
    await waitFor(() =>
      expect(active.router.state.location.pathname).toBe('/sessions/s-active/interview'),
    )
    active.unmount()
    const draft = renderRoute('/sessions/s-plan/review')
    await waitFor(() => expect(draft.router.state.location.pathname).toBe('/sessions/s-plan/plan'))
  })
})

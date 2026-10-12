import { screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { CreateSessionInput } from '@/api/types'
import * as db from '@/mocks/db'
import { server } from '@/mocks/node'
import { renderRoute } from '@/test/render'

const main = () => within(screen.getByRole('main'))
const pdf = () => new File([new Uint8Array(2048)], 'cv-moi.pdf', { type: 'application/pdf' })

/** Record JSON request bodies without changing the mock's response. */
function spyPosts(path: string) {
  const calls: unknown[] = []
  server.events.on('request:start', async ({ request }) => {
    if (request.method === 'POST' && new URL(request.url).pathname === path)
      calls.push(await request.clone().json())
  })
  return calls
}

/**
 * jsdom's File/FormData can't go through Node's fetch, so the upload is stubbed:
 * it still adds the CV to the mock DB so the session can be created from it.
 */
function stubCvUpload() {
  const uploads = { count: 0 }
  server.use(
    http.post('/api/cvs', () => {
      uploads.count += 1
      return HttpResponse.json(db.cvSummary(db.createCv('cv-moi', 'cv-moi.pdf')), {
        status: 201,
      })
    }),
  )
  return uploads
}

async function pickRoleAndLevel(user: UserEvent, role = 'Backend Engineer', level = 'Mid') {
  await user.selectOptions(main().getByLabelText('Vị trí'), role)
  await user.click(main().getByRole('radio', { name: level }))
}

async function useNewCv(user: UserEvent) {
  await user.click(main().getByRole('radio', { name: 'Tải CV mới' }))
  await user.upload(main().getByLabelText('File CV'), pdf())
}

async function useNewJd(user: UserEvent) {
  await user.click(main().getByRole('radio', { name: 'Thêm JD mới' }))
  await user.click(main().getByLabelText('Nội dung JD'))
  await user.paste('Senior Data Engineer\nYêu cầu: Python, Kafka')
}

afterEach(() => server.events.removeAllListeners())

describe('SessionNewPage', () => {
  it('preselects the newest CV/JD and shows their analysis status', async () => {
    renderRoute('/sessions/new')
    const cv = await main().findByLabelText('CV có sẵn')
    expect(cv).toHaveValue('cv-backend')
    expect(main().getByText(/^Đã phân tích · (sửa|thêm) \d\d\/\d\d$/)).toBeInTheDocument()
    expect(main().getByText(/^Đã phân tích · \d+ yêu cầu$/)).toBeInTheDocument()
    expect(main().getByRole('radio', { name: 'Dùng CV có sẵn' })).toBeChecked()
  })

  it.each([
    ['existing CV', 'existing JD', false, false],
    ['new CV', 'existing JD', true, false],
    ['existing CV', 'new JD', false, true],
    ['new CV', 'new JD', true, true],
  ])('creates a session from %s + %s', async (_cv, _jd, newCv, newJd) => {
    const user = userEvent.setup()
    const sessions = spyPosts('/api/sessions')
    stubCvUpload()
    const { router } = renderRoute('/sessions/new')
    await main().findByLabelText('CV có sẵn')
    if (newCv) await useNewCv(user)
    if (newJd) await useNewJd(user)
    await pickRoleAndLevel(user)
    await user.click(main().getByRole('button', { name: /Tiếp tục/ }))

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/sessions\/.+\/match$/))
    const body = sessions[0] as CreateSessionInput
    expect(body).toMatchObject({ role_id: 'backend_engineer', role_custom: null, level: 'mid' })
    if (!newCv) expect(body.cv_id).toBe('cv-backend')
    else expect(body.cv_id).not.toMatch(/^cv-(backend|ai)$/)
    const seedJds = ['jd-abc', 'jd-xyz', 'jd-fintech']
    if (!newJd) expect(seedJds).toContain(body.jd_id)
    else expect(seedJds).not.toContain(body.jd_id)
  })

  it('shows only the upload and paste fields when the library is empty', async () => {
    server.use(
      http.get('/api/cvs', () => HttpResponse.json([])),
      http.get('/api/jds', () => HttpResponse.json([])),
    )
    renderRoute('/sessions/new')
    expect(await main().findByLabelText('File CV')).toBeInTheDocument()
    expect(main().getByLabelText('Nội dung JD')).toBeInTheDocument()
    expect(main().queryByRole('radio', { name: /có sẵn/ })).not.toBeInTheDocument()
  })

  it('shows errors under each missing field and sends nothing', async () => {
    const user = userEvent.setup()
    const sessions = spyPosts('/api/sessions')
    renderRoute('/sessions/new')
    await main().findByLabelText('CV có sẵn')
    await user.click(main().getByRole('radio', { name: 'Thêm JD mới' }))
    await user.click(main().getByRole('button', { name: /Tiếp tục/ }))

    expect(main().getByLabelText('Nội dung JD')).toHaveAccessibleDescription('Dán nội dung JD.')
    expect(main().getByLabelText('Vị trí')).toHaveAccessibleDescription('Chọn vị trí.')
    expect(main().getByText('Chọn cấp độ.')).toBeInTheDocument()
    await waitFor(() => expect(main().getByLabelText('Nội dung JD')).toHaveFocus())
    expect(sessions).toHaveLength(0)
  })

  it('rejects a JD over the length limit', async () => {
    const user = userEvent.setup()
    renderRoute('/sessions/new')
    await main().findByLabelText('CV có sẵn')
    await user.click(main().getByRole('radio', { name: 'Thêm JD mới' }))
    await user.click(main().getByLabelText('Nội dung JD'))
    await user.paste('x'.repeat(20_001))
    await user.click(main().getByRole('button', { name: /Tiếp tục/ }))
    expect(main().getByLabelText('Nội dung JD')).toHaveAccessibleDescription(/tối đa 20/)
  })

  it('takes CV, JD, role and level from the URL', async () => {
    renderRoute('/sessions/new?cv=cv-ai&jd=jd-xyz&role=ai_engineer&level=senior')
    expect(await main().findByLabelText('CV có sẵn')).toHaveValue('cv-ai')
    expect(main().getByLabelText('JD có sẵn')).toHaveValue('jd-xyz')
    expect(main().getByLabelText('Vị trí')).toHaveValue('ai_engineer')
    expect(main().getByRole('radio', { name: 'Senior' })).toBeChecked()
  })

  it('ignores unknown ids in the URL', async () => {
    renderRoute('/sessions/new?cv=nope&level=expert')
    expect(await main().findByLabelText('CV có sẵn')).toHaveValue('cv-backend')
    expect(main().getByRole('radio', { name: 'Senior' })).not.toBeChecked()
  })

  it('sends a custom role for "Khác"', async () => {
    const user = userEvent.setup()
    const sessions = spyPosts('/api/sessions')
    const { router } = renderRoute('/sessions/new')
    await main().findByLabelText('CV có sẵn')
    await pickRoleAndLevel(user, 'Khác…', 'Junior')
    await user.click(main().getByRole('button', { name: /Tiếp tục/ }))
    expect(main().getByLabelText('Tên vị trí')).toHaveAccessibleDescription('Nhập tên vị trí.')

    await user.type(main().getByLabelText('Tên vị trí'), 'Mobile Engineer')
    await user.click(main().getByRole('button', { name: /Tiếp tục/ }))
    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/match$/))
    expect(sessions[0]).toMatchObject({ role_id: null, role_custom: 'Mobile Engineer' })
  })

  it('sends one request when clicked twice', async () => {
    const user = userEvent.setup()
    const sessions = spyPosts('/api/sessions')
    const { router } = renderRoute('/sessions/new')
    await main().findByLabelText('CV có sẵn')
    await pickRoleAndLevel(user)
    const button = main().getByRole('button', { name: /Tiếp tục/ })
    await user.dblClick(button)
    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/match$/))
    expect(sessions).toHaveLength(1)
  })

  it('creates the session from an uploaded JD file', async () => {
    const user = userEvent.setup()
    // jsdom's File loses its name through FormData + fetch (see stubCvUpload): only check that
    // a multipart request with a file and the suggested name was sent.
    let sent: { file: boolean; name: FormDataEntryValue | null } | null = null
    server.use(
      http.post('/api/jds', async ({ request }) => {
        const form = await request.formData()
        sent = { file: typeof form.get('file') !== 'string', name: form.get('name') }
        const row = db.createJd('jd-acme', db.jdTextFromFile('jd-acme.pdf')!)
        const { text: _t, ...summary } = db.jdDetail(row)
        return HttpResponse.json(summary, { status: 201 })
      }),
    )
    const { router } = renderRoute('/sessions/new')
    await main().findByLabelText('JD có sẵn')
    await user.click(main().getByRole('radio', { name: 'Thêm JD mới' }))
    await user.click(main().getByRole('tab', { name: 'Tải file' }))
    await user.upload(
      main().getByLabelText('File JD'),
      new File([new Uint8Array(1024)], 'jd-acme.pdf', { type: 'application/pdf' }),
    )
    expect(main().getByLabelText('Tên JD')).toHaveValue('jd-acme')
    await pickRoleAndLevel(user)
    await user.click(main().getByRole('button', { name: /Tiếp tục/ }))
    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/match$/))
    expect(sent).toEqual({ file: true, name: 'jd-acme' })
  })

  it('asks for a JD file and shows the server error under it', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('/api/jds', () =>
        HttpResponse.json({ error: { code: 'no_text_in_file', message: 'scan' } }, { status: 422 }),
      ),
    )
    renderRoute('/sessions/new')
    await main().findByLabelText('JD có sẵn')
    await useNewJd(user)
    await user.click(main().getByRole('tab', { name: 'Tải file' }))
    await pickRoleAndLevel(user)
    await user.click(main().getByRole('button', { name: /Tiếp tục/ }))
    expect(await main().findByText('Chọn một file JD.')).toBeInTheDocument()

    await user.upload(
      main().getByLabelText('File JD'),
      new File([new Uint8Array(1024)], 'jd-scan.pdf', { type: 'application/pdf' }),
    )
    await user.click(main().getByRole('button', { name: /Tiếp tục/ }))
    expect(await main().findByText(/ảnh scan/)).toBeInTheDocument()

    // Switching back to paste keeps the text typed before.
    await user.click(main().getByRole('tab', { name: 'Dán nội dung' }))
    expect(main().getByLabelText('Nội dung JD')).toHaveValue(
      'Senior Data Engineer\nYêu cầu: Python, Kafka',
    )
  })

  it('does not upload the new CV again when retrying after a failure', async () => {
    const user = userEvent.setup()
    const uploads = stubCvUpload()
    let failOnce = true
    server.use(
      http.post('/api/sessions', () => {
        if (!failOnce) return
        failOnce = false
        return HttpResponse.json(
          { error: { code: 'internal_error', message: 'boom' } },
          { status: 500 },
        )
      }),
    )
    const { router } = renderRoute('/sessions/new')
    await main().findByLabelText('CV có sẵn')
    await useNewCv(user)
    await pickRoleAndLevel(user)
    await user.click(main().getByRole('button', { name: /Tiếp tục/ }))
    expect(await main().findByRole('alert')).toHaveTextContent('Có lỗi xảy ra ở máy chủ.')

    await user.click(main().getByRole('button', { name: /Tiếp tục/ }))
    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/match$/))
    expect(uploads.count).toBe(1)
  })
})

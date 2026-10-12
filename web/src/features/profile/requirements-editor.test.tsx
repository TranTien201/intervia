import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { JdRequirements, JdVersion } from '@/api/types'
import * as db from '@/mocks/db'
import { server } from '@/mocks/node'
import { renderWithClient } from '@/test/render'
import { RequirementsEditor } from './RequirementsEditor'

const JD_ID = 'jd-abc'
const latest = () => structuredClone(db.jdRow(JD_ID)!.versions.at(-1)!) as JdVersion

const section = (title: string) =>
  within(screen.getByRole('heading', { name: title }).closest('section')!)
const row = (name: string) => within(screen.getByText(name).closest('li')!)

/** Capture what the editor sends to POST /jds/:id/versions. */
function captureSave() {
  const sent: { base_version: number; requirements: JdRequirements }[] = []
  server.use(
    http.post('/api/jds/:id/versions', async ({ request }) => {
      const body = (await request.json()) as (typeof sent)[number]
      sent.push(body)
      return HttpResponse.json(
        { ...latest(), version: body.base_version + 1, requirements: body.requirements },
        { status: 201 },
      )
    }),
  )
  return sent
}

describe('RequirementsEditor', () => {
  it('toggles required/preferred and saves a new version', async () => {
    const user = userEvent.setup()
    const sent = captureSave()
    const v = latest()
    renderWithClient(<RequirementsEditor jdId={JD_ID} version={v} />)

    expect(row('Thiết kế API').getByText('Bắt buộc')).toBeInTheDocument()
    await user.click(
      row('Thiết kế API').getByRole('button', { name: 'Thiết kế API: Bắt buộc, đổi sang Nên có' }),
    )
    expect(row('Thiết kế API').getByText('Nên có')).toBeInTheDocument()
    await user.click(row('Docker, CI/CD').getByRole('button', { name: /đổi sang Bắt buộc$/ }))
    expect(row('Docker, CI/CD').getByText('Bắt buộc')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: `Lưu thành bản ${v.version + 1}` }))
    expect(await screen.findByText(`Đã lưu · bản ${v.version + 1}`)).toBeInTheDocument()
    expect(sent[0]!.base_version).toBe(v.version)
    const kinds = Object.fromEntries(
      sent[0]!.requirements.requirements.map((r) => [r.name, r.kind]),
    )
    expect(kinds['Thiết kế API']).toBe('preferred')
    expect(kinds['Docker, CI/CD']).toBe('required')
    // Unmapped items are sent back unchanged.
    expect(sent[0]!.requirements.unmapped).toEqual(v.requirements.unmapped)
  })

  it('removes a requirement, and can discard the change', async () => {
    const user = userEvent.setup()
    const sent = captureSave()
    const v = latest()
    renderWithClient(<RequirementsEditor jdId={JD_ID} version={v} />)

    await user.click(screen.getByRole('button', { name: 'Xóa Database' }))
    expect(screen.queryByText('Database')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Hủy thay đổi' }))
    expect(screen.getByText('Database')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Xóa Database' }))
    await user.click(screen.getByRole('button', { name: `Lưu thành bản ${v.version + 1}` }))
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]!.requirements.requirements.map((r) => r.name)).not.toContain('Database')
  })

  it('lists what the JD analysis could not map', () => {
    renderWithClient(<RequirementsEditor jdId={JD_ID} version={latest()} />)
    expect(section('Không map được').getByText('3+ năm kinh nghiệm backend')).toBeInTheDocument()
  })

  it('hides the unmapped section when there is nothing to review', () => {
    const v = latest()
    v.requirements.unmapped = []
    renderWithClient(<RequirementsEditor jdId={JD_ID} version={v} />)
    expect(screen.queryByRole('heading', { name: 'Không map được' })).toBeNull()
  })

  it('keeps the edits when saving fails', async () => {
    server.use(
      http.post('/api/jds/:id/versions', () =>
        HttpResponse.json(
          { error: { code: 'version_conflict', message: 'conflict' } },
          { status: 409 },
        ),
      ),
    )
    const user = userEvent.setup()
    const v = latest()
    renderWithClient(<RequirementsEditor jdId={JD_ID} version={v} />)
    await user.click(row('Thiết kế API').getByRole('button', { name: /đổi sang Nên có$/ }))
    await user.click(screen.getByRole('button', { name: `Lưu thành bản ${v.version + 1}` }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Phần bạn sửa vẫn còn')
    expect(row('Thiết kế API').getByText('Nên có')).toBeInTheDocument()
  })

  it('shows an old version read-only', () => {
    renderWithClient(<RequirementsEditor jdId={JD_ID} version={latest()} readOnly />)
    expect(row('Thiết kế API').getByText('Bắt buộc')).toBeInTheDocument()
    expect(screen.getByText('3+ năm kinh nghiệm backend')).toBeInTheDocument()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})

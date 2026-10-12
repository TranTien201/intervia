import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { CandidateProfile, CvVersion } from '@/api/types'
import * as db from '@/mocks/db'
import { server } from '@/mocks/node'
import { renderWithClient } from '@/test/render'
import { ProfileEditor } from './ProfileEditor'

const CV_ID = 'cv-backend'
const latest = () => structuredClone(db.cvRow(CV_ID)!.versions.at(-1)!) as CvVersion

const section = (title: string) =>
  within(screen.getByRole('heading', { name: title }).closest('section')!)
const claimCard = (text: string) => within(screen.getByText(text).closest('li')!)

/** Capture what the editor sends to POST /cvs/:id/versions. */
function captureSave() {
  const sent: { base_version: number; profile: CandidateProfile }[] = []
  server.use(
    http.post('/api/cvs/:id/versions', async ({ request }) => {
      const body = (await request.json()) as (typeof sent)[number]
      sent.push(body)
      return HttpResponse.json(
        { ...latest(), version: body.base_version + 1, profile: body.profile },
        { status: 201 },
      )
    }),
  )
  return sent
}

describe('ProfileEditor', () => {
  it('adds and removes skills', async () => {
    const user = userEvent.setup()
    const sent = captureSave()
    const v = latest()
    renderWithClient(<ProfileEditor cvId={CV_ID} version={v} />)

    const skills = section('Kỹ năng')
    await user.click(skills.getByRole('button', { name: 'Xóa Python' }))
    expect(skills.queryByText('Python')).toBeNull()
    await user.click(skills.getByRole('button', { name: 'Thêm kỹ năng' }))
    await user.type(skills.getByRole('textbox', { name: 'Thêm kỹ năng' }), 'Kafka{enter}')
    expect(skills.getByText('Kafka')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: `Lưu thành bản ${v.version + 1}` }))
    await waitFor(() => expect(sent).toHaveLength(1))
    const names = sent[0]!.profile.skills.map((s) => s.name)
    expect(names).not.toContain('Python')
    expect(names).toContain('Kafka')
    // Skills that stay keep what was extracted for them.
    const kept = v.profile.skills.find((s) => s.name !== 'Python')!
    expect(sent[0]!.profile.skills).toContainEqual(kept)
  })

  it('edits a claim and saves it as a new version', async () => {
    const user = userEvent.setup()
    const sent = captureSave()
    const v = latest()
    renderWithClient(<ProfileEditor cvId={CV_ID} version={v} />)

    await user.click(claimCard('Giảm 40% độ trễ API').getByRole('button', { name: 'Sửa' }))
    const box = screen.getByRole('textbox', { name: 'Điều CV khẳng định' })
    await user.clear(box)
    await user.type(box, 'Giảm 45% độ trễ p95')
    await user.click(screen.getByRole('button', { name: 'Xong' }))
    // The quote from the CV stays under the edited statement.
    expect(claimCard('Giảm 45% độ trễ p95').getByText(/giảm 40% độ trễ p95 của API/)).toBeVisible()

    await user.click(screen.getByRole('button', { name: `Lưu thành bản ${v.version + 1}` }))
    expect(await screen.findByText(`Đã lưu · bản ${v.version + 1}`)).toBeInTheDocument()
    expect(sent[0]!.base_version).toBe(v.version)
    expect(sent[0]!.profile.claims.map((c) => c.statement)).toContain('Giảm 45% độ trễ p95')
    expect(screen.queryByRole('button', { name: /^Lưu thành bản/ })).toBeNull()
  })

  it('removes and adds claims; an added claim has no quote', async () => {
    const user = userEvent.setup()
    renderWithClient(<ProfileEditor cvId={CV_ID} version={latest()} />)
    await user.click(claimCard('Dẫn dắt nhóm 3 người').getByRole('button', { name: 'Xóa' }))
    expect(screen.queryByText('Dẫn dắt nhóm 3 người')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Thêm điều CV khẳng định' }))
    await user.type(screen.getByRole('textbox', { name: 'Điều CV khẳng định' }), 'Mentor 2 intern')
    await user.click(screen.getByRole('button', { name: 'Thêm' }))
    expect(
      claimCard('Mentor 2 intern').getByText('Bạn tự thêm, không có câu gốc trong CV'),
    ).toBeInTheDocument()
  })

  it('warns when a claim quote is not found in the CV', () => {
    renderWithClient(<ProfileEditor cvId={CV_ID} version={latest()} />)
    const warned = claimCard('Xử lý 2 triệu giao dịch mỗi ngày')
    expect(warned.getByText(/Không tìm thấy câu gốc trong CV/)).toBeInTheDocument()
    expect(warned.getByRole('link', { name: 'Kiểm tra' })).toHaveAttribute(
      'href',
      `/api/cvs/${CV_ID}/file`,
    )
    expect(claimCard('Giảm 40% độ trễ API').queryByText(/Không tìm thấy câu gốc/)).toBeNull()
  })

  it('edits an experience in place', async () => {
    const user = userEvent.setup()
    renderWithClient(<ProfileEditor cvId={CV_ID} version={latest()} />)
    const exp = section('Kinh nghiệm')
    await user.click(exp.getByRole('button', { name: /^Sửa Backend Engineer @ Công ty ABC/ }))
    const period = exp.getByRole('textbox', { name: 'Thời gian' })
    await user.clear(period)
    await user.type(period, '2021–nay{enter}')
    expect(exp.getByText('Backend Engineer @ Công ty ABC · 2021–nay')).toBeInTheDocument()
  })

  it('keeps the edits when saving fails, and can discard them', async () => {
    server.use(
      http.post('/api/cvs/:id/versions', () =>
        HttpResponse.json(
          { error: { code: 'version_conflict', message: 'conflict' } },
          { status: 409 },
        ),
      ),
    )
    const user = userEvent.setup()
    const v = latest()
    renderWithClient(<ProfileEditor cvId={CV_ID} version={v} />)
    await user.click(section('Kỹ năng').getByRole('button', { name: 'Xóa Python' }))
    await user.click(screen.getByRole('button', { name: `Lưu thành bản ${v.version + 1}` }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Đã có bản mới hơn.')
    expect(section('Kỹ năng').queryByText('Python')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Hủy thay đổi' }))
    expect(section('Kỹ năng').getByText('Python')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows an old version read-only', () => {
    renderWithClient(<ProfileEditor cvId={CV_ID} version={latest()} readOnly />)
    expect(screen.getByText('Python')).toBeInTheDocument()
    expect(screen.getByText('Giảm 40% độ trễ API')).toBeInTheDocument()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    // The quote warning still shows: it is information, not an action.
    expect(screen.getByText(/Không tìm thấy câu gốc trong CV/)).toBeInTheDocument()
  })

  it('starts over when the parent passes another version', async () => {
    const user = userEvent.setup()
    const versions = db.cvRow(CV_ID)!.versions
    expect(versions.length).toBeGreaterThan(1)
    const newest = latest()
    const oldest = structuredClone(versions[0]) as CvVersion
    oldest.profile.skills = [{ ...oldest.profile.skills[0]!, name: 'Chỉ có ở bản cũ' }]
    const { rerender } = renderWithClient(<ProfileEditor cvId={CV_ID} version={newest} />)
    await user.click(section('Kỹ năng').getByRole('button', { name: 'Xóa Python' }))

    rerender(<ProfileEditor cvId={CV_ID} version={oldest} readOnly />)
    expect(screen.getByText('Chỉ có ở bản cũ')).toBeInTheDocument()
    expect(screen.queryByText('Python')).toBeNull()
  })
})

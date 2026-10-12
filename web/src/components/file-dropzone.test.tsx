import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { formatFileSize, validateUploadFile } from '@/lib/files'
import { FileDropzone } from './FileDropzone'

const fileOf = (name: string, bytes: number, type = '') =>
  new File([new Uint8Array(bytes)], name, { type })

function Harness({ onChange }: { onChange: (f: File) => void }) {
  const [file, setFile] = useState<File | null>(null)
  return (
    <FileDropzone
      value={file}
      onChange={(f) => {
        setFile(f)
        onChange(f)
      }}
    />
  )
}

function setup() {
  const onChange = vi.fn()
  render(<Harness onChange={onChange} />)
  // applyAccept: false so the component's own validation is what gets tested.
  const user = userEvent.setup({ applyAccept: false })
  return { onChange, user, input: screen.getByLabelText('File CV') }
}

describe('validateUploadFile', () => {
  it('accepts PDF/DOCX by extension even without a MIME type', () => {
    expect(validateUploadFile(fileOf('cv.PDF', 10))).toBeNull()
    expect(validateUploadFile(fileOf('cv.docx', 10))).toBeNull()
  })

  it('rejects other types, empty and too large files', () => {
    expect(validateUploadFile(fileOf('cv.doc', 10))).toMatch('PDF hoặc DOCX')
    expect(validateUploadFile(fileOf('cv.pdf', 0))).toMatch('trống')
    expect(validateUploadFile(fileOf('cv.pdf', 5 * 1024 * 1024 + 1))).toMatch('5 MB')
  })

  it('formats sizes', () => {
    expect(formatFileSize(820 * 1024)).toBe('820 KB')
    expect(formatFileSize(1.25 * 1024 * 1024)).toBe('1,3 MB')
  })
})

describe('FileDropzone', () => {
  it('shows the privacy note and the chosen file with a change button', async () => {
    const { onChange, user, input } = setup()
    expect(input).toHaveAccessibleDescription(/xóa được bất cứ lúc nào/)
    await user.upload(input, fileOf('nguyen-van-a.pdf', 2048, 'application/pdf'))
    expect(onChange).toHaveBeenCalledOnce()
    expect(screen.getByText('nguyen-van-a.pdf')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Đổi file' })).toBeInTheDocument()
  })

  it('shows an error under the box and keeps the previous file', async () => {
    const { onChange, user, input } = setup()
    await user.upload(input, fileOf('cv.pdf', 2048))
    await user.upload(input, fileOf('anh.png', 2048, 'image/png'))
    expect(onChange).toHaveBeenCalledOnce()
    expect(screen.getByRole('alert')).toHaveTextContent('Chỉ nhận file PDF hoặc DOCX.')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('cv.pdf')).toBeInTheDocument()
  })

  it('accepts a dropped file and rejects several at once', () => {
    const { onChange } = setup()
    const zone = screen.getByText('Kéo thả PDF/DOCX').parentElement!.parentElement!
    fireEvent.drop(zone, { dataTransfer: { files: [fileOf('a.pdf', 10), fileOf('b.pdf', 10)] } })
    expect(screen.getByRole('alert')).toHaveTextContent('Chỉ chọn một file.')
    fireEvent.drop(zone, { dataTransfer: { files: [fileOf('cv.docx', 10)] } })
    expect(onChange).toHaveBeenCalledOnce()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows an error passed from outside (server)', () => {
    render(<FileDropzone value={null} onChange={() => {}} error="Máy chủ từ chối file." />)
    expect(screen.getByRole('alert')).toHaveTextContent('Máy chủ từ chối file.')
  })
})

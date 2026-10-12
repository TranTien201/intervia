import { render, screen } from '@testing-library/react'
import { VoiceStatusPill } from './VoiceStatusPill'

describe('VoiceStatusPill', () => {
  it.each([
    ['connecting', 'Đang kết nối'],
    ['listening', 'Đang nghe bạn'],
    ['thinking', 'Cứ từ từ suy nghĩ'],
    ['processing', 'Đang xử lý'],
    ['speaking', 'AI đang nói'],
    ['mic_unavailable', 'Không dùng được mic'],
  ] as const)('%s has its text in a polite live region', (state, label) => {
    render(<VoiceStatusPill state={state} />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent(label)
    expect(status).toHaveAttribute('aria-live', 'polite')
  })

  it('keeps the same live region when the state changes', () => {
    const { rerender } = render(<VoiceStatusPill state="listening" />)
    const status = screen.getByRole('status')
    rerender(<VoiceStatusPill state="processing" />)
    expect(screen.getByRole('status')).toBe(status)
    expect(status).toHaveTextContent('Đang xử lý')
  })

  it('turns motion off for reduced motion', () => {
    const { container } = render(<VoiceStatusPill state="speaking" />)
    const bars = container.querySelectorAll('.animate-voice-wave')
    expect(bars).toHaveLength(4)
    bars.forEach((b) => expect(b).toHaveClass('motion-reduce:animate-none'))
  })
})

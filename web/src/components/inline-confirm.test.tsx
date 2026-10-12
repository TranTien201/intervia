import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InlineConfirm } from './InlineConfirm'

function setup(props: Partial<Parameters<typeof InlineConfirm>[0]> = {}) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(
    <InlineConfirm
      title="Xóa phiên?"
      description="Không hoàn tác được."
      confirmLabel="Xóa phiên và dữ liệu"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />,
  )
  return { onConfirm, onCancel }
}

describe('InlineConfirm', () => {
  it('is labelled and focuses the safe button first', () => {
    setup()
    expect(screen.getByRole('alertdialog', { name: 'Xóa phiên?' })).toHaveAccessibleDescription(
      'Không hoàn tác được.',
    )
    expect(screen.getByRole('button', { name: 'Giữ lại' })).toHaveFocus()
  })

  it('confirms and cancels', async () => {
    const { onConfirm, onCancel } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Xóa phiên và dữ liệu' }))
    expect(onConfirm).toHaveBeenCalledOnce()
    await userEvent.click(screen.getByRole('button', { name: 'Giữ lại' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('cancels with Escape', async () => {
    const { onCancel } = setup()
    await userEvent.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('blocks both buttons and Escape while pending', async () => {
    const { onConfirm, onCancel } = setup({ pending: true })
    expect(screen.getByRole('button', { name: 'Xóa phiên và dữ liệu' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Giữ lại' })).toBeDisabled()
    screen.getByRole('alertdialog').focus()
    await userEvent.keyboard('{Escape}')
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('lists affected data and collapses the rest', () => {
    setup({
      affected: {
        summary: 'CV này được dùng trong 7 phiên.',
        items: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'],
        moreLabel: (n) => `và ${n} phiên khác`,
      },
    })
    expect(screen.getByText('CV này được dùng trong 7 phiên.')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(6)
    expect(screen.getByText('và 2 phiên khác')).toBeInTheDocument()
  })

  it('uses a non-danger button for stopping an interview', () => {
    setup({ tone: 'default', confirmLabel: 'Dừng phỏng vấn', cancelLabel: 'Tiếp tục' })
    expect(screen.getByRole('button', { name: 'Dừng phỏng vấn' })).toHaveAttribute(
      'data-variant',
      'default',
    )
  })
})

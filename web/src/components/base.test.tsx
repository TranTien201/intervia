import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { KebabMenu } from './KebabMenu'
import { StatusDot } from './StatusDot'
import { TagInput } from './Tag'
import { WeightBar } from './WeightBar'
import { Button } from './ui/button'

function Tags({ initial = ['Python'] }: { initial?: string[] }) {
  const [v, setV] = useState(initial)
  return <TagInput value={v} onChange={setV} />
}

describe('Button', () => {
  it('blocks clicks while loading', async () => {
    const onClick = vi.fn()
    render(
      <Button loading onClick={onClick}>
        Tiếp tục
      </Button>,
    )
    const btn = screen.getByRole('button', { name: 'Tiếp tục' })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('aria-busy', 'true')
    await userEvent.click(btn)
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('TagInput', () => {
  it('adds a tag with Enter and ignores duplicates', async () => {
    render(<Tags />)
    await userEvent.click(screen.getByRole('button', { name: 'Thêm' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Thêm' }), 'Redis{Enter}python{Enter}')
    expect(screen.getByText('Redis')).toBeInTheDocument()
    expect(screen.getAllByText(/python/i)).toHaveLength(1)
  })

  it('removes a tag with its ✕ button', async () => {
    render(<Tags initial={['Python', 'Docker']} />)
    await userEvent.click(screen.getByRole('button', { name: 'Xóa Docker' }))
    expect(screen.queryByText('Docker')).not.toBeInTheDocument()
    expect(screen.getByText('Python')).toBeInTheDocument()
  })

  it('cancels with Escape', async () => {
    render(<Tags />)
    await userEvent.click(screen.getByRole('button', { name: 'Thêm' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Thêm' }), 'Kafka{Escape}')
    expect(screen.queryByText('Kafka')).not.toBeInTheDocument()
  })
})

describe('StatusDot', () => {
  it('always has text for screen readers', () => {
    render(<StatusDot status="in_progress" />)
    expect(screen.getByText('Đang dở')).toHaveClass('sr-only')
  })
})

describe('KebabMenu', () => {
  it('opens and runs the selected action', async () => {
    const onDelete = vi.fn()
    render(
      <KebabMenu
        label="Tùy chọn cho CV"
        items={[{ label: 'Xóa', danger: true, onSelect: onDelete }]}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Tùy chọn cho CV' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Xóa' }))
    expect(onDelete).toHaveBeenCalledOnce()
  })
})

describe('WeightBar', () => {
  it('exposes the value as a meter and clamps it', () => {
    render(<WeightBar value={1.4} name="Database" />)
    expect(screen.getByRole('meter', { name: 'Database' })).toHaveAttribute('aria-valuenow', '100')
  })
})

import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { SESSION_STEPS, Stepper } from './Stepper'

function setup(current: number) {
  render(
    <MemoryRouter>
      <Stepper
        current={current}
        steps={SESSION_STEPS.map((label, i) => ({ label, href: `/step/${i + 1}` }))}
      />
    </MemoryRouter>,
  )
  return within(screen.getByRole('list'))
}

describe('Stepper', () => {
  it('links back to done steps only', () => {
    const list = setup(1)
    expect(list.getByRole('link', { name: /Chọn CV & JD/ })).toHaveAttribute('href', '/step/1')
    expect(list.getAllByRole('link')).toHaveLength(1)
    expect(list.getByText('Đối chiếu').parentElement).toHaveAttribute('aria-current', 'step')
    expect(list.getByText('Kế hoạch').closest('a')).toBeNull()
  })

  it('marks done steps for screen readers', () => {
    const list = setup(2)
    expect(list.getAllByText('(đã xong)')).toHaveLength(2)
  })

  it('has the compact mobile label', () => {
    setup(1)
    expect(screen.getByText(/Bước 2\/3/)).toHaveTextContent('Bước 2/3 · Đối chiếu')
  })
})

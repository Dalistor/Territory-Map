// The "publicador + data" form, extracted from `HomeScreen` (spec 0010, Task
// 08) so the block work panel can reuse it. `window.api` is a fake stubbed
// with `vi.stubGlobal`, per the convention the other renderer tests follow.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Publisher } from '../../shared/models'
import { MarkWorkedForm } from './MarkWorkedForm'

const TODAY = new Date(2026, 7, 19, 10, 30)

function makePublisher(overrides: Partial<Publisher> = {}): Publisher {
  return { id: 'publisher-1', name: 'Ana', isActive: true, ...overrides }
}

/** Stubs only what this component touches: `window.api.publishers.list`. */
function stubPublishers(list: () => Promise<Publisher[]>): void {
  vi.stubGlobal('api', { publishers: { list: vi.fn(list) } })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('MarkWorkedForm', () => {
  it('lists the publishers it loaded', async () => {
    stubPublishers(async () => [
      makePublisher(),
      makePublisher({ id: 'publisher-2', name: 'Bruno' })
    ])

    render(<MarkWorkedForm now={TODAY} onConfirm={vi.fn()} onCancel={vi.fn()} />)

    const select = await screen.findByLabelText('Publicador')
    expect(within(select).getByRole('option', { name: 'Ana' })).toBeInTheDocument()
    expect(within(select).getByRole('option', { name: 'Bruno' })).toBeInTheDocument()
  })

  it('preselects the publisher given by prop', async () => {
    stubPublishers(async () => [
      makePublisher(),
      makePublisher({ id: 'publisher-2', name: 'Bruno' })
    ])

    render(
      <MarkWorkedForm
        now={TODAY}
        preselectedPublisherId="publisher-2"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(await screen.findByLabelText('Publicador')).toHaveValue('publisher-2')
  })

  it('preselects nobody when no publisher is given', async () => {
    stubPublishers(async () => [makePublisher()])

    render(<MarkWorkedForm now={TODAY} onConfirm={vi.fn()} onCancel={vi.fn()} />)

    expect(await screen.findByLabelText('Publicador')).toHaveValue('')
  })

  it('defaults the date to today', async () => {
    stubPublishers(async () => [makePublisher()])

    render(<MarkWorkedForm now={TODAY} onConfirm={vi.fn()} onCancel={vi.fn()} />)

    expect(await screen.findByLabelText('Data')).toHaveValue('2026-08-19')
  })

  it('hands the chosen publisher and date to the caller when confirmed', async () => {
    stubPublishers(async () => [
      makePublisher(),
      makePublisher({ id: 'publisher-2', name: 'Bruno' })
    ])
    const onConfirm = vi.fn()
    const user = userEvent.setup()

    render(<MarkWorkedForm now={TODAY} onConfirm={onConfirm} onCancel={vi.fn()} />)

    await user.selectOptions(await screen.findByLabelText('Publicador'), 'publisher-2')
    await user.clear(screen.getByLabelText('Data'))
    await user.type(screen.getByLabelText('Data'), '2026-08-10')
    await user.click(screen.getByRole('button', { name: 'Marcar' }))

    expect(onConfirm).toHaveBeenCalledWith('publisher-2', new Date(2026, 7, 10))
  })

  it('hands nothing to the caller when cancelled', async () => {
    stubPublishers(async () => [makePublisher()])
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    const user = userEvent.setup()

    render(<MarkWorkedForm now={TODAY} onConfirm={onConfirm} onCancel={onCancel} />)

    await user.click(await screen.findByRole('button', { name: 'Cancelar' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('keeps the confirm button disabled while no publisher is chosen', async () => {
    stubPublishers(async () => [makePublisher()])
    const user = userEvent.setup()

    render(<MarkWorkedForm now={TODAY} onConfirm={vi.fn()} onCancel={vi.fn()} />)

    expect(await screen.findByRole('button', { name: 'Marcar' })).toBeDisabled()

    await user.selectOptions(screen.getByLabelText('Publicador'), 'publisher-1')

    expect(screen.getByRole('button', { name: 'Marcar' })).toBeEnabled()
  })

  it('reports a failure to load the publishers instead of staying silent', async () => {
    stubPublishers(async () => {
      throw new Error('Sem conexão com o servidor.')
    })

    render(<MarkWorkedForm now={TODAY} onConfirm={vi.fn()} onCancel={vi.fn()} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão com o servidor.')
  })
})

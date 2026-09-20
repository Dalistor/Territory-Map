import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Dialog } from './Dialog'

describe('Dialog', () => {
  it('exposes dialog semantics and traps focus until Escape closes it', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()

    const rendered = render(
      <Dialog title="Excluir registro" onClose={onClose}>
        <button type="button">Cancelar</button>
        <button type="button">Confirmar</button>
      </Dialog>
    )

    const dialog = screen.getByRole('dialog', { name: 'Excluir registro' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus()

    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Confirmar' })).toHaveFocus()
    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledOnce()
    rendered.unmount()
    expect(opener).toHaveFocus()
    opener.remove()
  })
})

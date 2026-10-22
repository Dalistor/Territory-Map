// Test-only helpers for the app's confirmation dialog (`useConfirm`).
import { screen, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'

/** Waits for the open confirmation dialog and returns it. */
export async function findConfirmDialog(): Promise<HTMLElement> {
  const dialogs = await screen.findAllByRole('dialog')
  const dialog = dialogs.find((element) => element.classList.contains('confirm-dialog'))
  if (dialog === undefined) throw new Error('No confirmation dialog is open.')
  return dialog
}

/** Answers the open confirmation: the named confirm button, or "Cancelar". Returns its text. */
export async function answerConfirm(user: UserEvent, accept: boolean): Promise<string> {
  const dialog = await findConfirmDialog()
  const text = dialog.textContent ?? ''
  const button = accept
    ? dialog.querySelector<HTMLButtonElement>('[data-confirm]')
    : within(dialog).getByRole('button', { name: 'Cancelar' })
  if (button === null) throw new Error('The confirmation has no confirm button.')
  await user.click(button)
  return text
}

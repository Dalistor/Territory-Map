import { useCallback, useRef, useState } from 'react'
import { Dialog } from './Dialog'

export interface ConfirmRequest {
  /**
   * The consequences, as written for the admin. Without a `title`, the first
   * paragraph (up to the first blank line) is the question and becomes the
   * dialog's title.
   */
  readonly message: string
  /** The question, when `message` does not open with one. */
  readonly title?: string
  /** Names the result ("Apagar quadra"), never a bare "OK". */
  readonly confirmLabel: string
  /** Destroys or discards something: the confirm button takes the danger style. */
  readonly danger?: boolean
}

interface PendingConfirm extends ConfirmRequest {
  readonly resolve: (accepted: boolean) => void
}

function splitMessage(request: ConfirmRequest): { title: string; body: string[] } {
  const paragraphs = request.message.split('\n\n')
  if (request.title !== undefined) return { title: request.title, body: paragraphs }
  const [title = '', ...rest] = paragraphs
  return { title, body: rest }
}

/**
 * The app's own confirmation, in place of `window.confirm`: same text, an
 * explicit consequence on the button, Escape or "Cancelar" to back out, and
 * focus restored to whatever asked. `confirm()` resolves `true` only on the
 * explicit confirm button. Render `confirmDialog` once in the caller's tree.
 */
export function useConfirm(): {
  readonly confirm: (request: ConfirmRequest) => Promise<boolean>
  readonly confirmDialog: React.ReactNode
} {
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  const pendingRef = useRef<PendingConfirm | null>(null)

  const confirm = useCallback(
    (request: ConfirmRequest) =>
      new Promise<boolean>((resolve) => {
        // A second request replaces an unanswered one, which counts as declined.
        pendingRef.current?.resolve(false)
        const next = { ...request, resolve }
        pendingRef.current = next
        setPending(next)
      }),
    []
  )

  const answer = (accepted: boolean): void => {
    const current = pendingRef.current
    pendingRef.current = null
    setPending(null)
    current?.resolve(accepted)
  }

  let confirmDialog: React.ReactNode = null
  if (pending !== null) {
    const { title, body } = splitMessage(pending)
    confirmDialog = (
      <Dialog title={title} size="md" className="confirm-dialog" onClose={() => answer(false)}>
        {body.map((paragraph, index) => (
          <p key={index} className="confirm-dialog-text">
            {paragraph}
          </p>
        ))}
        <div className="dialog-actions">
          <button type="button" onClick={() => answer(false)}>
            Cancelar
          </button>
          <button
            type="button"
            data-confirm=""
            className={pending.danger ? 'button-danger' : 'button-primary'}
            onClick={() => answer(true)}
          >
            {pending.confirmLabel}
          </button>
        </div>
      </Dialog>
    )
  }

  return { confirm, confirmDialog }
}

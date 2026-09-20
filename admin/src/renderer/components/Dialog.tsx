import { useEffect, useId, useRef } from 'react'

const FOCUSABLE_SELECTOR =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

export interface DialogProps {
  readonly title: string
  readonly children: React.ReactNode
  readonly onClose: () => void
  readonly className?: string
}

export function Dialog({ title, children, onClose, className }: DialogProps): React.JSX.Element {
  const dialogRef = useRef<HTMLDivElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const titleId = useId()

  useEffect(() => {
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = dialogRef.current
    const firstFocusable = dialog?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
    ;(firstFocusable ?? dialog)?.focus()

    return () => restoreFocusRef.current?.focus()
  }, [])

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab') return

    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []
    )
    if (focusable.length === 0) {
      event.preventDefault()
      dialogRef.current?.focus()
      return
    }
    const currentIndex = focusable.indexOf(document.activeElement as HTMLElement)
    const nextIndex = event.shiftKey
      ? currentIndex <= 0
        ? focusable.length - 1
        : currentIndex - 1
      : currentIndex === focusable.length - 1
        ? 0
        : currentIndex + 1
    event.preventDefault()
    focusable[nextIndex]?.focus()
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.stopPropagation()}>
      <div
        ref={dialogRef}
        className={className}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </div>
  )
}

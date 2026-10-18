import { useEffect, useId, useRef } from 'react'
import { Icon } from './Icon'

const FOCUSABLE_SELECTOR =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

export interface DialogProps {
  readonly title: string
  readonly children: React.ReactNode
  readonly onClose: () => void
  readonly className?: string
  /** `sm` is the default confirmation/form width; `xl` is a workspace in a modal. */
  readonly size?: 'sm' | 'md' | 'xl'
  /** A small label above the title, naming what kind of thing the dialog is about. */
  readonly eyebrow?: string
  /** Badges or short facts rendered beside the title. */
  readonly titleAside?: React.ReactNode
  /** Renders an icon button in the header that closes the dialog, labelled with this text. */
  readonly closeLabel?: string
}

export function Dialog({
  title,
  children,
  onClose,
  className,
  size = 'sm',
  eyebrow,
  titleAside,
  closeLabel
}: DialogProps): React.JSX.Element {
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
    // A dialog can open another one on top of it (editing an assignment from
    // the territory dialog). Stopping here keeps Escape and the focus trap to
    // the innermost dialog instead of letting the outer one react as well.
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    event.stopPropagation()

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
        className={['dialog', `dialog-${size}`, className].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        {eyebrow === undefined && titleAside === undefined && closeLabel === undefined ? (
          <h2 id={titleId}>{title}</h2>
        ) : (
          <div className="dialog-header">
            <div className="dialog-header-text">
              {eyebrow !== undefined && <p className="eyebrow">{eyebrow}</p>}
              <div className="dialog-title-row">
                <h2 id={titleId}>{title}</h2>
                {titleAside}
              </div>
            </div>
            {closeLabel !== undefined && (
              <button
                type="button"
                className="icon-button dialog-close"
                aria-label={closeLabel}
                title={closeLabel}
                onClick={onClose}
              >
                <Icon name="close" size={18} />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

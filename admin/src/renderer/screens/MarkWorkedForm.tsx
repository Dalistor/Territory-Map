// The "publicador + data" form of a block marking, extracted from
// `HomeScreen` (spec 0009, Task 10) so the block work panel of spec 0010 can
// reuse it instead of growing a second copy.
//
// It loads the publishers itself -- both callers need exactly that list and
// nothing else -- but it deliberately does **not** call
// `window.api.workLogs.markWorked`: it hands the chosen pair back through
// `onConfirm` and lets the caller do the writing. The Home shows a failed
// marking in its own `role="alert"` and reloads the map; the work panel of
// Task 09 lives on another page and reacts differently. Knowing which of the
// two it is inside of would be exactly the coupling this extraction removes.
import { useEffect, useState } from 'react'
import type { Publisher } from '../../shared/models'
import { parseIpcError } from '../../shared/ipc-error'

const LOAD_ERROR_FALLBACK = 'Não foi possível completar a operação.'

/**
 * A `Date` as `<input type="date">` wants it: `YYYY-MM-DD` in the admin's own
 * timezone. `toISOString()` would answer in UTC, which lands on the previous
 * day for anyone west of Greenwich -- Brazil included.
 */
function toDateInputValue(date: Date): string {
  const two = (value: number): string => value.toString().padStart(2, '0')
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`
}

/**
 * The inverse of {@link toDateInputValue}: local midnight of the day the admin
 * picked. Deliberately not `new Date(value)`, which reads the string as UTC.
 */
function fromDateInputValue(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export interface MarkWorkedFormProps {
  /**
   * The publisher to start with -- the one the territory is assigned to is the
   * right guess almost every time. Absent means nobody is preselected, and the
   * admin has to choose before confirming.
   */
  readonly preselectedPublisherId?: string
  /** Overridable so a test can pin what counts as "today". */
  readonly now?: Date
  /** The chosen pair. Writing it to the server is the caller's job, not this form's. */
  readonly onConfirm: (publisherId: string, workedAt: Date) => void
  readonly onCancel: () => void
  readonly isSubmitting?: boolean
}

export function MarkWorkedForm({
  preselectedPublisherId,
  now,
  onConfirm,
  onCancel,
  isSubmitting = false
}: MarkWorkedFormProps): React.JSX.Element {
  const [publishers, setPublishers] = useState<Publisher[]>([])
  const [publisherId, setPublisherId] = useState(preselectedPublisherId ?? '')
  const [workedAtValue, setWorkedAtValue] = useState(() => toDateInputValue(now ?? new Date()))
  const [loadError, setLoadError] = useState<string | null>(null)

  // Everything this effect sets happens inside a `.then`/`.catch`, after the
  // effect body itself has returned -- the initial state above is already the
  // clean one, so there is nothing to reset synchronously here.
  useEffect(() => {
    let cancelled = false
    window.api.publishers
      .list()
      .then((list) => {
        if (!cancelled) setPublishers(list)
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(parseIpcError(error, LOAD_ERROR_FALLBACK).message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="block-mark-worked">
      {loadError !== null && <p role="alert">{loadError}</p>}
      <label className="field">
        <span>Publicador</span>
        <select value={publisherId} onChange={(event) => setPublisherId(event.target.value)}>
          <option value="">Selecione…</option>
          {publishers.map((publisher) => (
            <option key={publisher.id} value={publisher.id}>
              {publisher.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Data</span>
        <input
          type="date"
          value={workedAtValue}
          onChange={(event) => setWorkedAtValue(event.target.value)}
        />
      </label>
      <div className="block-mark-worked-actions">
        <button
          type="button"
          className="button-primary"
          disabled={publisherId === '' || workedAtValue === '' || isSubmitting}
          onClick={() => onConfirm(publisherId, fromDateInputValue(workedAtValue))}
        >
          {isSubmitting ? 'Registrando…' : 'Marcar'}
        </button>
        <button type="button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

export default MarkWorkedForm

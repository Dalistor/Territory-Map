// The work panel of a single block: its history, the admin's power to correct
// that history, and the forced status that overrides the colour the dates
// would produce.
//
// A component, not a routed screen: spec 0010 expands it inside a row of the
// block table in `TerritorySettingsScreen`. It receives the territory and the
// block as props, talks only to `window.api`, and reports back through
// `onChanged` whenever something that changes the block's colour happens --
// knowing that the page above needs to reload is the caller's business, the
// same split `BlockHistorySheet` already makes with `onWorkLogDeleted`.
import { useCallback, useEffect, useState } from 'react'
import type { Block, BlockStatusOverride, Territory, WorkLog } from '../../shared/models'
import { workLogWasSyncedLate } from '../../shared/models'
import { parseIpcError } from '../../shared/ipc-error'
import { MarkWorkedForm } from './MarkWorkedForm'

const GENERIC_ERROR_MESSAGE = 'Não foi possível completar a operação.'

/**
 * The value of the status `<select>`. `'auto'` is the absence of an override,
 * spelled out because an `<option>` needs a string -- it maps to `null` on the
 * way to the API, which is what gives the block back to the derived colour.
 */
type StatusChoice = 'auto' | BlockStatusOverride

const STATUS_OPTIONS: ReadonlyArray<{ value: StatusChoice; label: string }> = [
  { value: 'auto', label: 'Automático' },
  { value: 'overdue', label: 'Vencida (laranja)' },
  { value: 'never', label: 'Nunca trabalhada (vermelha)' }
]

/** `dd/mm/yyyy hh:mm` in local time -- the same reading `BlockHistorySheet` gives. */
function formatDateTime(moment: Date): string {
  const two = (value: number): string => value.toString().padStart(2, '0')
  return `${two(moment.getDate())}/${two(moment.getMonth() + 1)}/${moment.getFullYear()} ${two(moment.getHours())}:${two(moment.getMinutes())}`
}

function errorMessage(error: unknown, fallback: string): string {
  return parseIpcError(error, fallback).message
}

export interface BlockWorkPanelProps {
  readonly territory: Territory
  readonly block: Block
  /** Overridable so a test can pin what the form counts as "today". */
  readonly now?: Date
  /**
   * Fired after anything that changes the block's colour on the map: a work
   * record added or removed, or the forced status changed. The panel does not
   * reload the page above -- it only says that something moved.
   */
  readonly onChanged?: () => void
}

export function BlockWorkPanel({
  territory,
  block,
  now,
  onChanged
}: BlockWorkPanelProps): React.JSX.Element {
  const [logs, setLogs] = useState<WorkLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [status, setStatus] = useState<StatusChoice>(block.statusOverride ?? 'auto')

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      // The server already answers most recent first (the index the work log
      // repository orders by), so the panel renders what it received instead
      // of sorting a second time and inventing a second source of order.
      setLogs(await window.api.workLogs.listFor(block.id))
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível carregar o histórico.'))
    } finally {
      setIsLoading(false)
    }
  }, [block.id])

  useEffect(() => {
    // Same reasoning as `BlockHistorySheet`: this project fetches from the
    // renderer through `window.api`, with no Suspense boundary above, so
    // "load on mount, setState when the promise settles" is the pattern here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const pendingLog = logs.find((log) => log.id === pendingDeleteId) ?? null

  async function addWorkLog(publisherId: string, workedAt: Date): Promise<void> {
    setError(null)
    try {
      await window.api.workLogs.markWorked(block.id, publisherId, workedAt)
      setIsAdding(false)
      await load()
      onChanged?.()
    } catch (err) {
      setError(errorMessage(err, GENERIC_ERROR_MESSAGE))
    }
  }

  async function confirmDelete(log: WorkLog): Promise<void> {
    setPendingDeleteId(null)
    setError(null)
    try {
      await window.api.workLogs.delete(log.id)
      await load()
      onChanged?.()
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível remover o registro.'))
    }
  }

  async function changeStatus(choice: StatusChoice): Promise<void> {
    const previous = status
    setStatus(choice)
    setError(null)
    try {
      await window.api.blocks.update(block.id, {
        statusOverride: choice === 'auto' ? null : choice
      })
      onChanged?.()
    } catch (err) {
      // The control goes back to what the server still holds -- leaving it on
      // the refused choice would show the admin a status the block does not
      // have.
      setStatus(previous)
      setError(errorMessage(err, 'Não foi possível alterar o status da quadra.'))
    }
  }

  return (
    <div className="block-work-panel">
      {error !== null && <p role="alert">{error}</p>}

      <section className="block-work-status">
        <label className="field">
          <span>Status da quadra</span>
          <select
            value={status}
            onChange={(event) => void changeStatus(event.target.value as StatusChoice)}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <p className="block-work-status-note">
          A cor forçada vale no mapa do admin e no celular do publicador, acima do cálculo por data.
          O primeiro registro de trabalho novo devolve a quadra ao automático.
        </p>
      </section>

      <section className="block-work-history">
        {isLoading ? (
          <p>Carregando…</p>
        ) : logs.length === 0 ? (
          <p>Esta quadra nunca foi trabalhada.</p>
        ) : (
          <ul>
            {logs.map((log) => (
              <li key={log.id}>
                <span>{log.publisher.name}</span>
                <span>{formatDateTime(log.workedAt)}</span>
                {workLogWasSyncedLate(log) && (
                  <span> sincronizado em {formatDateTime(log.createdAt)}</span>
                )}
                <button
                  type="button"
                  aria-label={`Remover registro de ${log.publisher.name} em ${formatDateTime(log.workedAt)}`}
                  onClick={() => setPendingDeleteId(log.id)}
                >
                  Remover
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isAdding ? (
        <MarkWorkedForm
          now={now}
          // The territory's publisher is the right guess almost every time,
          // but the admin can still record someone else's work.
          preselectedPublisherId={territory.assignedUser?.id}
          onConfirm={(publisherId, workedAt) => void addWorkLog(publisherId, workedAt)}
          onCancel={() => setIsAdding(false)}
        />
      ) : (
        <button type="button" onClick={() => setIsAdding(true)}>
          Adicionar registro
        </button>
      )}

      {pendingLog && (
        <div role="dialog" aria-label="Remover registro?">
          <p>
            A marcação de {pendingLog.publisher.name} em {formatDateTime(pendingLog.workedAt)} será
            apagada, e a data da última visita da quadra será recalculada.
          </p>
          <div className="dialog-actions">
            <button type="button" onClick={() => setPendingDeleteId(null)}>
              Cancelar
            </button>
            <button type="button" onClick={() => void confirmDelete(pendingLog)}>
              Remover
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default BlockWorkPanel

// Ports `admin/lib/presentation/block_history_sheet.dart` (removed Flutter
// admin): the visits recorded on one block, and the admin's power to correct
// them.
//
// The app can only ever add a work log; removing one is the admin's alone,
// and deleting it makes the server recompute `Block.lastWorkedAt` from
// whatever is left. That is why a successful deletion calls `onWorkLogDeleted`
// -- it is not this screen's job to know that the map needs to recolor the
// block, only to say that something changed.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Block, Territory, WorkLog } from '../../shared/models'
import { workLogWasSyncedLate } from '../../shared/models'
import { parseIpcError } from '../../shared/ipc-error'
import { Dialog } from '../components/Dialog'

export interface BlockHistorySheetProps {
  readonly territory: Territory
  readonly block: Block
  /**
   * Lets the caller invalidate whatever list of territories feeds the map, so
   * the block's colour follows the recomputed `lastWorkedAt`. Not this
   * screen's job to fetch territories itself.
   */
  readonly onWorkLogDeleted?: () => void
}

/** `dd/mm/yyyy hh:mm` in local time -- mirrors `_formatDate` from the removed Dart sheet. */
function formatDateTime(moment: Date): string {
  const two = (value: number): string => value.toString().padStart(2, '0')
  return `${two(moment.getDate())}/${two(moment.getMonth() + 1)}/${moment.getFullYear()} ${two(moment.getHours())}:${two(moment.getMinutes())}`
}

function errorMessage(error: unknown, fallback: string): string {
  return parseIpcError(error, fallback).message
}

export function BlockHistorySheet({
  territory,
  block,
  onWorkLogDeleted
}: BlockHistorySheetProps): React.JSX.Element {
  const [logs, setLogs] = useState<WorkLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const deleteInFlight = useRef(false)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await window.api.workLogs.listFor(block.id)
      setLogs(result)
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível carregar o histórico.'))
    } finally {
      setIsLoading(false)
    }
  }, [block.id])

  useEffect(() => {
    // `react-hooks/set-state-in-effect` flags any effect whose callback
    // transitively calls a state setter, even one reached only after an
    // `await` -- it is written for a `use()`/Suspense data-fetching model.
    // This screen's architecture (Task 07, spec 0003) has `renderer/` fetch
    // through `window.api` directly, with no Suspense boundary above it, so
    // "load on mount, setState when the promise settles" is the correct
    // pattern here, not the cascading-render case the rule targets.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const pendingLog = logs.find((log) => log.id === pendingDeleteId) ?? null

  async function confirmDelete(log: WorkLog): Promise<void> {
    if (deleteInFlight.current) return
    deleteInFlight.current = true
    setIsDeleting(true)
    setPendingDeleteId(null)
    setError(null)
    try {
      await window.api.workLogs.delete(log.id)
      await load()
      onWorkLogDeleted?.()
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível remover o registro.'))
    } finally {
      deleteInFlight.current = false
      setIsDeleting(false)
    }
  }

  // Same header/main shell as the other routed screens (HomeScreen,
  // DesignationsScreen), so the sheet inherits the shared chrome spacing
  // instead of sitting edge-to-edge inside the pushed screen.
  return (
    <div className="screen screen-block-history">
      <header className="screen-header">
        <div className="screen-title-block">
          <p className="eyebrow">Histórico da quadra</p>
          <h2>
            Quadra {block.number} — {territory.name}
          </h2>
        </div>
      </header>
      <main className="screen-body">
        {error && <p role="alert">{error}</p>}
        {isLoading ? (
          <p>Carregando…</p>
        ) : logs.length === 0 ? (
          <p>Esta quadra nunca foi trabalhada.</p>
        ) : (
          <ul className="record-list">
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
                  className="button-danger button-quiet"
                  disabled={isDeleting}
                  onClick={() => setPendingDeleteId(log.id)}
                >
                  Remover
                </button>
              </li>
            ))}
          </ul>
        )}
        {pendingLog && (
          <Dialog title="Remover registro?" onClose={() => setPendingDeleteId(null)}>
            <p>
              A marcação de {pendingLog.publisher.name} em {formatDateTime(pendingLog.workedAt)}{' '}
              será apagada, e a data da última visita da quadra será recalculada.
            </p>
            <div className="dialog-actions">
              <button type="button" onClick={() => setPendingDeleteId(null)}>
                Cancelar
              </button>
              <button type="button" disabled={isDeleting} onClick={() => confirmDelete(pendingLog)}>
                {isDeleting ? 'Removendo…' : 'Remover'}
              </button>
            </div>
          </Dialog>
        )}
      </main>
    </div>
  )
}

export default BlockHistorySheet

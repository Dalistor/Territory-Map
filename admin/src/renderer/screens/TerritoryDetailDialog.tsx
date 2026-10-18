// Everything about one territory, in a modal over the territory table: the
// S-13 card (who has it, since when, and the past), its blocks, and its map.
//
// The header strip always shows the assignment in force with the actions that
// apply to it -- edit, complete, or designate when the territory is free --
// so the most common corrections never depend on which tab is open. The tabs
// below are the detail: "Quadras" (marking in the leader's name), "Designações"
// (designate and the history) and "Mapa".
import { useCallback, useEffect, useRef, useState } from 'react'
import type { LatLngTuple } from 'leaflet'
import type { Assignment, Publisher, Territory } from '../../shared/models'
import { assignmentIsOpen } from '../../shared/models'
import { parseIpcError } from '../../shared/ipc-error'
import { blockColorCategory, type BlockColorCategory } from '../map/blockColor'
import { TerritoryMap } from '../map/TerritoryMap'
import { Dialog } from '../components/Dialog'
import { Icon } from '../components/Icon'
import { TerritoryBlocksTab } from './TerritoryBlocksTab'
import { daysSince, formatDaysAgo, fromDateInputValue, toDateInputValue } from './territoryBlocks'

const GENERIC_ERROR_MESSAGE = 'Não foi possível completar a operação.'

function errorMessage(error: unknown): string {
  return parseIpcError(error, GENERIC_ERROR_MESSAGE).message
}

/** The one place a date is turned into text in this dialog. */
function formatDate(date: Date): string {
  return date.toLocaleDateString()
}

/**
 * `assignmentIsOpen`'s complement, narrowed: everything that is not open
 * provably has a `completedAt`, which keeps the history rows free of a
 * "and if there is no completion date?" branch that could never run.
 */
function assignmentIsCompleted(
  assignment: Assignment
): assignment is Assignment & { readonly completedAt: Date } {
  return !assignmentIsOpen(assignment)
}

function completeConfirmMessage(territory: Territory, leaderName: string): string {
  return (
    `Marcar a designação de ${leaderName} em "${territory.name}" como concluída?\n\n` +
    'O território fica livre para outro publicador, e ' +
    `${leaderName} perde na hora o acesso para marcar quadras nele.`
  )
}

function replaceConfirmMessage(
  territory: Territory,
  currentName: string,
  nextName: string
): string {
  return (
    `Designar "${territory.name}" a ${nextName}?\n\n` +
    `A designação atual, de ${currentName}, será encerrada com a data de hoje.`
  )
}

function deleteAssignmentConfirmMessage(assignment: Assignment): string {
  return (
    `Apagar a designação de ${assignment.publisher.name}?\n\n` +
    'O registro sai do histórico como se não tivesse existido. Não há como desfazer.'
  )
}

/** Noon UTC of the picked day: the day survives any timezone the server reads it in. */
function dayAtNoonUtc(value: string): Date {
  const local = fromDateInputValue(value)
  return new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate(), 12))
}

type DetailTab = 'blocks' | 'assignments' | 'map'

const TABS: ReadonlyArray<{ value: DetailTab; label: string }> = [
  { value: 'blocks', label: 'Quadras' },
  { value: 'assignments', label: 'Designações' },
  { value: 'map', label: 'Mapa' }
]

export interface TerritoryDetailDialogProps {
  /** Always the latest copy from the caller's list, so a reload shows up here. */
  readonly territory: Territory
  readonly fallbackCenter?: LatLngTuple
  /** Overridable so a test can pin what counts as "today". */
  readonly now?: Date
  readonly initialTab?: DetailTab
  readonly onClose: () => void
  /** Reloads the caller's territory list; every write here changes it. */
  readonly onChanged: () => Promise<void>
}

export function TerritoryDetailDialog({
  territory,
  fallbackCenter,
  now,
  initialTab = 'blocks',
  onClose,
  onChanged
}: TerritoryDetailDialogProps): React.JSX.Element {
  const today = now ?? new Date()
  const [tab, setTab] = useState<DetailTab>(initialTab)
  const [focusBlockId, setFocusBlockId] = useState<string | null>(null)
  const [publishers, setPublishers] = useState<Publisher[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [hasLoaded, setHasLoaded] = useState(false)
  const [selectedPublisherId, setSelectedPublisherId] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [isActionPending, setIsActionPending] = useState(false)
  const actionInFlight = useRef(false)

  const [editing, setEditing] = useState<Assignment | null>(null)
  const [editPublisherId, setEditPublisherId] = useState('')
  const [editStartedAt, setEditStartedAt] = useState('')
  const [editCompletedAt, setEditCompletedAt] = useState('')
  const [editReopen, setEditReopen] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const territoryId = territory.id

  const loadAssignments = useCallback(async () => {
    setAssignments(await window.api.assignments.listFor(territoryId))
  }, [territoryId])

  // Fetched fresh on every open: the admin may have registered or deactivated
  // somebody since the territory list loaded. Every state update happens in
  // the `.then`, after the effect body returned, guarded against unmount.
  useEffect(() => {
    let cancelled = false
    Promise.all([window.api.publishers.list(), window.api.assignments.listFor(territoryId)])
      .then(([publisherList, assignmentList]) => {
        if (cancelled) return
        setPublishers(publisherList)
        setAssignments(assignmentList)
        setHasLoaded(true)
      })
      .catch((error: unknown) => {
        if (!cancelled) setActionError(errorMessage(error))
      })
    return () => {
      cancelled = true
    }
  }, [territoryId])

  /** Turns a rejected write into a visible `role="alert"`, never an unhandled rejection. */
  const runAction = useCallback(async (action: () => Promise<void>) => {
    if (actionInFlight.current) return
    actionInFlight.current = true
    setIsActionPending(true)
    setActionError(null)
    try {
      await action()
    } catch (error) {
      setActionError(errorMessage(error))
    } finally {
      actionInFlight.current = false
      setIsActionPending(false)
    }
  }, [])

  const runConfirmed = useCallback(
    (message: string, action: () => Promise<void>) => {
      if (!window.confirm(message)) return Promise.resolve()
      return runAction(action)
    },
    [runAction]
  )

  /**
   * Every write refreshes both sides: this history, and the caller's list --
   * `Territory.assignedUser` and `assignedSince` are projections of the open
   * assignment on the server, so they move too.
   */
  const reloadAfterAction = useCallback(async () => {
    await loadAssignments()
    await onChanged()
  }, [loadAssignments, onChanged])

  const activePublishers = publishers.filter((publisher) => publisher.isActive)
  const openAssignment = assignments.find(assignmentIsOpen)
  const history = assignments.filter(assignmentIsCompleted)

  const designate = (): Promise<void> => {
    if (selectedPublisherId === '') return Promise.resolve()
    const publisherId = selectedPublisherId
    const run = async (): Promise<void> => {
      await window.api.assignments.designate(territoryId, publisherId)
      setSelectedPublisherId('')
      await reloadAfterAction()
    }
    // Only replacing somebody is destructive enough to ask about: the current
    // assignment gets closed with today's date. A free territory loses nothing.
    if (openAssignment === undefined) return runAction(run)
    const nextName =
      publishers.find((publisher) => publisher.id === publisherId)?.name ?? 'este publicador'
    return runConfirmed(
      replaceConfirmMessage(territory, openAssignment.publisher.name, nextName),
      run
    )
  }

  const complete = (): Promise<void> => {
    if (openAssignment === undefined) return Promise.resolve()
    return runConfirmed(
      completeConfirmMessage(territory, openAssignment.publisher.name),
      async () => {
        await window.api.assignments.complete(territoryId)
        await reloadAfterAction()
      }
    )
  }

  const deleteAssignment = (assignment: Assignment): Promise<void> =>
    runConfirmed(deleteAssignmentConfirmMessage(assignment), async () => {
      await window.api.assignments.delete(territoryId, assignment.id)
      await reloadAfterAction()
    })

  function openEdit(assignment: Assignment): void {
    setEditing(assignment)
    setEditPublisherId(assignment.publisher.id)
    setEditStartedAt(toDateInputValue(assignment.startedAt))
    setEditCompletedAt(assignment.completedAt ? toDateInputValue(assignment.completedAt) : '')
    setEditReopen(false)
    setEditError(null)
  }

  async function submitEdit(): Promise<void> {
    if (editing === null) return
    const isCompleted = !assignmentIsOpen(editing) && !editReopen
    const todayValue = toDateInputValue(today)
    if (editPublisherId === '') return setEditError('Selecione um publicador.')
    if (editStartedAt === '') return setEditError('Informe a data de retirada.')
    if (editStartedAt > todayValue)
      return setEditError('A data de retirada não pode estar no futuro.')
    if (isCompleted && editCompletedAt === '') return setEditError('Informe a data de devolução.')
    if (isCompleted && editStartedAt > editCompletedAt) {
      return setEditError('A data de retirada precisa ser anterior ou igual à de devolução.')
    }
    setEditError(null)
    setIsActionPending(true)
    try {
      await window.api.assignments.update(territoryId, editing.id, {
        publisherId: editPublisherId,
        startedAt: dayAtNoonUtc(editStartedAt),
        completedAt: isCompleted ? dayAtNoonUtc(editCompletedAt) : undefined,
        clearCompletedAt: editReopen
      })
      setEditing(null)
      await reloadAfterAction()
    } catch (error) {
      setEditError(errorMessage(error))
    } finally {
      setIsActionPending(false)
    }
  }

  const counts = territory.blocks.reduce<Record<BlockColorCategory, number>>(
    (total, block) => {
      total[blockColorCategory(block, today, territory.rotationDays)] += 1
      return total
    },
    { recent: 0, overdue: 0, never: 0 }
  )
  const leader = openAssignment?.publisher ?? territory.assignedUser
  const since = openAssignment?.startedAt ?? territory.assignedSince
  // A publisher who left the active list still has to be offered when editing
  // a record that names them, or the select would silently show someone else.
  const editOptions =
    editing !== null && !activePublishers.some((p) => p.id === editing.publisher.id)
      ? [
          ...activePublishers,
          { id: editing.publisher.id, name: editing.publisher.name, isActive: false }
        ]
      : activePublishers

  return (
    <Dialog
      title={territory.name}
      eyebrow="Território"
      size="xl"
      className="territory-dialog"
      closeLabel="Fechar detalhes"
      titleAside={
        leader === undefined ? (
          <span className="status-badge status-idle">Livre</span>
        ) : (
          <span className="status-badge status-working">Em andamento</span>
        )
      }
      onClose={onClose}
    >
      <section className="territory-dialog-summary" aria-label="Resumo do território">
        <div className="summary-item summary-leader">
          <span className="summary-label">Dirigente atual</span>
          {leader === undefined ? (
            <span className="summary-value cell-muted">Sem dirigente</span>
          ) : (
            <span className="summary-value">
              <span className="avatar avatar-sm" aria-hidden="true">
                {leader.name.charAt(0).toUpperCase()}
              </span>
              {leader.name}
            </span>
          )}
          <div className="summary-actions">
            {!hasLoaded ? null : openAssignment !== undefined ? (
              <>
                <button
                  type="button"
                  className="button-small"
                  disabled={isActionPending}
                  aria-label={`Editar designação de ${openAssignment.publisher.name}`}
                  onClick={() => openEdit(openAssignment)}
                >
                  <Icon name="pencil" />
                  Editar
                </button>
                <button
                  type="button"
                  className="button-small"
                  disabled={isActionPending}
                  onClick={() => void complete()}
                >
                  <Icon name="checkCircle" />
                  Marcar como concluído
                </button>
              </>
            ) : (
              <button type="button" className="button-small" onClick={() => setTab('assignments')}>
                <Icon name="userPlus" />
                Designar…
              </button>
            )}
          </div>
        </div>
        <div className="summary-item">
          <span className="summary-label">Retirada</span>
          {since === undefined ? (
            <span className="summary-value cell-muted">—</span>
          ) : (
            <span className="summary-value">
              {formatDate(since)}
              <span className="cell-sub">{formatDaysAgo(daysSince(since, today))}</span>
            </span>
          )}
        </div>
        <div className="summary-item">
          <span className="summary-label">Quadras</span>
          <span className="summary-value">{territory.blocks.length}</span>
          {territory.blocks.length > 0 && (
            <span className="summary-breakdown">
              <span className="dot-label dot-recent">{counts.recent} em dia</span>
              <span className="dot-label dot-overdue">
                {counts.overdue} {counts.overdue === 1 ? 'vencida' : 'vencidas'}
              </span>
              <span className="dot-label dot-never">{counts.never} nunca</span>
            </span>
          )}
        </div>
        <div className="summary-item">
          <span className="summary-label">Último trabalho</span>
          {territory.lastWork === undefined ? (
            <span className="summary-value cell-muted">Nunca registrado</span>
          ) : (
            <span className="summary-value">
              {formatDate(territory.lastWork.workedAt)}
              <span className="cell-sub">por {territory.lastWork.publisher.name}</span>
            </span>
          )}
        </div>
      </section>

      {actionError !== null && <p role="alert">{actionError}</p>}

      <div className="tabs" role="tablist" aria-label="Detalhe do território">
        {TABS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            id={`territory-tab-${option.value}`}
            aria-selected={tab === option.value}
            aria-controls={`territory-tabpanel-${option.value}`}
            className={tab === option.value ? 'is-active' : undefined}
            onClick={() => setTab(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div
        className="territory-dialog-body"
        role="tabpanel"
        id={`territory-tabpanel-${tab}`}
        aria-labelledby={`territory-tab-${tab}`}
      >
        {tab === 'blocks' && (
          <TerritoryBlocksTab
            territory={territory}
            now={now}
            initialOpenBlockId={focusBlockId}
            onChanged={onChanged}
          />
        )}

        {tab === 'assignments' && (
          <div className="territory-assignments">
            <section className="designate-card" aria-labelledby="designate-title">
              <h3 id="designate-title">
                {openAssignment === undefined ? 'Designar a um publicador' : 'Trocar o dirigente'}
              </h3>
              {openAssignment !== undefined && (
                <p className="field-hint">
                  A designação atual, de {openAssignment.publisher.name}, será encerrada com a data
                  de hoje.
                </p>
              )}
              <div className="designate-row">
                <label className="field">
                  <span>Publicador</span>
                  <select
                    value={selectedPublisherId}
                    onChange={(event) => setSelectedPublisherId(event.target.value)}
                  >
                    <option value="">Selecione…</option>
                    {activePublishers
                      .filter((publisher) => publisher.id !== openAssignment?.publisher.id)
                      .map((publisher) => (
                        <option key={publisher.id} value={publisher.id}>
                          {publisher.name}
                        </option>
                      ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="button-primary"
                  disabled={selectedPublisherId === '' || isActionPending}
                  onClick={() => void designate()}
                >
                  {isActionPending ? 'Atualizando…' : 'Designar'}
                </button>
              </div>
            </section>

            <section aria-labelledby="assignment-history-title">
              <h3 id="assignment-history-title">Histórico do cartão S-13</h3>
              {assignments.length === 0 ? (
                <p className="cell-muted">Nenhuma designação registrada ainda.</p>
              ) : (
                <div className="data-table">
                  <div className="data-table-scroll">
                    <table aria-label="Histórico de designações">
                      <thead>
                        <tr>
                          <th scope="col">Dirigente</th>
                          <th scope="col">Retirada</th>
                          <th scope="col">Devolução</th>
                          <th scope="col">Duração</th>
                          <th scope="col" className="cell-actions">
                            <span className="visually-hidden">Ações</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...(openAssignment ? [openAssignment] : []), ...history].map(
                          (assignment) => {
                            const end = assignment.completedAt ?? today
                            return (
                              <tr key={assignment.id}>
                                <td>{assignment.publisher.name}</td>
                                <td>{formatDate(assignment.startedAt)}</td>
                                <td>
                                  {assignment.completedAt === undefined ? (
                                    <span className="status-badge status-working">
                                      Em andamento
                                    </span>
                                  ) : (
                                    formatDate(assignment.completedAt)
                                  )}
                                </td>
                                <td>{daysSince(assignment.startedAt, end)} dias</td>
                                <td className="cell-actions">
                                  <div className="row-actions">
                                    <button
                                      type="button"
                                      className="button-small button-quiet"
                                      disabled={isActionPending}
                                      aria-label={`Editar designação de ${assignment.publisher.name}`}
                                      onClick={() => openEdit(assignment)}
                                    >
                                      <Icon name="pencil" />
                                      Editar
                                    </button>
                                    <button
                                      type="button"
                                      className="button-small button-quiet button-danger"
                                      disabled={isActionPending}
                                      aria-label={`Apagar designação de ${assignment.publisher.name}`}
                                      onClick={() => void deleteAssignment(assignment)}
                                    >
                                      <Icon name="trash" />
                                      Apagar
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )
                          }
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {tab === 'map' && (
          <div className="territory-dialog-map">
            <TerritoryMap
              territories={[territory]}
              now={today}
              fallbackCenter={fallbackCenter}
              onBlockTap={(_, block) => {
                setFocusBlockId(block.id)
                setTab('blocks')
              }}
            />
          </div>
        )}
      </div>

      {editing !== null && (
        <Dialog
          title={
            assignmentIsOpen(editing) ? 'Editar designação atual' : 'Editar designação passada'
          }
          size="md"
          onClose={() => setEditing(null)}
        >
          <p className="dialog-subtitle">
            {assignmentIsOpen(editing)
              ? `Corrija o dirigente ou a data de retirada de "${territory.name}".`
              : `Corrija o registro do histórico de "${territory.name}".`}
          </p>

          {editError !== null && <p className="dialog-error">{editError}</p>}

          <label className="field">
            <span>Dirigente responsável</span>
            <select value={editPublisherId} onChange={(e) => setEditPublisherId(e.target.value)}>
              {editOptions.map((publisher) => (
                <option key={publisher.id} value={publisher.id}>
                  {publisher.name}
                </option>
              ))}
            </select>
          </label>

          <div className="field-row">
            <label className="field">
              <span>Data de retirada</span>
              <input
                type="date"
                value={editStartedAt}
                max={toDateInputValue(today)}
                onChange={(e) => setEditStartedAt(e.target.value)}
              />
            </label>
            {!assignmentIsOpen(editing) && (
              <label className="field">
                <span>Data de devolução</span>
                <input
                  type="date"
                  disabled={editReopen}
                  value={editCompletedAt}
                  max={toDateInputValue(today)}
                  onChange={(e) => setEditCompletedAt(e.target.value)}
                />
              </label>
            )}
          </div>

          {!assignmentIsOpen(editing) && openAssignment === undefined && (
            <label className="field-checkbox">
              <input
                type="checkbox"
                checked={editReopen}
                onChange={(e) => setEditReopen(e.target.checked)}
              />
              Reabrir esta designação (volta a ficar em andamento)
            </label>
          )}

          <div className="dialog-actions">
            <button type="button" disabled={isActionPending} onClick={() => setEditing(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="button-primary"
              disabled={isActionPending}
              onClick={() => void submitEdit()}
            >
              {isActionPending ? 'Salvando…' : 'Salvar alterações'}
            </button>
          </div>
        </Dialog>
      )}
    </Dialog>
  )
}

export default TerritoryDetailDialog

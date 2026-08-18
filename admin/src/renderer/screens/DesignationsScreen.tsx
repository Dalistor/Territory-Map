// The Designations page (spec 0006, Task 03; assignment history in spec 0007,
// Task 11): a light header with a summary of how many territories have a
// publisher assigned, the "Exportar para Excel" button, and the
// AssignmentsMap (outlines + leader labels) filling the rest of the area.
//
// Clicking a territory opens its **history panel** -- the S-13 card, on
// screen: who has it now and since when, every past assignment with the two
// dates, and the three actions the admin has (designate, complete, delete a
// record). Before spec 0007 this was a one-shot "pick a publisher" dialog;
// designation is a historical record now, so the panel has to show the past,
// not just overwrite the present.
import { useCallback, useEffect, useState } from 'react'
import type { LatLngTuple } from 'leaflet'
import type { Assignment, Publisher, Territory } from '../../shared/models'
import { assignmentIsOpen } from '../../shared/models'
import { parseIpcError } from '../../shared/ipc-error'
import { AssignmentsMap } from '../map/AssignmentsMap'

const GENERIC_ERROR_MESSAGE = 'Não foi possível completar a operação.'

function errorMessage(error: unknown): string {
  return parseIpcError(error, GENERIC_ERROR_MESSAGE).message
}

/** The one place a date is turned into text on this screen. */
function formatDate(date: Date): string {
  return date.toLocaleDateString()
}

/**
 * `assignmentIsOpen`'s complement, narrowed: an assignment is open exactly
 * while it has no `completedAt`, so everything that is *not* open provably
 * has one. Saying that in the type keeps the history rows free of a
 * defensive "and if there is no completion date?" branch that could never
 * run.
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

export interface DesignationsScreenProps {
  /** Where the map centres when there are no territories yet -- the congregation's own city. */
  readonly fallbackCenter?: LatLngTuple
}

export function DesignationsScreen({ fallbackCenter }: DesignationsScreenProps): React.JSX.Element {
  const [territories, setTerritories] = useState<Territory[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [actionError, setActionError] = useState<string | null>(null)
  const [exportPath, setExportPath] = useState<string | null>(null)

  // `panelTarget` doubles as "is the panel open" -- non-null means it is, for
  // this one territory. The publisher options are fetched fresh (filtered to
  // active ones) every time it opens, since the admin may have deactivated
  // someone since the territory list last loaded.
  const [panelTarget, setPanelTarget] = useState<Territory | null>(null)
  const [assignPublishers, setAssignPublishers] = useState<Publisher[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [selectedPublisherId, setSelectedPublisherId] = useState<string | null>(null)

  // Only ever runs from an event handler ("Recarregar", reloading after an
  // action) -- the mount fetch below skips the synchronous reset, same
  // rationale as HomeScreen's.
  const load = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const list = await window.api.territories.listWithBlocks()
      setTerritories(list)
    } catch (error) {
      setLoadError(errorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Same shape as HomeScreen's mount effect: every state update happens in a
  // `.then` after the effect body returned, guarded against unmount.
  useEffect(() => {
    let cancelled = false
    window.api.territories
      .listWithBlocks()
      .then((list) => {
        if (!cancelled) setTerritories(list)
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(errorMessage(error))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  /** Turns a rejected write into a visible `role="alert"`, never an unhandled rejection. */
  const runAction = useCallback(async (action: () => Promise<void>) => {
    setActionError(null)
    try {
      await action()
    } catch (error) {
      setActionError(errorMessage(error))
    }
  }, [])

  /**
   * The shape every *destructive* action shares on top of {@link runAction}:
   * ask first, run only on "yes" -- the same `window.confirm` the rest of the
   * admin uses (`HomeScreen`, `App`), for the same reason: there is no modal
   * component of its own yet, and the text is exactly what each acceptance
   * criterion asks for.
   */
  const runConfirmed = useCallback(
    (message: string, action: () => Promise<void>) => {
      if (!window.confirm(message)) return Promise.resolve()
      return runAction(action)
    },
    [runAction]
  )

  /** Re-reads one territory's history. */
  const loadAssignments = useCallback(async (territoryId: string) => {
    const list = await window.api.assignments.listFor(territoryId)
    setAssignments(list)
  }, [])

  /**
   * Every write refreshes both sides: the history the panel shows, and the
   * territory list -- `Territory.assignedUser` is a projection of the open
   * assignment on the server, so designating, completing or deleting moves it
   * too, and the map's outlines and the summary would go stale otherwise.
   */
  const reloadAfterAction = useCallback(
    async (territoryId: string) => {
      await loadAssignments(territoryId)
      await load()
    },
    [load, loadAssignments]
  )

  /** Opens the history panel for `territory` and loads its history and options. */
  const openPanel = useCallback(
    async (territory: Territory) => {
      setSelectedPublisherId(null)
      setAssignments([])
      setAssignPublishers([])
      setPanelTarget(territory)
      try {
        const [publishers] = await Promise.all([
          window.api.publishers.list(),
          loadAssignments(territory.id)
        ])
        setAssignPublishers(publishers.filter((publisher) => publisher.isActive))
      } catch (error) {
        setActionError(errorMessage(error))
      }
    },
    [loadAssignments]
  )

  const openAssignment = assignments.find(assignmentIsOpen)
  const history = assignments.filter(assignmentIsCompleted)

  const designate = useCallback(() => {
    if (panelTarget === null || selectedPublisherId === null) return Promise.resolve()
    const territoryId = panelTarget.id
    const publisherId = selectedPublisherId
    const run = async (): Promise<void> => {
      await window.api.assignments.designate(territoryId, publisherId)
      await reloadAfterAction(territoryId)
    }
    // Only replacing somebody is destructive enough to ask about: the current
    // assignment gets closed with today's date, which the admin has to know
    // before it happens. Designating a free territory takes nothing away.
    if (openAssignment === undefined) return runAction(run)
    const nextName =
      assignPublishers.find((publisher) => publisher.id === publisherId)?.name ?? 'este publicador'
    return runConfirmed(
      replaceConfirmMessage(panelTarget, openAssignment.publisher.name, nextName),
      run
    )
  }, [
    panelTarget,
    selectedPublisherId,
    openAssignment,
    assignPublishers,
    reloadAfterAction,
    runAction,
    runConfirmed
  ])

  const complete = useCallback(() => {
    if (panelTarget === null || openAssignment === undefined) return Promise.resolve()
    const territoryId = panelTarget.id
    return runConfirmed(
      completeConfirmMessage(panelTarget, openAssignment.publisher.name),
      async () => {
        await window.api.assignments.complete(territoryId)
        await reloadAfterAction(territoryId)
      }
    )
  }, [panelTarget, openAssignment, reloadAfterAction, runConfirmed])

  const deleteAssignment = useCallback(
    (assignment: Assignment) => {
      if (panelTarget === null) return Promise.resolve()
      const territoryId = panelTarget.id
      return runConfirmed(deleteAssignmentConfirmMessage(assignment), async () => {
        await window.api.assignments.delete(territoryId, assignment.id)
        await reloadAfterAction(territoryId)
      })
    },
    [panelTarget, reloadAfterAction, runConfirmed]
  )

  /** The spreadsheet is written by the main process; `null` means the admin
   * dismissed the save dialog, which is not an error and says nothing. */
  const exportToExcel = useCallback(
    () =>
      runAction(async () => {
        setExportPath(null)
        const path = await window.api.exports.assignments()
        if (path !== null) setExportPath(path)
      }),
    [runAction]
  )

  const assignedCount = territories.filter(
    (territory) => territory.assignedUser !== undefined
  ).length

  return (
    <div>
      <header>
        <h1>Designações</h1>
        {!isLoading && loadError === null && (
          <p>
            {assignedCount} de {territories.length} territórios designados
          </p>
        )}
        <button onClick={() => void exportToExcel()}>Exportar para Excel</button>
        <button onClick={() => void load()}>Recarregar</button>
      </header>
      <main>
        {actionError !== null && <p role="alert">{actionError}</p>}
        {exportPath !== null && <p role="status">Planilha salva em {exportPath}</p>}
        {isLoading && <p>Carregando…</p>}
        {!isLoading && loadError !== null && <p role="alert">{loadError}</p>}
        {!isLoading && loadError === null && (
          <>
            <p role="note">
              Clique em um território no mapa para ver o histórico de designações e designar,
              concluir ou apagar um registro. Contorno azul contínuo: com dirigente; tracejado
              cinza: sem.
            </p>
            <AssignmentsMap
              territories={territories}
              fallbackCenter={fallbackCenter}
              onTerritoryTap={(territory) => void openPanel(territory)}
            />
          </>
        )}
        {panelTarget !== null && (
          <div
            className="assignment-panel"
            role="dialog"
            aria-label={`Designações de ${panelTarget.name}`}
          >
            <h2>Designações de {panelTarget.name}</h2>

            <h3>Designação atual</h3>
            {openAssignment === undefined ? (
              <p className="dialog-subtitle">Sem dirigente</p>
            ) : (
              <p className="status-badge status-active">
                {openAssignment.publisher.name} — desde {formatDate(openAssignment.startedAt)}
              </p>
            )}

            <h3 id="assignment-history-title">Histórico</h3>
            {history.length === 0 ? (
              <p className="dialog-subtitle">Nenhuma designação concluída ainda.</p>
            ) : (
              <ul className="assignment-history" aria-labelledby="assignment-history-title">
                {history.map((assignment) => (
                  <li key={assignment.id}>
                    <span>
                      {assignment.publisher.name} — {formatDate(assignment.startedAt)} a{' '}
                      {formatDate(assignment.completedAt)}
                    </span>
                    <button
                      type="button"
                      aria-label={`Apagar designação de ${assignment.publisher.name}`}
                      onClick={() => void deleteAssignment(assignment)}
                    >
                      Apagar
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <h3>Designar a…</h3>
            <div className="field assign-options">
              {assignPublishers.map((publisher) => (
                <label
                  key={publisher.id}
                  className={selectedPublisherId === publisher.id ? 'is-selected' : undefined}
                >
                  <input
                    type="radio"
                    name="assign-publisher"
                    checked={selectedPublisherId === publisher.id}
                    onChange={() => setSelectedPublisherId(publisher.id)}
                  />
                  <span className="assign-option-avatar" aria-hidden="true">
                    {publisher.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="assign-option-name">{publisher.name}</span>
                </label>
              ))}
            </div>
            <div className="dialog-actions">
              <button type="button" onClick={() => setPanelTarget(null)}>
                Fechar
              </button>
              {openAssignment !== undefined && (
                <button type="button" onClick={() => void complete()}>
                  Marcar como concluído
                </button>
              )}
              <button
                type="button"
                className="button-primary"
                disabled={selectedPublisherId === null}
                onClick={() => void designate()}
              >
                Designar
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default DesignationsScreen

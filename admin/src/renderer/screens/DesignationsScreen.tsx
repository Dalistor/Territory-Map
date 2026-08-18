// The Designations page (spec 0006, Task 03): a light header with a summary
// of how many territories have a publisher assigned, and the AssignmentsMap
// (outlines + leader labels) filling the rest of the area. Clicking a
// territory opens the assign dialog -- the exact behaviour that used to live
// in `HomeScreen` (implements/0097), migrated here because designation now
// has a page of its own.
import { useCallback, useEffect, useState } from 'react'
import type { LatLngTuple } from 'leaflet'
import type { Publisher, Territory } from '../../shared/models'
import { parseIpcError } from '../../shared/ipc-error'
import { AssignmentsMap } from '../map/AssignmentsMap'

const GENERIC_ERROR_MESSAGE = 'Não foi possível completar a operação.'

function errorMessage(error: unknown): string {
  return parseIpcError(error, GENERIC_ERROR_MESSAGE).message
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
  // The assign dialog, migrated verbatim from HomeScreen (implements/0097).
  // `assignTarget` doubles as "is the dialog open" -- non-null means it is,
  // for this one territory. `assignPublishers` is fetched fresh (filtered to
  // active ones) every time the dialog opens, since the admin may have
  // deactivated someone since the territory list last loaded.
  const [assignTarget, setAssignTarget] = useState<Territory | null>(null)
  const [assignPublishers, setAssignPublishers] = useState<Publisher[]>([])
  const [selectedPublisherId, setSelectedPublisherId] = useState<string | null>(null)

  // Only ever runs from an event handler ("Recarregar", reloading after an
  // assignment) -- the mount fetch below skips the synchronous reset, same
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
   * Opens the assign dialog for `territory` and loads the publisher options.
   * Pre-selects whoever is already designated (or "Nenhum" if nobody is), so
   * confirming without touching anything is a no-op rather than a surprise
   * unassignment.
   */
  const openAssignDialog = useCallback(async (territory: Territory) => {
    setSelectedPublisherId(territory.assignedUser?.id ?? null)
    setAssignTarget(territory)
    try {
      const list = await window.api.publishers.list()
      setAssignPublishers(list.filter((publisher) => publisher.isActive))
    } catch (error) {
      setActionError(errorMessage(error))
      setAssignPublishers([])
    }
  }, [])

  /**
   * Confirms the dialog's current selection: `null` when "Nenhum" is picked,
   * a publisher's `id` otherwise. Closes the dialog immediately, independent
   * of what the server answers.
   */
  const confirmAssign = useCallback(() => {
    if (assignTarget === null) return Promise.resolve()
    const territoryId = assignTarget.id
    const userId = selectedPublisherId
    setAssignTarget(null)
    return runAction(async () => {
      await window.api.territories.assign(territoryId, userId)
      await load()
    })
  }, [assignTarget, selectedPublisherId, load, runAction])

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
        <button onClick={() => void load()}>Recarregar</button>
      </header>
      <main>
        {actionError !== null && <p role="alert">{actionError}</p>}
        {isLoading && <p>Carregando…</p>}
        {!isLoading && loadError !== null && <p role="alert">{loadError}</p>}
        {!isLoading && loadError === null && (
          <>
            <p role="note">
              Clique em um território no mapa para designar ou trocar o dirigente. Contorno azul
              contínuo: com dirigente; tracejado cinza: sem.
            </p>
            <AssignmentsMap
              territories={territories}
              fallbackCenter={fallbackCenter}
              onTerritoryTap={(territory) => void openAssignDialog(territory)}
            />
          </>
        )}
        {assignTarget !== null && (
          <div role="dialog" aria-label={`Atribuir publicador a ${assignTarget.name}`}>
            <h2>Atribuir publicador a {assignTarget.name}</h2>
            <p className="dialog-subtitle">Quem vai cuidar deste território?</p>
            <div className="field assign-options">
              <label className={selectedPublisherId === null ? 'is-selected' : undefined}>
                <input
                  type="radio"
                  name="assign-publisher"
                  checked={selectedPublisherId === null}
                  onChange={() => setSelectedPublisherId(null)}
                />
                <span className="assign-option-avatar assign-option-avatar-none" aria-hidden="true">
                  —
                </span>
                <span className="assign-option-name">Nenhum</span>
              </label>
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
              <button type="button" onClick={() => setAssignTarget(null)}>
                Cancelar
              </button>
              <button type="button" className="button-primary" onClick={() => void confirmAssign()}>
                Atribuir
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default DesignationsScreen

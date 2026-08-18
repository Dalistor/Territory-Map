// The "Mapa" section of the sidebar shell (spec 0006): the map and the
// territory list. Navigation between sections and sign-out belong to the
// sidebar in `App.tsx`, and assigning a territory to a publisher lives in
// `DesignationsScreen` -- this screen only shows "Designado a {nome}" as
// read-only context. Only talks to the outside world through `window.api`
// (the IPC bridge) and the `TerritoryMap` component; the screens it pushes
// (territory editor, block editor, history) are reached through callback
// props instead of an import, so this file does not need to know they exist.
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { LatLngTuple } from 'leaflet'
import { compareTerritoriesByNumber } from '../../shared/models'
import type { Block, Congregation, Territory } from '../../shared/models'
import { parseIpcError } from '../../shared/ipc-error'
import { TerritoryMap } from '../map/TerritoryMap'

const GENERIC_ERROR_MESSAGE = 'Não foi possível completar a operação.'

export interface HomeScreenProps {
  /**
   * `undefined`/`null` until the caller knows it (e.g. while a silent
   * sign-in is still running) -- the header falls back to a generic title
   * until then.
   */
  readonly congregation?: Congregation | null
  /**
   * Signals the intent to open the territory editor in create mode, handing
   * over every territory currently loaded as non-editable drawing context.
   * The real editor is a later task; this screen only exposes the hook.
   */
  readonly onNewTerritory?: (neighbours: Territory[]) => void
  readonly onEditTerritory?: (territory: Territory, neighbours: Territory[]) => void
  readonly onAddBlock?: (territory: Territory) => void
  readonly onShowHistory?: (territory: Territory, block: Block) => void
  readonly onEditBlock?: (territory: Territory, block: Block) => void
  /** Overridable so a test can pin what counts as "today" for the map's colours. */
  readonly now?: Date
  /** Where the map centres when there are no territories yet -- the congregation's own city. */
  readonly fallbackCenter?: LatLngTuple
  /**
   * The pan/zoom the admin last left the map at, held by `AuthenticatedApp`
   * (which does not remount on navigation) so it survives this screen being
   * torn down and rebuilt. `undefined` the first time the app ever opens.
   */
  readonly mapView?: { center: LatLngTuple; zoom: number }
  /** Reports every pan/zoom so the caller can remember it across navigations. */
  readonly onMapViewChange?: (view: { center: LatLngTuple; zoom: number }) => void
}

function errorMessage(error: unknown): string {
  return parseIpcError(error, GENERIC_ERROR_MESSAGE).message
}

/** Literal, because `block_work_logs.block_id` really is `ON DELETE CASCADE` on the server. */
function deleteTerritoryConfirmMessage(territory: Territory): string {
  if (territory.blocks.length === 0) {
    return `O território "${territory.name}" será apagado.`
  }
  return (
    `O território "${territory.name}" será apagado, e junto dele as ${territory.blocks.length} ` +
    `quadras e todo o histórico de trabalho delas.`
  )
}

function deleteBlockConfirmMessage(territory: Territory, block: Block): string {
  return (
    `A quadra ${block.number} de "${territory.name}" será apagada, e junto dela todo o ` +
    `histórico de trabalho registrado nela.`
  )
}

export function HomeScreen({
  congregation,
  onNewTerritory,
  onEditTerritory,
  onAddBlock,
  onShowHistory,
  onEditBlock,
  now,
  fallbackCenter,
  mapView,
  onMapViewChange
}: HomeScreenProps): React.JSX.Element {
  const [territories, setTerritories] = useState<Territory[]>([])
  // Sorted once here, and used everywhere below (the list, the map, and the
  // territories handed to onNewTerritory/onEditTerritory) -- so every
  // consumer of "the territories" sees the same order, not just the <ul>.
  // The order is by territory *number* (`compareTerritoriesByNumber`), not by
  // name: the congregation refers to territories by that number, so sorting by
  // the area name would scatter the sequence (N12 landing between N6 and N7
  // just because "Próximo" sorts between "Centro" and "Santa Helena").
  const sortedTerritories = useMemo(
    () => [...territories].sort((a, b) => compareTerritoriesByNumber(a.name, b.name)),
    [territories]
  )
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [activeBlock, setActiveBlock] = useState<{ territory: Territory; block: Block } | null>(
    null
  )
  const [openTerritoryMenuId, setOpenTerritoryMenuId] = useState<string | null>(null)

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

  // Deliberately not `load()` here: `isLoading`/`loadError` already start at
  // their loading-and-clean defaults, so the mount fetch has nothing to set
  // synchronously -- every state update below happens inside a `.then`, after
  // the effect body itself has already returned. `load()` still does need
  // its synchronous `setIsLoading(true)`/`setLoadError(null)` reset, but only
  // ever runs from an event handler ("Recarregar", retrying after a delete),
  // never from an effect body.
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

  /**
   * The shape every write against `window.api` shares: turn a rejection into
   * a message on screen (`actionError`, rendered as the same `role="alert"`
   * every action on this screen already uses) instead of an unhandled
   * rejection.
   */
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
   * ask first, run only on "yes". `window.confirm` is a deliberately small
   * choice here -- the admin has no modal component of its own yet, and the
   * text it shows is exactly what each acceptance criterion asks for.
   */
  const runConfirmed = useCallback(
    (message: string, action: () => Promise<void>) => {
      if (!window.confirm(message)) return Promise.resolve()
      return runAction(action)
    },
    [runAction]
  )

  const handleDeleteTerritory = useCallback(
    (territory: Territory) =>
      runConfirmed(deleteTerritoryConfirmMessage(territory), async () => {
        await window.api.territories.delete(territory.id)
        await load()
      }),
    [load, runConfirmed]
  )

  const handleDeleteBlock = useCallback(
    (territory: Territory, block: Block) =>
      runConfirmed(deleteBlockConfirmMessage(territory, block), async () => {
        setActiveBlock(null)
        await window.api.blocks.delete(block.id)
        await load()
      }),
    [load, runConfirmed]
  )

  const title = congregation ? `${congregation.name} — ${congregation.city}` : 'Territory Map'

  return (
    <div>
      <header>
        <h1>{title}</h1>
        <button onClick={() => void load()}>Recarregar</button>
      </header>
      <main>
        {actionError !== null && <p role="alert">{actionError}</p>}
        {isLoading && <p>Carregando…</p>}
        {!isLoading && loadError !== null && <p role="alert">{loadError}</p>}
        {!isLoading && loadError === null && (
          <div className="home-split">
            <div className="home-panel">
              <button
                className="button-primary"
                onClick={() => onNewTerritory?.(sortedTerritories)}
              >
                Novo território
              </button>
              {sortedTerritories.length === 0 ? (
                <p>Nenhum território cadastrado ainda.</p>
              ) : (
                <div className="territory-list">
                  <ul>
                    {sortedTerritories.map((territory) => (
                      <li key={territory.id} className="territory-row">
                        <span>{territory.name}</span>
                        {territory.assignedUser && (
                          <span className="territory-assigned-user">
                            Designado a {territory.assignedUser.name}
                          </span>
                        )}
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`Opções de ${territory.name}`}
                          aria-expanded={openTerritoryMenuId === territory.id}
                          onClick={() =>
                            setOpenTerritoryMenuId(
                              openTerritoryMenuId === territory.id ? null : territory.id
                            )
                          }
                        >
                          ⋮
                        </button>
                        {openTerritoryMenuId === territory.id && (
                          <ul role="menu" aria-label={`Opções de ${territory.name}`}>
                            <li>
                              <button
                                role="menuitem"
                                onClick={() => {
                                  setOpenTerritoryMenuId(null)
                                  onAddBlock?.(territory)
                                }}
                              >
                                {`Adicionar quadra em ${territory.name}`}
                              </button>
                            </li>
                            <li>
                              <button
                                role="menuitem"
                                onClick={() => {
                                  setOpenTerritoryMenuId(null)
                                  onEditTerritory?.(territory, sortedTerritories)
                                }}
                              >
                                {`Editar demarcação de ${territory.name}`}
                              </button>
                            </li>
                            <li>
                              <button
                                role="menuitem"
                                className="block-action-danger"
                                onClick={() => {
                                  setOpenTerritoryMenuId(null)
                                  void handleDeleteTerritory(territory)
                                }}
                              >
                                {`Apagar território ${territory.name}`}
                              </button>
                            </li>
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="home-map">
              <TerritoryMap
                territories={sortedTerritories}
                now={now ?? new Date()}
                onBlockTap={(territory, block) => setActiveBlock({ territory, block })}
                fallbackCenter={fallbackCenter}
                initialView={mapView}
                onViewChange={onMapViewChange}
              />
            </div>
          </div>
        )}
        {activeBlock !== null && (
          <div
            role="menu"
            className="block-actions-modal"
            aria-label={`Quadra ${activeBlock.block.number} — ${activeBlock.territory.name}`}
          >
            <div className="block-actions-modal-header">
              <p>
                Quadra {activeBlock.block.number} — {activeBlock.territory.name}
              </p>
              <button
                type="button"
                className="icon-button"
                aria-label="Fechar"
                onClick={() => setActiveBlock(null)}
              >
                ×
              </button>
            </div>
            <button
              role="menuitem"
              className="block-action"
              onClick={() => {
                onShowHistory?.(activeBlock.territory, activeBlock.block)
                setActiveBlock(null)
              }}
            >
              Ver histórico
            </button>
            <button
              role="menuitem"
              className="block-action"
              onClick={() => {
                onEditBlock?.(activeBlock.territory, activeBlock.block)
                setActiveBlock(null)
              }}
            >
              Editar contorno ou número
            </button>
            <button
              role="menuitem"
              className="block-action block-action-danger"
              onClick={() => void handleDeleteBlock(activeBlock.territory, activeBlock.block)}
            >
              Apagar quadra
            </button>
          </div>
        )}
      </main>
    </div>
  )
}

export default HomeScreen

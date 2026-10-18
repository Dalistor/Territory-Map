// The "Mapa" section of the sidebar shell (spec 0006): the map and the
// territory list. Navigation between sections and sign-out belong to the
// sidebar in `App.tsx`, and assigning a territory to a publisher lives in
// `DesignationsScreen` -- this screen only shows "Designado a {nome}" as
// read-only context. Only talks to the outside world through `window.api`
// (the IPC bridge) and the `TerritoryMap` component; the screens it pushes
// (territory editor, block editor, history) are reached through callback
// props instead of an import, so this file does not need to know they exist.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LatLngTuple } from 'leaflet'
import { compareTerritoriesByNumber } from '../../shared/models'
import type { Block, Congregation, Territory } from '../../shared/models'
import { parseIpcError } from '../../shared/ipc-error'
import { TerritoryMap } from '../map/TerritoryMap'
import { Dialog } from '../components/Dialog'
import { deleteBlockConfirmMessage, deleteTerritoryConfirmMessage } from './confirmMessages'
import { MarkWorkedForm } from './MarkWorkedForm'

const GENERIC_ERROR_MESSAGE = 'Não foi possível completar a operação.'

function formatDate(date: Date): string {
  return date.toLocaleDateString()
}

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
  /** Signals the intent to open the territory's settings page (name, rotation, summary, delete). */
  readonly onOpenSettings?: (territory: Territory) => void
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

export function HomeScreen({
  congregation,
  onNewTerritory,
  onEditTerritory,
  onOpenSettings,
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
  const [isRefreshing, setIsRefreshing] = useState(false)
  const refreshInFlight = useRef(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [activeBlock, setActiveBlock] = useState<{ territory: Territory; block: Block } | null>(
    null
  )
  const [openTerritoryMenuId, setOpenTerritoryMenuId] = useState<string | null>(null)
  const [isMarkingWorked, setIsMarkingWorked] = useState(false)
  const [isSubmittingMark, setIsSubmittingMark] = useState(false)

  const load = useCallback(async () => {
    if (refreshInFlight.current) return
    refreshInFlight.current = true
    setIsRefreshing(true)
    setIsLoading(true)
    setLoadError(null)
    try {
      const list = await window.api.territories.listWithBlocks()
      setTerritories(list)
    } catch (error) {
      setLoadError(errorMessage(error))
    } finally {
      setIsLoading(false)
      refreshInFlight.current = false
      setIsRefreshing(false)
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

  useEffect(() => {
    if (openTerritoryMenuId === null) return
    document
      .querySelector<HTMLElement>(
        `[data-territory-menu="${openTerritoryMenuId}"] [role="menuitem"]`
      )
      ?.focus()
  }, [openTerritoryMenuId])

  function moveInMenu(event: React.KeyboardEvent<HTMLUListElement>): void {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape'].includes(event.key)) return
    event.preventDefault()
    if (event.key === 'Escape') {
      setOpenTerritoryMenuId(null)
      document.querySelector<HTMLElement>('[aria-expanded="true"]')?.focus()
      return
    }
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'))
    const current = items.indexOf(document.activeElement as HTMLElement)
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
    items[next]?.focus()
  }

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

  const openMarkWorked = useCallback(() => {
    setActionError(null)
    setIsMarkingWorked(true)
  }, [])

  const closeMarkWorked = useCallback(() => {
    setIsMarkingWorked(false)
  }, [])

  // The form only hands over the pair the admin chose; writing it -- and
  // deciding what a failure looks like on this screen -- stays here.
  const confirmMarkWorked = useCallback(
    (publisherId: string, workedAt: Date) => {
      if (activeBlock === null) return Promise.resolve()
      const blockId = activeBlock.block.id
      return runAction(async () => {
        setIsSubmittingMark(true)
        try {
          await window.api.workLogs.markWorked(blockId, publisherId, workedAt)
          closeMarkWorked()
          setActiveBlock(null)
          // The block's colour is derived from `lastWorkedAt`, which the server
          // just recomputed -- reloading is what makes the map catch up.
          await load()
        } finally {
          setIsSubmittingMark(false)
        }
      })
    },
    [activeBlock, closeMarkWorked, load, runAction]
  )

  const title = congregation ? `${congregation.name} — ${congregation.city}` : 'Territory Map'

  return (
    <div className="screen screen-map">
      <header className="screen-header">
        <div className="screen-title-block">
          <p className="eyebrow">Mapa da congregação</p>
          <h1>{title}</h1>
        </div>
        <button
          className="button-secondary"
          disabled={isLoading || isRefreshing}
          onClick={() => void load()}
        >
          {isLoading || isRefreshing ? 'Atualizando…' : 'Recarregar'}
        </button>
      </header>
      <main className="screen-body">
        {actionError !== null && <p role="alert">{actionError}</p>}
        {isLoading && <p>Carregando…</p>}
        {!isLoading && loadError !== null && <p role="alert">{loadError}</p>}
        {!isLoading && loadError === null && (
          <div className="home-split">
            <aside className="home-panel" aria-label="Territórios no mapa">
              <div className="workbench-panel-heading">
                <div>
                  <p className="eyebrow">Desenho e quadras</p>
                  <h2>Territórios</h2>
                </div>
                <span className="workbench-count">{sortedTerritories.length}</span>
              </div>
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
                        <span className="territory-last-work">
                          {territory.lastWork === undefined || territory.lastWork === null
                            ? 'Nunca trabalhado'
                            : `Último trabalho: ${territory.lastWork.publisher.name} — ${formatDate(territory.lastWork.workedAt)}`}
                        </span>
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
                          <ul
                            role="menu"
                            aria-label={`Opções de ${territory.name}`}
                            data-territory-menu={territory.id}
                            onKeyDown={moveInMenu}
                          >
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
                                onClick={() => {
                                  setOpenTerritoryMenuId(null)
                                  onOpenSettings?.(territory)
                                }}
                              >
                                {`Configurações de ${territory.name}`}
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
                        <div
                          className="territory-quick-actions"
                          aria-label={`Ações rápidas de ${territory.name}`}
                        >
                          <button type="button" onClick={() => onAddBlock?.(territory)}>
                            Quadras
                          </button>
                          <button type="button" onClick={() => onOpenSettings?.(territory)}>
                            Configurações
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </aside>
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
          <Dialog
            className="block-actions-modal"
            title={`Quadra ${activeBlock.block.number} — ${activeBlock.territory.name}`}
            onClose={() => setActiveBlock(null)}
          >
            <div className="block-actions-modal-header">
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
              className="block-action"
              onClick={() => {
                onShowHistory?.(activeBlock.territory, activeBlock.block)
                setActiveBlock(null)
              }}
            >
              Ver histórico
            </button>
            <button
              className="block-action"
              onClick={() => {
                onEditBlock?.(activeBlock.territory, activeBlock.block)
                setActiveBlock(null)
              }}
            >
              Editar contorno ou número
            </button>
            {!isMarkingWorked && (
              <button className="block-action" onClick={openMarkWorked}>
                Marcar como trabalhada
              </button>
            )}
            {isMarkingWorked && (
              <MarkWorkedForm
                now={now}
                // The assigned publisher is the right guess almost every time,
                // so it comes pre-selected -- but the admin can still record
                // someone else's work.
                preselectedPublisherId={activeBlock.territory.assignedUser?.id}
                isSubmitting={isSubmittingMark}
                onConfirm={(publisherId, workedAt) => void confirmMarkWorked(publisherId, workedAt)}
                onCancel={closeMarkWorked}
              />
            )}
            <button
              className="block-action block-action-danger"
              onClick={() => void handleDeleteBlock(activeBlock.territory, activeBlock.block)}
            >
              Apagar quadra
            </button>
          </Dialog>
        )}
      </main>
    </div>
  )
}

export default HomeScreen

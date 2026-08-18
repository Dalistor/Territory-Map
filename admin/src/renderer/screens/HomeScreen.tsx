// Ports `admin/lib/presentation/home_screen.dart` (removed Flutter admin) --
// the main screen: the map, the territory list, and the way into everything
// else. Only talks to the outside world through `window.api` (the IPC
// bridge, Task 07) and the `TerritoryMap` component (Task 09); every other
// screen it opens (territory editor, block editor, publishers, history) is
// reached through callback props instead of an import, so this file does not
// need to know those screens exist yet.
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { LatLngTuple } from 'leaflet'
import type { Block, Congregation, Publisher, Territory } from '../../shared/models'
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
  /** Opens the publishers screen -- unrelated to any territory or block. */
  readonly onOpenPublishers?: () => void
  /** Called after a successful sign-out so the caller can route back to setup. */
  readonly onSignedOut?: () => void
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

const SIGN_OUT_CONFIRM_MESSAGE =
  'Os dados salvos neste computador serão apagados. Nada é removido do servidor: o território, ' +
  'as quadras e o histórico de trabalho continuam lá. Para usar este computador de novo, será ' +
  'preciso digitar o nome, a cidade e a senha da congregação de novo.'

export function HomeScreen({
  congregation,
  onNewTerritory,
  onEditTerritory,
  onAddBlock,
  onShowHistory,
  onEditBlock,
  onOpenPublishers,
  onSignedOut,
  now,
  fallbackCenter,
  mapView,
  onMapViewChange
}: HomeScreenProps): React.JSX.Element {
  const [territories, setTerritories] = useState<Territory[]>([])
  // Sorted once here, and used everywhere below (the list, the map, and the
  // territories handed to onNewTerritory/onEditTerritory) -- so every
  // consumer of "the territories" sees the same alphabetical order, not just
  // the <ul>. `sensitivity: 'base'` ignores case and diacritics ("Árvore"
  // and "arvore" land next to each other), matching how a Portuguese-speaking
  // admin expects a name list to read.
  const sortedTerritories = useMemo(
    () =>
      [...territories].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      ),
    [territories]
  )
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false)
  const [activeBlock, setActiveBlock] = useState<{ territory: Territory; block: Block } | null>(
    null
  )
  const [openTerritoryMenuId, setOpenTerritoryMenuId] = useState<string | null>(null)
  // The "Atribuir a publicador" dialog. `assignTarget` doubles as "is the
  // dialog open" -- non-null means it is, for this one territory.
  // `assignPublishers` is fetched fresh (filtered to active ones) every time
  // the dialog opens, since the admin may have deactivated someone since the
  // territory list last loaded.
  const [assignTarget, setAssignTarget] = useState<Territory | null>(null)
  const [assignPublishers, setAssignPublishers] = useState<Publisher[]>([])
  const [selectedPublisherId, setSelectedPublisherId] = useState<string | null>(null)

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

  /**
   * Opens the assign dialog for `territory` and loads the publisher options.
   * Pre-selects whoever is already designated (or "Nenhum" if nobody is), so
   * confirming without touching anything is a no-op rather than a surprise
   * unassignment.
   */
  const openAssignDialog = useCallback(async (territory: Territory) => {
    setOpenTerritoryMenuId(null)
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
   * of what the server answers -- same shape as `submitCreate` in
   * `PublishersScreen.tsx`.
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

  const handleSignOut = useCallback(() => {
    setIsMoreMenuOpen(false)
    return runConfirmed(SIGN_OUT_CONFIRM_MESSAGE, async () => {
      await window.api.session.signOut()
      onSignedOut?.()
    })
  }, [onSignedOut, runConfirmed])

  const title = congregation ? `${congregation.name} — ${congregation.city}` : 'Territory Map'

  return (
    <div>
      <header>
        <h1>{title}</h1>
        <button onClick={onOpenPublishers}>Publicadores</button>
        <button onClick={() => void load()}>Recarregar</button>
        <button
          aria-haspopup="true"
          aria-expanded={isMoreMenuOpen}
          onClick={() => setIsMoreMenuOpen((open) => !open)}
        >
          Mais opções
        </button>
        {isMoreMenuOpen && (
          <div role="menu">
            <button role="menuitem" onClick={() => void handleSignOut()}>
              Sair da congregação
            </button>
          </div>
        )}
      </header>
      <main>
        {actionError !== null && <p role="alert">{actionError}</p>}
        {isLoading && <p>Carregando…</p>}
        {!isLoading && loadError !== null && <p role="alert">{loadError}</p>}
        {!isLoading && loadError === null && (
          <>
            <button onClick={() => onNewTerritory?.(sortedTerritories)}>Novo território</button>
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
                              onClick={() => void openAssignDialog(territory)}
                            >
                              {`Atribuir a publicador em ${territory.name}`}
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
            <TerritoryMap
              territories={sortedTerritories}
              now={now ?? new Date()}
              onBlockTap={(territory, block) => setActiveBlock({ territory, block })}
              fallbackCenter={fallbackCenter}
              initialView={mapView}
              onViewChange={onMapViewChange}
            />
          </>
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
        {assignTarget !== null && (
          <div role="dialog" aria-label={`Atribuir publicador a ${assignTarget.name}`}>
            <h2>Atribuir publicador a {assignTarget.name}</h2>
            <div className="field assign-options">
              <label>
                <input
                  type="radio"
                  name="assign-publisher"
                  checked={selectedPublisherId === null}
                  onChange={() => setSelectedPublisherId(null)}
                />
                Nenhum
              </label>
              {assignPublishers.map((publisher) => (
                <label key={publisher.id}>
                  <input
                    type="radio"
                    name="assign-publisher"
                    checked={selectedPublisherId === publisher.id}
                    onChange={() => setSelectedPublisherId(publisher.id)}
                  />
                  {publisher.name}
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

export default HomeScreen

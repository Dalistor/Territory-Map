// Ports `admin/lib/presentation/home_screen.dart` (removed Flutter admin) --
// the main screen: the map, the territory list, and the way into everything
// else. Only talks to the outside world through `window.api` (the IPC
// bridge, Task 07) and the `TerritoryMap` component (Task 09); every other
// screen it opens (territory editor, block editor, publishers, history) is
// reached through callback props instead of an import, so this file does not
// need to know those screens exist yet.
import { useCallback, useEffect, useState } from 'react'
import type { LatLngTuple } from 'leaflet'
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
  /** Opens the publishers screen -- unrelated to any territory or block. */
  readonly onOpenPublishers?: () => void
  /** Called after a successful sign-out so the caller can route back to setup. */
  readonly onSignedOut?: () => void
  /** Overridable so a test can pin what counts as "today" for the map's colours. */
  readonly now?: Date
  /** Where the map centres when there are no territories yet -- the congregation's own city. */
  readonly fallbackCenter?: LatLngTuple
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
  fallbackCenter
}: HomeScreenProps): React.JSX.Element {
  const [territories, setTerritories] = useState<Territory[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false)
  const [activeBlock, setActiveBlock] = useState<{ territory: Territory; block: Block } | null>(
    null
  )

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
   * The shape every destructive action shares: ask first, run only on "yes",
   * and turn a rejection into a message on screen instead of an unhandled
   * rejection. `window.confirm` is a deliberately small choice here -- the
   * admin has no modal component of its own yet, and the text it shows is
   * exactly what each acceptance criterion asks for.
   */
  const runConfirmed = useCallback(async (message: string, action: () => Promise<void>) => {
    if (!window.confirm(message)) return
    setActionError(null)
    try {
      await action()
    } catch (error) {
      setActionError(errorMessage(error))
    }
  }, [])

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
            <button onClick={() => onNewTerritory?.(territories)}>Novo território</button>
            {territories.length === 0 ? (
              <p>Nenhum território cadastrado ainda.</p>
            ) : (
              <ul>
                {territories.map((territory) => (
                  <li key={territory.id}>
                    <span>{territory.name}</span>
                    <button onClick={() => onAddBlock?.(territory)}>
                      {`Adicionar quadra em ${territory.name}`}
                    </button>
                    <button onClick={() => onEditTerritory?.(territory, territories)}>
                      {`Editar demarcação de ${territory.name}`}
                    </button>
                    <button onClick={() => void handleDeleteTerritory(territory)}>
                      {`Apagar território ${territory.name}`}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <TerritoryMap
              territories={territories}
              now={now ?? new Date()}
              onBlockTap={(territory, block) => setActiveBlock({ territory, block })}
              fallbackCenter={fallbackCenter}
            />
          </>
        )}
        {activeBlock !== null && (
          <div
            role="menu"
            aria-label={`Quadra ${activeBlock.block.number} — ${activeBlock.territory.name}`}
          >
            <button
              role="menuitem"
              onClick={() => {
                onShowHistory?.(activeBlock.territory, activeBlock.block)
                setActiveBlock(null)
              }}
            >
              Ver histórico
            </button>
            <button
              role="menuitem"
              onClick={() => {
                onEditBlock?.(activeBlock.territory, activeBlock.block)
                setActiveBlock(null)
              }}
            >
              Editar contorno ou número
            </button>
            <button
              role="menuitem"
              onClick={() => void handleDeleteBlock(activeBlock.territory, activeBlock.block)}
            >
              Apagar quadra
            </button>
            <button onClick={() => setActiveBlock(null)}>Fechar</button>
          </div>
        )}
      </main>
    </div>
  )
}

export default HomeScreen

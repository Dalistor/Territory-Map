// Ports `_Root`/`_Authenticated` from the removed `admin/lib/main.dart` --
// the decision between the setup screen and the authenticated app. Runs
// once on mount:
//   1. `session.isConfigured()` -- nothing saved yet (or the read itself
//      failed) sends the admin to `SetupScreen`.
//   2. If configured, a probe `territories.listWithBlocks()` call decides
//      whether the saved credentials still work. A
//      `CredentialsRejectedException` here (the password changed on the
//      server, or the token version moved on) sends the admin back to
//      `SetupScreen` with that explanation instead of a broken screen; any
//      other failure (e.g. the network is down) is not this component's
//      business -- `HomeScreen` fetches the same list itself and shows that
//      failure its own way.
//   3. Once the probe succeeds, `session.getCongregation()` recovers the
//      congregation for the header -- `session:configure` only returns it
//      the one time the admin actually types the password (`SetupScreen`);
//      every later launch signs in silently, so this is the only way
//      `HomeScreen` learns who it is.
//
// Once authenticated, `AuthenticatedApp` below owns the in-app navigation
// between `HomeScreen` and the four screens it can open (territory editor,
// block editor, publishers, block history) -- none of the tasks that built
// those screens ever wired them together, since each was tested in
// isolation against a faked `HomeScreen`-shaped caller. There is no router
// library involved: `route` is one piece of state, and leaving a pushed
// screen always returns to a freshly mounted `HomeScreen`, whose own mount
// effect refetches the territories -- so a save doesn't need its own
// invalidation path, going home already causes one.

import { useEffect, useState } from 'react'
import type { LatLngTuple } from 'leaflet'
import type { Block, Congregation, Territory } from '../shared/models'
import { parseIpcError } from '../shared/ipc-error'
import SetupScreen from './screens/SetupScreen'
import HomeScreen from './screens/HomeScreen'
import TerritoryEditorScreen from './screens/TerritoryEditorScreen'
import BlockEditorScreen from './screens/BlockEditorScreen'
import PublishersScreen from './screens/PublishersScreen'
import BlockHistorySheet from './screens/BlockHistorySheet'

const STORAGE_READ_ERROR_MESSAGE = 'Não foi possível ler os dados guardados neste computador.'
const CREDENTIALS_REJECTED_NAME = 'CredentialsRejectedException'

type RootState =
  | { readonly status: 'loading' }
  | { readonly status: 'setup'; readonly reason?: string }
  | { readonly status: 'home'; readonly congregation: Congregation | null }

export function App(): React.JSX.Element {
  const [state, setState] = useState<RootState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    async function boot(): Promise<void> {
      let isConfigured: boolean
      try {
        isConfigured = await window.api.session.isConfigured()
      } catch {
        if (!cancelled) setState({ status: 'setup', reason: STORAGE_READ_ERROR_MESSAGE })
        return
      }

      if (!isConfigured) {
        if (!cancelled) setState({ status: 'setup' })
        return
      }

      try {
        await window.api.territories.listWithBlocks()
      } catch (error) {
        if (cancelled) return
        const parsed = parseIpcError(error, STORAGE_READ_ERROR_MESSAGE)
        if (parsed.name === CREDENTIALS_REJECTED_NAME) {
          setState({ status: 'setup', reason: parsed.message })
        } else {
          // Not a credentials problem -- HomeScreen's own load fetches the
          // territories again and shows this failure the way it already
          // knows how to.
          setState({ status: 'home', congregation: null })
        }
        return
      }

      let congregation: Congregation | null = null
      try {
        congregation = await window.api.session.getCongregation()
      } catch {
        // A local-state read failing here is not expected, and losing the
        // congregation name is cosmetic -- HomeScreen already falls back to
        // a generic header for `null`. Not worth sending the admin back to
        // setup over.
      }

      if (!cancelled) setState({ status: 'home', congregation })
    }

    void boot()
    return () => {
      cancelled = true
    }
  }, [])

  if (state.status === 'loading') {
    return <p role="status">Carregando…</p>
  }

  if (state.status === 'setup') {
    return <SetupScreen reason={state.reason} />
  }

  return (
    <AuthenticatedApp
      congregation={state.congregation}
      onSignedOut={() => setState({ status: 'setup' })}
    />
  )
}

type Route =
  | { readonly kind: 'home' }
  | {
      readonly kind: 'territory-editor'
      readonly territory?: Territory
      readonly neighbours: Territory[]
    }
  | { readonly kind: 'block-editor'; readonly territory: Territory; readonly block?: Block }
  | { readonly kind: 'publishers' }
  | { readonly kind: 'block-history'; readonly territory: Territory; readonly block: Block }

interface AuthenticatedAppProps {
  readonly congregation: Congregation | null
  readonly onSignedOut: () => void
}

/** Everything reachable once the admin is signed in -- `HomeScreen` and the four screens it opens. */
function AuthenticatedApp({ congregation, onSignedOut }: AuthenticatedAppProps): React.JSX.Element {
  const [route, setRoute] = useState<Route>({ kind: 'home' })
  const goHome = (): void => setRoute({ kind: 'home' })

  // Lives here, one level above `HomeScreen`, because `HomeScreen` remounts
  // from scratch every time the admin leaves and comes back (on purpose --
  // see the comment above `AuthenticatedApp`, it forces a fresh territories
  // fetch). `TerritoryMap`'s own `MapContainer` only reads its `center`/
  // `zoom` props on mount, so without this the pan/zoom the admin left the
  // map at would reset on every round trip through another screen.
  const [mapView, setMapView] = useState<{ center: LatLngTuple; zoom: number } | null>(null)

  // A one-time, best-effort lookup of the congregation's own city, so the
  // map opens somewhere useful instead of the middle of Brazil when there
  // is no territory yet to anchor on (`TerritoryMap`/`TerritoryEditorScreen`
  // both already have their own further fallbacks, so a failed or still-
  // pending lookup here is never a broken map, just a less helpful one).
  const [fallbackCenter, setFallbackCenter] = useState<LatLngTuple | undefined>(undefined)
  useEffect(() => {
    if (congregation === null) return
    let cancelled = false
    window.api.geo
      .geocodeCity(congregation.city)
      .then((point) => {
        if (!cancelled && point !== null) setFallbackCenter([point.lat, point.lng])
      })
      .catch(() => {
        // A failed lookup is not worth surfacing -- the map's own hardcoded
        // fallback covers it.
      })
    return () => {
      cancelled = true
    }
  }, [congregation])

  switch (route.kind) {
    case 'territory-editor':
      return (
        <PushedScreen onBack={goHome}>
          <TerritoryEditorScreen
            territory={route.territory}
            neighbours={route.neighbours}
            onSaved={goHome}
            fallbackCenter={fallbackCenter}
          />
        </PushedScreen>
      )
    case 'block-editor':
      // No `onSaved={goHome}` here on purpose, unlike the territory editor
      // above: `BlockEditorScreen` (spec 0004, Task 04) now stays open and
      // resets itself to create-mode after a successful save, precisely so
      // the admin can keep adding blocks to the same territory without
      // leaving. Wiring `onSaved` to `goHome` would navigate away the
      // instant the save resolves, unmounting the screen before that reset
      // was ever visible -- which is exactly the bug this comment is here
      // to stop someone from reintroducing.
      return (
        <PushedScreen onBack={goHome}>
          <BlockEditorScreen territory={route.territory} block={route.block} />
        </PushedScreen>
      )
    case 'publishers':
      return (
        <PushedScreen onBack={goHome}>
          <PublishersScreen />
        </PushedScreen>
      )
    case 'block-history':
      return (
        <PushedScreen onBack={goHome}>
          <BlockHistorySheet territory={route.territory} block={route.block} />
        </PushedScreen>
      )
    case 'home':
      return (
        <HomeScreen
          congregation={congregation}
          onNewTerritory={(neighbours) => setRoute({ kind: 'territory-editor', neighbours })}
          onEditTerritory={(territory, neighbours) =>
            setRoute({ kind: 'territory-editor', territory, neighbours })
          }
          onAddBlock={(territory) => setRoute({ kind: 'block-editor', territory })}
          onEditBlock={(territory, block) => setRoute({ kind: 'block-editor', territory, block })}
          onShowHistory={(territory, block) =>
            setRoute({ kind: 'block-history', territory, block })
          }
          onOpenPublishers={() => setRoute({ kind: 'publishers' })}
          onSignedOut={onSignedOut}
          fallbackCenter={fallbackCenter}
          mapView={mapView ?? undefined}
          onMapViewChange={setMapView}
        />
      )
  }
}

interface PushedScreenProps {
  readonly onBack: () => void
  readonly children: React.ReactNode
}

/**
 * The "← Voltar" chrome every screen `AuthenticatedApp` pushes needs but
 * does not have built in -- each one was designed to be pushed by a real
 * router (the Dart admin got a back button for free from
 * `Navigator.push`'s `AppBar`), which this app has never had until now.
 * Wraps without touching the screen itself, so none of its own tests had to
 * change.
 */
function PushedScreen({ onBack, children }: PushedScreenProps): React.JSX.Element {
  return (
    <div className="pushed-screen">
      <div className="back-bar">
        <button type="button" onClick={onBack}>
          ← Voltar
        </button>
      </div>
      {children}
    </div>
  )
}

export default App

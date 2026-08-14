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

import { useEffect, useState } from 'react'
import type { Congregation } from '../shared/models'
import SetupScreen from './screens/SetupScreen'
import HomeScreen from './screens/HomeScreen'

const STORAGE_READ_ERROR_MESSAGE = 'Não foi possível ler os dados guardados neste computador.'
const CREDENTIALS_REJECTED_NAME = 'CredentialsRejectedException'

type RootState =
  | { readonly status: 'loading' }
  | { readonly status: 'setup'; readonly reason?: string }
  | { readonly status: 'home'; readonly congregation: Congregation | null }

/**
 * Every error crossing the IPC bridge lands as a `SerializedIpcError`-shaped
 * plain object in tests that fake `window.api` directly (see
 * `shared/ipc-contract.ts`), or as a real `Error` when a test throws one --
 * this reads `name` off either without assuming which.
 */
function errorName(error: unknown): string | undefined {
  if (error instanceof Error) return error.name
  if (typeof error === 'object' && error !== null && 'name' in error) {
    const { name } = error as { name: unknown }
    if (typeof name === 'string') return name
  }
  return undefined
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const { message } = error as { message: unknown }
    if (typeof message === 'string' && message.length > 0) return message
  }
  return fallback
}

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
        if (errorName(error) === CREDENTIALS_REJECTED_NAME) {
          setState({
            status: 'setup',
            reason: errorMessage(error, STORAGE_READ_ERROR_MESSAGE)
          })
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
    <HomeScreen
      congregation={state.congregation}
      onSignedOut={() => setState({ status: 'setup' })}
    />
  )
}

export default App

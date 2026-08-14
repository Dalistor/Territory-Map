// The screen the admin sees exactly once -- ported from the removed
// `admin/lib/presentation/setup_screen.dart`. After this, the credentials
// live in the OS keystore (`main/credentials-store.ts`, behind
// `window.api.session.configure`) and the app signs itself in on every
// launch. It comes back only if the server stops accepting the saved
// credentials or the store fails to read (`App.tsx`, Task 13, decides when
// to pass `reason` back in) -- this component never decides that on its own.

import { useState, type FormEvent } from 'react'

const REQUIRED_MESSAGE = 'Campo obrigatório.'

export interface SetupScreenProps {
  /** Why the admin is back here, when this is not the first time. */
  readonly reason?: string
}

interface FieldErrors {
  name?: string
  city?: string
  password?: string
}

/**
 * Reduces whatever `window.api.session.configure` rejected with to a string
 * worth showing the admin. `ipc-handlers.ts` (Task 07) always rejects with
 * something carrying a `message` -- a real `Error`, or (in tests, which fake
 * `window.api` rather than crossing the real IPC bridge) a plain object
 * shaped like one -- so reading `message` off either covers both.
 */
function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const { message } = error as { message: unknown }
    if (typeof message === 'string' && message.length > 0) return message
  }
  return 'Não foi possível configurar a congregação. Tente novamente.'
}

export function SetupScreen({ reason }: SetupScreenProps): React.JSX.Element {
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    const errors: FieldErrors = {}
    if (name.trim() === '') errors.name = REQUIRED_MESSAGE
    if (city.trim() === '') errors.city = REQUIRED_MESSAGE
    if (password === '') errors.password = REQUIRED_MESSAGE

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    setFieldErrors({})
    setServerError(null)
    setSubmitting(true)
    try {
      // `name`/`city` are trimmed -- leading/trailing whitespace is never
      // meaningful in either. `password` is sent exactly as typed: it is a
      // secret byte sequence, not a display string, and trimming it would
      // silently authenticate against something other than what the admin
      // typed. The server does not trim it either.
      await window.api.session.configure({ name: name.trim(), city: city.trim(), password })
      // Success does not navigate on its own -- the caller (App.tsx, Task
      // 13) decides what happens next, the same split of responsibility the
      // Dart screen had with its provider invalidation.
    } catch (error) {
      setServerError(errorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: '0 auto', padding: 32 }}>
      <h1>Territory Map</h1>
      <p>
        Informe os dados da congregação. Eles ficam guardados neste computador e não serão pedidos
        de novo.
      </p>
      {reason !== undefined && (
        <p data-testid="setup-reason" role="note">
          {reason}
        </p>
      )}
      <form onSubmit={handleSubmit} noValidate>
        <div>
          <label htmlFor="setup-name">Nome da congregação</label>
          <input
            id="setup-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={fieldErrors.name !== undefined}
          />
          {fieldErrors.name !== undefined && <span>{fieldErrors.name}</span>}
        </div>
        <div>
          <label htmlFor="setup-city">Cidade</label>
          <input
            id="setup-city"
            type="text"
            value={city}
            onChange={(event) => setCity(event.target.value)}
            aria-invalid={fieldErrors.city !== undefined}
          />
          {fieldErrors.city !== undefined && <span>{fieldErrors.city}</span>}
        </div>
        <div>
          <label htmlFor="setup-password">Senha</label>
          <input
            id="setup-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={fieldErrors.password !== undefined}
          />
          {fieldErrors.password !== undefined && <span>{fieldErrors.password}</span>}
        </div>
        {serverError !== null && <p role="alert">{serverError}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? <span role="status">Entrando…</span> : 'Entrar'}
        </button>
      </form>
    </div>
  )
}

export default SetupScreen

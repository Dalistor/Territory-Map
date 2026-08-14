// Registering publishers and handing out their access codes. Ports
// `admin/lib/presentation/publishers_screen.dart` (removed Flutter admin,
// still readable in git history at 12c95fe) to React.
//
// The code is a credential: it is shown here while it is alive and
// disappears once redeemed or expired. It must never be logged, and it is
// never put in a URL. Regenerating one is the answer to a lost phone, a
// reinstall or an expired code -- and it invalidates whatever the person had
// before.
import { useCallback, useEffect, useState } from 'react'
import type { Publisher } from '../../shared/models'
import { publisherHasLiveCode, publisherIsPending } from '../../shared/models'

export interface PublishersScreenProps {
  /** Injected rather than read here, so a test can pin "today" wherever it needs a code's fate to land. */
  readonly now?: Date
}

/** The one line that tells the admin what state this person is actually in. */
function statusOf(publisher: Publisher, now: Date): string {
  if (!publisher.isActive) {
    return 'Acesso revogado — o histórico de trabalho continua guardado.'
  }
  if (publisherHasLiveCode(publisher, now)) {
    return 'Código válido, aguardando ser usado.'
  }
  if (publisherIsPending(publisher)) {
    return 'Sem código válido. Gere um novo para esta pessoa entrar.'
  }
  return 'Ativo neste aparelho.'
}

/** Reduces whatever a rejected `window.api` call threw to text the admin can read. */
function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return 'Não foi possível completar a operação.'
}

/** What the code dialog is currently showing -- whose code, and the code itself. */
interface CodeDialogState {
  readonly publisherName: string
  readonly code: string
}

/**
 * The `?? '—'` fallbacks below (create/regenerate/"Ver código") guard a
 * contract the server is supposed to uphold -- a live code always carries
 * `accessCode` -- and are deliberately left untested: forcing that branch
 * needs a fixture that misrepresents a real API response, which would test
 * the fixture, not this screen.
 */

export function PublishersScreen({ now }: PublishersScreenProps): React.JSX.Element {
  const today = now ?? new Date()

  const [publishers, setPublishers] = useState<Publisher[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [codeDialog, setCodeDialog] = useState<CodeDialogState | null>(null)

  /** Runs a write against `window.api.publishers`, surfacing any failure as a toast instead of letting it escape. */
  async function runWrite(action: () => Promise<void>): Promise<void> {
    try {
      await action()
    } catch (error) {
      setToast(errorMessage(error))
    }
  }

  // No setState before the first `await`: `loading` already starts `true`
  // (the initial load) or stays whatever it was (a refresh after a write),
  // and every other update below only happens once the request has settled.
  // Calling `setLoading(true)`/`setLoadError(null)` synchronously here as
  // well would run inside the effect's commit itself, which
  // `react-hooks/set-state-in-effect` flags as an avoidable extra render.
  const load = useCallback(async () => {
    try {
      const list = await window.api.publishers.list()
      setPublishers(list)
      setLoadError(null)
    } catch (error) {
      setLoadError(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // `react-hooks/set-state-in-effect` flags any effect whose callback
    // transitively calls a state setter, even one reached only after an
    // `await` -- it is written for a `use()`/Suspense data-fetching model.
    // This screen's architecture (Task 07, spec 0003) has `renderer/`
    // fetch through `window.api` directly, with no Suspense boundary above
    // it, so "load on mount, setState when the promise settles" is the
    // correct pattern here, not the cascading-render case the rule targets.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  function openCreateForm(): void {
    setNewName('')
    setShowCreateForm(true)
  }

  function closeCreateForm(): void {
    setShowCreateForm(false)
    setNewName('')
  }

  async function submitCreate(): Promise<void> {
    const name = newName.trim()
    if (name.length === 0) return
    // The form closes the moment the name is submitted, independent of what
    // the server answers -- mirrors the removed Dart `_NameDialog`, whose
    // `Navigator.pop` fires synchronously before the async `create()` call.
    closeCreateForm()
    await runWrite(async () => {
      const publisher = await window.api.publishers.create(name)
      await load()
      setCodeDialog({ publisherName: publisher.name, code: publisher.accessCode ?? '—' })
    })
  }

  async function regenerate(publisher: Publisher): Promise<void> {
    setOpenMenuId(null)
    await runWrite(async () => {
      const updated = await window.api.publishers.regenerateCode(publisher.id)
      await load()
      setCodeDialog({ publisherName: updated.name, code: updated.accessCode ?? '—' })
    })
  }

  async function toggleActive(publisher: Publisher): Promise<void> {
    setOpenMenuId(null)
    await runWrite(async () => {
      await window.api.publishers.setActive(publisher.id, !publisher.isActive)
      await load()
    })
  }

  function showExistingCode(publisher: Publisher): void {
    setOpenMenuId(null)
    setCodeDialog({ publisherName: publisher.name, code: publisher.accessCode ?? '—' })
  }

  async function copyCode(code: string): Promise<void> {
    await navigator.clipboard.writeText(code)
  }

  return (
    <div>
      <h1>Publicadores</h1>

      {toast && (
        <div role="alert" data-testid="toast">
          {toast}
        </div>
      )}

      <button type="button" onClick={openCreateForm}>
        Cadastrar
      </button>

      {loading && <div role="progressbar" aria-label="Carregando publicadores" />}

      {!loading && loadError && <p role="alert">{loadError}</p>}

      {!loading && !loadError && publishers.length === 0 && <p>Nenhum publicador cadastrado.</p>}

      {!loading && !loadError && publishers.length > 0 && (
        <ul>
          {publishers.map((publisher) => (
            <li key={publisher.id} data-testid={`publisher-row-${publisher.name}`}>
              <span>{publisher.name}</span>
              <span data-testid="publisher-status">{statusOf(publisher, today)}</span>
              <button
                type="button"
                aria-label={`Ações de ${publisher.name}`}
                aria-expanded={openMenuId === publisher.id}
                onClick={() => setOpenMenuId(openMenuId === publisher.id ? null : publisher.id)}
              >
                Ações
              </button>
              {openMenuId === publisher.id && (
                <ul role="menu" aria-label={`Ações de ${publisher.name}`}>
                  {publisherHasLiveCode(publisher, today) && (
                    <li>
                      <button type="button" onClick={() => showExistingCode(publisher)}>
                        Ver código
                      </button>
                    </li>
                  )}
                  <li>
                    <button type="button" onClick={() => regenerate(publisher)}>
                      Gerar novo código
                    </button>
                  </li>
                  <li>
                    <button type="button" onClick={() => toggleActive(publisher)}>
                      {publisher.isActive ? 'Desativar' : 'Reativar'}
                    </button>
                  </li>
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {showCreateForm && (
        <div role="dialog" aria-label="Cadastrar publicador">
          <label htmlFor="publisher-name">Nome da pessoa</label>
          <input
            id="publisher-name"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submitCreate()
            }}
            autoFocus
          />
          <button type="button" onClick={closeCreateForm}>
            Cancelar
          </button>
          <button type="button" disabled={newName.trim().length === 0} onClick={submitCreate}>
            Gerar código
          </button>
        </div>
      )}

      {codeDialog && (
        <div role="dialog" aria-label={`Código de ${codeDialog.publisherName}`}>
          <p>Código de {codeDialog.publisherName}</p>
          <p data-testid="access-code">{codeDialog.code}</p>
          <p>
            Entregue este código à pessoa. Ele vale 24 horas, serve uma única vez e não poderá ser
            consultado depois de usado.
          </p>
          <button type="button" onClick={() => copyCode(codeDialog.code)}>
            Copiar
          </button>
          <button type="button" onClick={() => setCodeDialog(null)}>
            Fechar
          </button>
        </div>
      )}
    </div>
  )
}

export default PublishersScreen

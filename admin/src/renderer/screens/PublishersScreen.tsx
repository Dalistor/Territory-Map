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
import { parseIpcError } from '../../shared/ipc-error'

const GENERIC_ERROR_MESSAGE = 'Não foi possível completar a operação.'

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

/** Which colour the status badge takes -- purely visual, alongside {@link statusOf}'s text. */
function statusCategory(
  publisher: Publisher,
  now: Date
): 'revoked' | 'live-code' | 'pending' | 'active' {
  if (!publisher.isActive) return 'revoked'
  if (publisherHasLiveCode(publisher, now)) return 'live-code'
  if (publisherIsPending(publisher)) return 'pending'
  return 'active'
}

/**
 * Lowercases and strips diacritics, so "joao" and "João" compare equal.
 * NFD splits each accented letter into base letter + combining mark, and the
 * combining-mark range is then dropped.
 */
function searchable(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/**
 * One line next to the title: "2 ativos · 1 com código válido". Categories
 * with nobody in them are left out -- "0 desativados" is noise, not a count.
 */
function summaryOf(publishers: Publisher[], now: Date): string {
  const counts = { active: 0, 'live-code': 0, pending: 0, revoked: 0 }
  for (const publisher of publishers) {
    counts[statusCategory(publisher, now)] += 1
  }
  const parts: string[] = []
  if (counts.active > 0) parts.push(`${counts.active} ${counts.active === 1 ? 'ativo' : 'ativos'}`)
  if (counts['live-code'] > 0) parts.push(`${counts['live-code']} com código válido`)
  if (counts.pending > 0) parts.push(`${counts.pending} sem código válido`)
  if (counts.revoked > 0) {
    parts.push(`${counts.revoked} ${counts.revoked === 1 ? 'desativado' : 'desativados'}`)
  }
  return parts.join(' · ')
}

/** Reduces whatever a rejected `window.api` call threw to text the admin can read. */
function errorMessage(error: unknown): string {
  return parseIpcError(error, GENERIC_ERROR_MESSAGE).message
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

  const [search, setSearch] = useState('')
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

  const filtered = publishers.filter((publisher) =>
    searchable(publisher.name).includes(searchable(search.trim()))
  )

  return (
    <div>
      <h1>Publicadores</h1>

      {!loading && !loadError && publishers.length > 0 && (
        <p className="publishers-summary" data-testid="publishers-summary">
          {summaryOf(publishers, today)}
        </p>
      )}

      {toast && (
        <div role="alert" data-testid="toast">
          {toast}
        </div>
      )}

      <button type="button" className="button-primary" onClick={openCreateForm}>
        Cadastrar
      </button>

      {loading && <div role="progressbar" aria-label="Carregando publicadores" />}

      {!loading && loadError && <p role="alert">{loadError}</p>}

      {!loading && !loadError && publishers.length === 0 && <p>Nenhum publicador cadastrado.</p>}

      {!loading && !loadError && publishers.length > 0 && (
        <input
          type="search"
          className="publishers-search"
          aria-label="Buscar publicador"
          placeholder="Buscar por nome…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      )}

      {!loading && !loadError && publishers.length > 0 && filtered.length === 0 && (
        <p>Nenhum publicador encontrado para a busca.</p>
      )}

      {!loading && !loadError && filtered.length > 0 && (
        <ul>
          {filtered.map((publisher) => (
            <li
              key={publisher.id}
              className="publisher-row"
              data-testid={`publisher-row-${publisher.name}`}
            >
              <span
                className={`avatar${publisher.isActive ? '' : ' is-inactive'}`}
                aria-hidden="true"
              >
                {publisher.name.charAt(0).toUpperCase()}
              </span>
              <span className="publisher-name-block">
                <span>{publisher.name}</span>
                <span
                  className={`status-badge status-${statusCategory(publisher, today)}`}
                  data-testid="publisher-status"
                >
                  {statusOf(publisher, today)}
                </span>
              </span>
              <button
                type="button"
                className="icon-button"
                aria-label={`Ações de ${publisher.name}`}
                aria-expanded={openMenuId === publisher.id}
                onClick={() => setOpenMenuId(openMenuId === publisher.id ? null : publisher.id)}
              >
                ⋮
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
          <h2>Cadastrar publicador</h2>
          <div className="field">
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
          </div>
          <div className="dialog-actions">
            <button type="button" onClick={closeCreateForm}>
              Cancelar
            </button>
            <button
              type="button"
              className="button-primary"
              disabled={newName.trim().length === 0}
              onClick={submitCreate}
            >
              Gerar código
            </button>
          </div>
        </div>
      )}

      {codeDialog && (
        <div role="dialog" aria-label={`Código de ${codeDialog.publisherName}`}>
          <h2>Código de {codeDialog.publisherName}</h2>
          <p className="access-code-display" data-testid="access-code">
            {codeDialog.code}
          </p>
          <p>
            Entregue este código à pessoa. Ele vale 24 horas, serve uma única vez e não poderá ser
            consultado depois de usado.
          </p>
          <div className="dialog-actions">
            <button type="button" onClick={() => setCodeDialog(null)}>
              Fechar
            </button>
            <button
              type="button"
              className="button-primary"
              onClick={() => copyCode(codeDialog.code)}
            >
              Copiar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default PublishersScreen

// Registering publishers and handing out their access codes. Ports
// `admin/lib/presentation/publishers_screen.dart` (removed Flutter admin,
// still readable in git history at 12c95fe) to React.
//
// The code is a credential: it is shown here while it is alive and
// disappears once redeemed or expired. It must never be logged, and it is
// never put in a URL. Regenerating one is the answer to a lost phone, a
// reinstall or an expired code -- and it invalidates whatever the person had
// before.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AssignmentWithTerritory, Publisher } from '../../shared/models'
import { publisherHasLiveCode, publisherIsPending } from '../../shared/models'
import { parseIpcError } from '../../shared/ipc-error'
import { Dialog } from '../components/Dialog'

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

/**
 * Spells out the one thing that separates deleting from deactivating, because
 * the two sit side by side in the same menu and the difference is invisible
 * from their names: the person goes, the record of what she did stays. Since
 * spec 0011 the history carries the name it was written with, so nothing in
 * it turns anonymous when the row in `users` disappears -- saying so here is
 * what keeps an admin from reaching for "Desativar" out of fear.
 */
function deletePublisherConfirmMessage(publisher: Publisher): string {
  return (
    `Apagar ${publisher.name}?\n\n` +
    'A pessoa sai da lista e perde o acesso ao aplicativo. O histórico de trabalho e as ' +
    'designações dela continuam no sistema, com o nome preservado. Não há como desfazer.'
  )
}

/** What the code dialog is currently showing -- whose code, and the code itself. */
interface CodeDialogState {
  readonly publisherName: string
  readonly code: string
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('pt-BR')
}

function historyCount(total: number): string {
  return `${total} ${total === 1 ? 'território retirado' : 'territórios retirados'}`
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
  const [isWriting, setIsWriting] = useState(false)
  const writeInFlight = useRef(false)

  const [search, setSearch] = useState('')
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [codeDialog, setCodeDialog] = useState<CodeDialogState | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [selectedPublisherId, setSelectedPublisherId] = useState<string | null>(null)
  const [history, setHistory] = useState<AssignmentWithTerritory[]>([])
  const [historyTotal, setHistoryTotal] = useState(0)
  const [historyPage, setHistoryPage] = useState(1)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const selectedTriggerRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (openMenuId === null) return
    document.querySelector<HTMLElement>(`[data-publisher-menu="${openMenuId}"] button`)?.focus()
  }, [openMenuId])

  function moveInMenu(event: React.KeyboardEvent<HTMLUListElement>): void {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape'].includes(event.key)) return
    event.preventDefault()
    if (event.key === 'Escape') {
      setOpenMenuId(null)
      document.querySelector<HTMLElement>('[aria-expanded="true"]')?.focus()
      return
    }
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button'))
    const current = items.indexOf(document.activeElement as HTMLElement)
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
    items[next]?.focus()
  }

  /** Runs a write against `window.api.publishers`, surfacing any failure as a toast instead of letting it escape. */
  async function runWrite(action: () => Promise<void>): Promise<void> {
    if (writeInFlight.current) return
    writeInFlight.current = true
    setIsWriting(true)
    try {
      await action()
    } catch (error) {
      setToast(errorMessage(error))
    } finally {
      writeInFlight.current = false
      setIsWriting(false)
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

  function startRename(publisher: Publisher): void {
    setOpenMenuId(null)
    setRenamingId(publisher.id)
    setRenameValue(publisher.name)
  }

  function cancelRename(): void {
    setRenamingId(null)
    setRenameValue('')
  }

  /**
   * Corrects the name on the publisher's own record.
   *
   * The work logs and assignments already written keep the name copied into
   * them at the time -- that is what lets the history stay readable after
   * someone is renamed or removed -- so this changes the list and everything
   * recorded from now on, not the past.
   */
  async function submitRename(publisher: Publisher): Promise<void> {
    const name = renameValue.trim()
    if (name === '' || name === publisher.name) {
      cancelRename()
      return
    }
    await runWrite(async () => {
      await window.api.publishers.rename(publisher.id, name)
      cancelRename()
      await load()
    })
  }

  async function toggleActive(publisher: Publisher): Promise<void> {
    setOpenMenuId(null)
    await runWrite(async () => {
      await window.api.publishers.setActive(publisher.id, !publisher.isActive)
      await load()
    })
  }

  /**
   * Asks first -- the same `window.confirm` the rest of the admin uses, for
   * the same reason: there is no modal component of its own yet.
   */
  async function deletePublisher(publisher: Publisher): Promise<void> {
    setOpenMenuId(null)
    if (!window.confirm(deletePublisherConfirmMessage(publisher))) return
    await runWrite(async () => {
      await window.api.publishers.delete(publisher.id)
      if (selectedPublisherId === publisher.id) {
        setSelectedPublisherId(null)
        setHistory([])
        setHistoryTotal(0)
      }
      await load()
    })
  }

  const selectedPublisher = publishers.find((publisher) => publisher.id === selectedPublisherId)

  async function loadHistory(publisherId: string, page: number, append = false): Promise<void> {
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      const result = await window.api.assignments.listAll({ publisherId, page })
      setHistory((current) => (append ? [...current, ...result.items] : result.items))
      setHistoryTotal(result.total)
      setHistoryPage(result.page)
    } catch (error) {
      setHistoryError(errorMessage(error))
    } finally {
      setHistoryLoading(false)
    }
  }

  function selectPublisher(publisher: Publisher): void {
    setSelectedPublisherId(publisher.id)
    setHistory([])
    setHistoryTotal(0)
    void loadHistory(publisher.id, 1)
  }

  function closeHistory(): void {
    setSelectedPublisherId(null)
    setHistory([])
    setHistoryTotal(0)
    selectedTriggerRef.current?.focus()
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
    <div className="publishers-screen">
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

      <button
        type="button"
        className="button-primary"
        disabled={isWriting}
        onClick={openCreateForm}
      >
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

      {!loading && !loadError && publishers.length > 0 && (
        <div
          className={`publishers-workspace${selectedPublisher === undefined ? '' : ' has-detail'}`}
        >
          <div className="publishers-directory">
            {filtered.length === 0 ? (
              <p className="publishers-no-results">Nenhum publicador encontrado para a busca.</p>
            ) : (
              <div
                className="publishers-list"
                role="region"
                aria-label="Lista de publicadores"
                tabIndex={0}
              >
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
                        {renamingId === publisher.id ? (
                          <form
                            noValidate
                            onSubmit={(event) => {
                              event.preventDefault()
                              void submitRename(publisher)
                            }}
                          >
                            <label htmlFor={`rename-${publisher.id}`} className="sr-only">
                              Novo nome de {publisher.name}
                            </label>
                            <input
                              id={`rename-${publisher.id}`}
                              value={renameValue}
                              autoFocus
                              onChange={(event) => setRenameValue(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Escape') cancelRename()
                              }}
                            />
                            <button type="submit" disabled={isWriting}>
                              {isWriting ? 'Salvando…' : 'Salvar'}
                            </button>
                            <button type="button" onClick={cancelRename}>
                              Cancelar
                            </button>
                          </form>
                        ) : (
                          <button
                            type="button"
                            className="publisher-history-trigger"
                            aria-pressed={publisher.id === selectedPublisherId}
                            ref={
                              publisher.id === selectedPublisherId ? selectedTriggerRef : undefined
                            }
                            onClick={() => selectPublisher(publisher)}
                          >
                            {publisher.name}
                          </button>
                        )}
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
                        onClick={() =>
                          setOpenMenuId(openMenuId === publisher.id ? null : publisher.id)
                        }
                      >
                        ⋮
                      </button>
                      {openMenuId === publisher.id && (
                        <ul
                          role="menu"
                          aria-label={`Ações de ${publisher.name}`}
                          data-publisher-menu={publisher.id}
                          onKeyDown={moveInMenu}
                        >
                          {publisherHasLiveCode(publisher, today) && (
                            <li>
                              <button type="button" onClick={() => showExistingCode(publisher)}>
                                Ver código
                              </button>
                            </li>
                          )}
                          <li>
                            <button type="button" onClick={() => startRename(publisher)}>
                              Renomear
                            </button>
                          </li>
                          <li>
                            <button
                              type="button"
                              disabled={isWriting}
                              onClick={() => regenerate(publisher)}
                            >
                              Gerar novo código
                            </button>
                          </li>
                          <li>
                            <button
                              type="button"
                              disabled={isWriting}
                              onClick={() => toggleActive(publisher)}
                            >
                              {publisher.isActive ? 'Desativar' : 'Reativar'}
                            </button>
                          </li>
                          <li>
                            <button
                              type="button"
                              className="block-action-danger"
                              aria-label={`Apagar ${publisher.name}`}
                              disabled={isWriting}
                              onClick={() => void deletePublisher(publisher)}
                            >
                              Apagar
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

          {selectedPublisher !== undefined && (
            <aside
              className="publisher-history-panel"
              aria-label={`Histórico de territórios de ${selectedPublisher.name}`}
            >
              <div className="publisher-history-panel-header">
                <div>
                  <h2 className="eyebrow">Histórico de territórios</h2>
                  <p className="publisher-history-name">{selectedPublisher.name}</p>
                  {!historyLoading && historyError === null && (
                    <p className="publisher-history-count">{historyCount(historyTotal)}</p>
                  )}
                </div>
                <button
                  type="button"
                  className="button-quiet"
                  aria-label="Fechar histórico de territórios"
                  onClick={closeHistory}
                >
                  Fechar
                </button>
              </div>
              <div className="publisher-history-content">
                {historyLoading && <p role="status">Carregando histórico…</p>}
                {!historyLoading && historyError !== null && (
                  <div className="publisher-history-state">
                    <p role="alert">{historyError}</p>
                    <button type="button" onClick={() => void loadHistory(selectedPublisher.id, 1)}>
                      Tentar novamente
                    </button>
                  </div>
                )}
                {!historyLoading && historyError === null && history.length === 0 && (
                  <div className="publisher-history-state">
                    <strong>Nenhum território retirado</strong>
                    <p>Nenhum território registrado para esta pessoa.</p>
                  </div>
                )}
                {!historyLoading && historyError === null && history.length > 0 && (
                  <div
                    className="publisher-history-table-wrap"
                    role="region"
                    aria-label="Registros do histórico"
                    tabIndex={0}
                  >
                    <table aria-label={`Histórico de territórios de ${selectedPublisher.name}`}>
                      <thead>
                        <tr>
                          <th scope="col">Território</th>
                          <th scope="col">Retirada</th>
                          <th scope="col">Devolução</th>
                          <th scope="col">Situação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((assignment) => {
                          const ongoing = assignment.completedAt === undefined
                          return (
                            <tr key={assignment.id}>
                              <td>
                                <strong>{assignment.territory.name}</strong>
                              </td>
                              <td>{formatDate(assignment.startedAt)}</td>
                              <td>{ongoing ? '—' : formatDate(assignment.completedAt)}</td>
                              <td>
                                <span
                                  className={`assignment-status${ongoing ? ' is-ongoing' : ' is-returned'}`}
                                >
                                  {ongoing ? 'Em andamento' : 'Devolvido'}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {!historyLoading && historyError === null && history.length < historyTotal && (
                  <button
                    type="button"
                    className="publisher-history-more"
                    onClick={() => void loadHistory(selectedPublisher.id, historyPage + 1, true)}
                  >
                    Carregar mais
                  </button>
                )}
              </div>
            </aside>
          )}
        </div>
      )}

      {showCreateForm && (
        <Dialog title="Cadastrar publicador" onClose={closeCreateForm}>
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
        </Dialog>
      )}

      {codeDialog && (
        <Dialog title={`Código de ${codeDialog.publisherName}`} onClose={() => setCodeDialog(null)}>
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
        </Dialog>
      )}
    </div>
  )
}

export default PublishersScreen

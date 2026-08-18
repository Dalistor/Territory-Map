import { useCallback, useEffect, useState } from 'react'
import type { Assignment, AssignmentWithTerritory } from '../../shared/models'
import { assignmentIsOpen, compareTerritoriesByNumber } from '../../shared/models'
import { parseIpcError } from '../../shared/ipc-error'

/**
 * Which side of a record the page groups by. It is a toggle between two views
 * of the same records, not navigation -- hence `aria-pressed` on the buttons
 * rather than `aria-current`.
 */
type View = 'leader' | 'territory'

const GENERIC_ERROR_MESSAGE = 'Não foi possível completar a operação.'

function errorMessage(error: unknown): string {
  return parseIpcError(error, GENERIC_ERROR_MESSAGE).message
}

/** The one place a date is turned into text on this screen. */
function formatDate(date: Date): string {
  return date.toLocaleDateString()
}

interface Group {
  readonly key: string
  readonly title: string
  readonly entries: AssignmentWithTerritory[]
}

/**
 * Buckets the records by whichever side the current view groups on, keeping
 * the order `listAll` already delivered inside each bucket (most recent
 * first). Only the bucket order differs between the views: people read
 * alphabetically, territories read by their number -- the order the
 * congregation itself uses.
 */
function groupBy(entries: AssignmentWithTerritory[], view: View): Group[] {
  const groups = new Map<string, Group>()
  for (const entry of entries) {
    const side = view === 'leader' ? entry.publisher : entry.territory
    const existing = groups.get(side.id)
    if (existing === undefined) {
      groups.set(side.id, { key: side.id, title: side.name, entries: [entry] })
    } else {
      existing.entries.push(entry)
    }
  }
  const compare =
    view === 'leader'
      ? (a: string, b: string): number => a.localeCompare(b)
      : compareTerritoriesByNumber
  return [...groups.values()].sort((a, b) => compare(a.title, b.title))
}

/**
 * `assignmentIsOpen`'s complement, narrowed -- the same helper
 * `DesignationsScreen` carries, for the same reason: everything that is not
 * open provably has a `completedAt`, and saying so in the type keeps the
 * lines free of a branch that could never run.
 */
function assignmentIsCompleted(
  assignment: Assignment
): assignment is Assignment & { readonly completedAt: Date } {
  return !assignmentIsOpen(assignment)
}

/**
 * The right-hand half of a line: the two dates, or the start date and "em
 * andamento" while the assignment is still the one in force.
 */
function formatPeriod(entry: AssignmentWithTerritory): string {
  const end = assignmentIsCompleted(entry) ? formatDate(entry.completedAt) : 'em andamento'
  return `${formatDate(entry.startedAt)} a ${end}`
}

/**
 * Lowercases and strips diacritics, so "joao" and "João" compare equal. NFD
 * splits each accented letter into base letter + combining mark, and the
 * combining-mark range is then dropped.
 *
 * Same rule -- and same code -- as `PublishersScreen`'s `searchable`, which is
 * local to that file. Two screens do not make a shared module yet; if a third
 * needs it, it moves to `shared/`.
 */
function searchable(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/**
 * The warning before a delete. The second paragraph is word for word the one
 * `DesignationsScreen` shows -- same action, same consequence, so it must not
 * read differently depending on which page the admin happens to be on. The
 * first names the territory as well, because here a record is read outside
 * its territory's context.
 */
function deleteConfirmMessage(entry: AssignmentWithTerritory): string {
  return (
    `Apagar a designação de ${entry.publisher.name} em "${entry.territory.name}"?\n\n` +
    'O registro sai do histórico como se não tivesse existido. Não há como desfazer.'
  )
}

/** What each line says about a record -- the *other* side of the grouper. */
function entryLabel(entry: AssignmentWithTerritory, view: View): string {
  return view === 'leader' ? entry.territory.name : entry.publisher.name
}

export function HistoryScreen(): React.JSX.Element {
  const [entries, setEntries] = useState<AssignmentWithTerritory[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [view, setView] = useState<View>('leader')
  const [search, setSearch] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      setEntries(await window.api.assignments.listAll())
    } catch (error) {
      setLoadError(errorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }, [])

  /**
   * Asks first, and only then deletes -- the same `window.confirm` the rest of
   * the admin uses, for the same reason: there is no modal component of its
   * own yet. A rejected delete becomes a visible alert, never an unhandled
   * rejection.
   */
  const deleteEntry = useCallback(
    async (entry: AssignmentWithTerritory) => {
      if (!window.confirm(deleteConfirmMessage(entry))) return
      setActionError(null)
      try {
        await window.api.assignments.delete(entry.territory.id, entry.id)
        await load()
      } catch (error) {
        setActionError(errorMessage(error))
      }
    },
    [load]
  )

  useEffect(() => {
    let cancelled = false
    window.api.assignments
      .listAll()
      .then((list) => {
        if (!cancelled) setEntries(list)
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

  // The search runs on the *groups*, not the records: it filters by the name
  // of whatever the current view groups on, which is the name the admin is
  // looking at on screen.
  const groups = groupBy(entries, view).filter((group) =>
    searchable(group.title).includes(searchable(search.trim()))
  )

  return (
    <div>
      <header>
        <h1>Histórico</h1>
        <div className="history-views">
          <button
            type="button"
            aria-pressed={view === 'leader'}
            className={view === 'leader' ? 'is-active' : undefined}
            onClick={() => setView('leader')}
          >
            Por dirigente
          </button>
          <button
            type="button"
            aria-pressed={view === 'territory'}
            className={view === 'territory' ? 'is-active' : undefined}
            onClick={() => setView('territory')}
          >
            Por território
          </button>
        </div>
        <button type="button" onClick={() => void load()}>
          Recarregar
        </button>
      </header>
      <main>
        {actionError !== null && <p role="alert">{actionError}</p>}
        {isLoading && <p>Carregando…</p>}
        {!isLoading && loadError !== null && <p role="alert">{loadError}</p>}
        {!isLoading && loadError === null && entries.length > 0 && (
          <input
            type="search"
            className="history-search"
            aria-label="Buscar no histórico"
            placeholder="Buscar por nome…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        )}
        {!isLoading && loadError === null && entries.length === 0 && (
          <p>Nenhuma designação registrada ainda.</p>
        )}
        {!isLoading && loadError === null && entries.length > 0 && groups.length === 0 && (
          <p>Nenhum resultado para a busca.</p>
        )}
        {!isLoading &&
          loadError === null &&
          groups.map((group) => (
            <section
              key={group.key}
              className="history-group"
              role="group"
              aria-label={group.title}
            >
              <h2>{group.title}</h2>
              <ul className="assignment-history history-list">
                {group.entries.map((entry) => (
                  <li key={entry.id}>
                    <span>
                      {entryLabel(entry, view)} — {formatPeriod(entry)}
                    </span>
                    <button
                      type="button"
                      aria-label={`Apagar designação de ${entry.publisher.name} em ${entry.territory.name}`}
                      onClick={() => void deleteEntry(entry)}
                    >
                      Apagar
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </main>
    </div>
  )
}

export default HistoryScreen

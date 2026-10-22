import { useCallback, useEffect, useRef, useState } from 'react'
import { DataTable } from '../components/DataTable'
import type { AssignmentHistoryQuery, AssignmentWithTerritory } from '../../shared/models'
import { assignmentHolderName, assignmentIsCampaign, assignmentIsOpen } from '../../shared/models'
import { parseIpcError } from '../../shared/ipc-error'
import { Icon } from '../components/Icon'

const GENERIC_ERROR_MESSAGE = 'Não foi possível completar a operação.'

function errorMessage(error: unknown): string {
  return parseIpcError(error, GENERIC_ERROR_MESSAGE).message
}

function formatDate(date: Date): string {
  return date.toLocaleDateString()
}

function localDayStart(value: string): Date | undefined {
  if (value === '') return undefined
  const [year, month, day] = value.split('-').map(Number)
  if (year === undefined || month === undefined || day === undefined) return undefined
  return new Date(year, month - 1, day)
}

function nextLocalDayStart(value: string): Date | undefined {
  const dayStart = localDayStart(value)
  if (dayStart === undefined) return undefined
  return new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() + 1)
}

function rangeFor(fromDay: string, toDay: string, page: number): AssignmentHistoryQuery {
  const fromInstant = localDayStart(fromDay)
  const toInstant = nextLocalDayStart(toDay)
  return {
    ...(fromInstant === undefined ? {} : { fromInstant }),
    ...(toInstant === undefined ? {} : { toInstant }),
    page
  }
}

function deleteConfirmMessage(entry: AssignmentWithTerritory): string {
  return (
    `Apagar a designação de ${assignmentHolderName(entry)} em "${entry.territory.name}"?\n\n` +
    'O registro sai do histórico como se não tivesse existido. Não há como desfazer.'
  )
}

function resultRange(page: number, pageSize: number, total: number, itemCount: number): string {
  if (total === 0) return '0 de 0'
  const first = (page - 1) * pageSize + 1
  const last = first + itemCount - 1
  return `${first}–${last} de ${total}`
}

/**
 * The IPC contract is paginated. Keeping this boundary tolerant of an array
 * lets an older preload during an app update fail soft instead of taking the
 * renderer down before its paired Main process is restarted.
 */
function pageFromResponse(response: Awaited<ReturnType<typeof window.api.assignments.listAll>>): {
  readonly items: AssignmentWithTerritory[]
  readonly total: number
  readonly page: number
  readonly pageSize: number
} {
  if (Array.isArray(response)) {
    return { items: response, total: response.length, page: 1, pageSize: 50 }
  }
  return response
}

export function HistoryScreen(): React.JSX.Element {
  const [entries, setEntries] = useState<AssignmentWithTerritory[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [fromDay, setFromDay] = useState('')
  const [toDay, setToDay] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isActionPending, setIsActionPending] = useState(false)
  const requestVersion = useRef(0)
  const actionInFlight = useRef(false)

  const load = useCallback(
    async (requestedPage: number, requestedFrom = fromDay, requestedTo = toDay) => {
      const version = ++requestVersion.current
      setIsLoading(true)
      setLoadError(null)
      try {
        const response = pageFromResponse(
          await window.api.assignments.listAll(rangeFor(requestedFrom, requestedTo, requestedPage))
        )
        if (version !== requestVersion.current) return
        setEntries(response.items)
        setTotal(response.total)
        setPage(response.page)
        setPageSize(response.pageSize)
      } catch (error) {
        if (version === requestVersion.current) setLoadError(errorMessage(error))
      } finally {
        if (version === requestVersion.current) setIsLoading(false)
      }
    },
    [fromDay, toDay]
  )

  useEffect(() => {
    // Scheduling after the first paint keeps the initial async request out of
    // React's effect commit phase while retaining the stable, unfiltered query.
    const initialLoad = window.setTimeout(() => void load(1, '', ''), 0)
    return () => window.clearTimeout(initialLoad)
    // The initial request is intentionally separate from date changes below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function changePeriod(nextFrom: string, nextTo: string): void {
    setFromDay(nextFrom)
    setToDay(nextTo)
    void load(1, nextFrom, nextTo)
  }

  const deleteEntry = useCallback(
    async (entry: AssignmentWithTerritory) => {
      if (!window.confirm(deleteConfirmMessage(entry)) || actionInFlight.current) return
      actionInFlight.current = true
      setIsActionPending(true)
      setActionError(null)
      try {
        await window.api.assignments.delete(entry.territory.id, entry.id)
        await load(1)
      } catch (error) {
        setActionError(errorMessage(error))
      } finally {
        actionInFlight.current = false
        setIsActionPending(false)
      }
    },
    [load]
  )

  const hasPeriod = fromDay !== '' || toDay !== ''
  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  const state =
    loadError !== null
      ? {
          kind: 'error' as const,
          message: loadError,
          onRetry: () => void load(page),
          retryLabel: 'Tentar novamente'
        }
      : isLoading
        ? { kind: 'busy' as const, message: 'Carregando histórico completo…' }
        : entries.length === 0
          ? hasPeriod
            ? {
                kind: 'no-results' as const,
                message: 'Nenhum resultado para o período selecionado.',
                onClear: () => changePeriod('', ''),
                clearLabel: 'Limpar período'
              }
            : { kind: 'empty' as const, message: 'Nenhuma designação registrada ainda.' }
          : { kind: 'ready' as const }

  return (
    <section className="history-screen" aria-labelledby="history-title">
      <header className="page-header">
        <div className="header-title-block">
          <p className="eyebrow">Consulta da congregação</p>
          <h1 id="history-title">Histórico completo</h1>
          <p>Designações que se sobrepõem ao período selecionado.</p>
        </div>
        <button
          type="button"
          disabled={isLoading || isActionPending}
          onClick={() => void load(page)}
        >
          <Icon name="refresh" className={isLoading ? 'is-spinning' : undefined} />
          {isLoading ? 'Atualizando…' : 'Recarregar'}
        </button>
      </header>
      <main>
        <div className="history-period" role="group" aria-label="Período do histórico">
          <label>
            De
            <input
              type="date"
              value={fromDay}
              onChange={(event) => changePeriod(event.target.value, toDay)}
            />
          </label>
          <label>
            Até
            <input
              type="date"
              value={toDay}
              onChange={(event) => changePeriod(fromDay, event.target.value)}
            />
          </label>
          <button
            type="button"
            className="button-quiet"
            disabled={!hasPeriod}
            onClick={() => changePeriod('', '')}
          >
            Limpar período
          </button>
        </div>

        {actionError !== null && <p role="alert">{actionError}</p>}
        <DataTable
          label="Histórico completo"
          columns={[
            {
              key: 'territory',
              header: 'Território',
              cell: (entry: AssignmentWithTerritory) => entry.territory.name
            },
            {
              key: 'publisher',
              header: 'Publicador',
              cell: (entry: AssignmentWithTerritory) => assignmentHolderName(entry)
            },
            {
              key: 'started',
              header: 'Retirada',
              cell: (entry: AssignmentWithTerritory) => formatDate(entry.startedAt)
            },
            {
              key: 'completed',
              header: 'Devolução',
              cell: (entry: AssignmentWithTerritory) =>
                entry.completedAt === undefined ? '—' : formatDate(entry.completedAt)
            },
            {
              key: 'status',
              header: 'Situação',
              cell: (entry: AssignmentWithTerritory) =>
                assignmentIsOpen(entry) ? (
                  <span className="status-badge status-working">Em andamento</span>
                ) : (
                  <span className="status-badge status-idle">Devolvido</span>
                )
            },
            {
              key: 'actions',
              header: 'Ações',
              // A campaign's line belongs to every territory of the campaign at
              // once, so it is deleted with the campaign, never one row here.
              cell: (entry: AssignmentWithTerritory) =>
                assignmentIsCampaign(entry) ? (
                  <span className="cell-sub">Gerida em Campanhas</span>
                ) : (
                  <button
                    type="button"
                    className="button-small button-quiet button-danger"
                    disabled={isActionPending}
                    aria-label={`Apagar designação de ${assignmentHolderName(entry)} em ${entry.territory.name}`}
                    onClick={() => void deleteEntry(entry)}
                  >
                    <Icon name="trash" />
                    Apagar
                  </button>
                )
            }
          ]}
          rows={entries}
          getRowKey={(entry) => entry.id}
          state={state}
        />

        {!isLoading && loadError === null && total > 0 && (
          <nav className="history-pagination" aria-label="Paginação do histórico">
            <p aria-live="polite">{resultRange(page, pageSize, total, entries.length)}</p>
            <button
              type="button"
              disabled={page <= 1 || isActionPending}
              onClick={() => void load(page - 1)}
            >
              Página anterior
            </button>
            <button
              type="button"
              disabled={page >= lastPage || isActionPending}
              onClick={() => void load(page + 1)}
            >
              Próxima página
            </button>
          </nav>
        )}
      </main>
    </section>
  )
}

export default HistoryScreen

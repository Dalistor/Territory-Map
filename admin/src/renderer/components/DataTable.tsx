import './query-controls.css'

export type DataTableSortDirection = 'ascending' | 'descending'

export interface DataTableColumn<Row> {
  readonly key: string
  readonly header: string
  readonly cell: (row: Row) => React.ReactNode
  readonly sortable?: boolean
  readonly sortDirection?: DataTableSortDirection
  /** Counts and dates line up digit for digit on the right edge. */
  readonly numeric?: boolean
}

export type DataTableState =
  | { readonly kind: 'ready' }
  | { readonly kind: 'busy'; readonly message?: string }
  | { readonly kind: 'empty'; readonly message?: string }
  | {
      readonly kind: 'no-results'
      readonly message?: string
      readonly onClear?: () => void
      readonly clearLabel?: string
    }
  | {
      readonly kind: 'error'
      readonly message?: string
      readonly onRetry?: () => void
      readonly retryLabel?: string
    }

export interface DataTableProps<Row> {
  readonly label: string
  readonly columns: readonly DataTableColumn<Row>[]
  readonly rows: readonly Row[]
  readonly getRowKey: (row: Row) => string
  readonly state?: DataTableState
  readonly onSort?: (columnKey: string) => void
  readonly onRowActivate?: (row: Row) => void
  readonly selectedRowKey?: string | null
  readonly className?: string
}

function stateContent(state: DataTableState): React.ReactNode {
  switch (state.kind) {
    case 'busy':
      return <p role="status">{state.message ?? 'Carregando…'}</p>
    case 'empty':
      return <p>{state.message ?? 'Nenhum registro ainda.'}</p>
    case 'no-results':
      return (
        <div>
          <p>{state.message ?? 'Nenhum resultado para os critérios atuais.'}</p>
          {state.onClear !== undefined && (
            <button type="button" onClick={state.onClear}>
              {state.clearLabel ?? 'Limpar filtros'}
            </button>
          )}
        </div>
      )
    case 'error':
      return (
        <div>
          <p role="alert">{state.message ?? 'Não foi possível carregar os registros.'}</p>
          {state.onRetry !== undefined && (
            <button type="button" onClick={state.onRetry}>
              {state.retryLabel ?? 'Tentar novamente'}
            </button>
          )}
        </div>
      )
    case 'ready':
      return null
  }
}

/**
 * A read-only consultation table. The scroll owner is intentionally the
 * wrapper, so a wide table neither expands its page nor makes each screen
 * invent its own overflow behaviour.
 */
export function DataTable<Row>({
  label,
  columns,
  rows,
  getRowKey,
  state = { kind: 'ready' },
  onSort,
  onRowActivate,
  selectedRowKey = null,
  className
}: DataTableProps<Row>): React.JSX.Element {
  const isReady = state.kind === 'ready'
  const hasRows = rows.length > 0
  const effectiveState: DataTableState = isReady && !hasRows ? { kind: 'empty' } : state

  function activateRow(event: React.KeyboardEvent<HTMLTableRowElement>, row: Row): void {
    if (onRowActivate === undefined) return
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onRowActivate(row)
  }

  return (
    <div className={['data-table', className].filter(Boolean).join(' ')}>
      <div
        className="data-table-scroll"
        tabIndex={0}
        aria-label={`${label}. Role para ver colunas`}
      >
        <table aria-label={label} aria-busy={effectiveState.kind === 'busy'}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={column.numeric ? 'cell-number' : undefined}
                  aria-sort={column.sortable ? (column.sortDirection ?? 'none') : undefined}
                >
                  {column.sortable && onSort !== undefined ? (
                    <button
                      type="button"
                      className="data-table-sort"
                      onClick={() => onSort(column.key)}
                      aria-label={`Ordenar por ${column.header}`}
                    >
                      {column.header}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {effectiveState.kind === 'ready' &&
              rows.map((row) => {
                const rowKey = getRowKey(row)
                const isSelected = rowKey === selectedRowKey
                return (
                  <tr
                    key={rowKey}
                    className={isSelected ? 'is-selected' : undefined}
                    aria-selected={onRowActivate === undefined ? undefined : isSelected}
                    tabIndex={onRowActivate === undefined ? undefined : 0}
                    onClick={onRowActivate === undefined ? undefined : () => onRowActivate(row)}
                    onKeyDown={(event) => activateRow(event, row)}
                  >
                    {columns.map((column) => (
                      <td key={column.key} className={column.numeric ? 'cell-number' : undefined}>
                        {column.cell(row)}
                      </td>
                    ))}
                  </tr>
                )
              })}
            {effectiveState.kind !== 'ready' && (
              <tr className="data-table-state-row">
                <td colSpan={Math.max(columns.length, 1)}>{stateContent(effectiveState)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

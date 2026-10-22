// The Territories page (spec 0006, Task 03; assignment history in spec 0007,
// Task 11): a header with the S-13-T import/export actions, a summary of how
// many territories are out, and the territory table -- or the AssignmentsMap
// with the leader labels, behind the "Visualização" switch.
//
// Every row shows who has the territory and since when ("Retirada"), so the
// admin can see at a glance which ones have been out the longest. Opening a
// territory -- a row or its outline on the map -- brings up the
// `TerritoryDetailDialog`, a modal with the S-13 card, the blocks and the map
// of that one territory.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LatLngTuple } from 'leaflet'
import type { S13TImportPreview } from '../../shared/ipc-contract'
import type { Territory } from '../../shared/models'
import {
  campaignHolderLabel,
  compareTerritoriesByNumber,
  getServiceYear
} from '../../shared/models'
import { parseIpcError } from '../../shared/ipc-error'
import { AssignmentsMap } from '../map/AssignmentsMap'
import { Dialog } from '../components/Dialog'
import {
  DataTable,
  type DataTableColumn,
  type DataTableSortDirection,
  type DataTableState
} from '../components/DataTable'
import { Icon } from '../components/Icon'
import { SearchField } from '../components/SearchField'
import { SegmentedControl } from '../components/SegmentedControl'
import { TerritoryDetailDialog } from './TerritoryDetailDialog'
import { daysSince, formatDaysAgo } from './territoryBlocks'

const GENERIC_ERROR_MESSAGE = 'Não foi possível completar a operação.'

function errorMessage(error: unknown): string {
  return parseIpcError(error, GENERIC_ERROR_MESSAGE).message
}

/** The one place a date is turned into text on this screen. */
function formatDate(date: Date): string {
  return date.toLocaleDateString()
}

type SituationFilter = 'all' | 'assigned' | 'free'

/** Out with somebody: a dirigente, or the publishers of an active campaign. */
function territoryIsOut(territory: Territory): boolean {
  return territory.assignedUser !== undefined || territory.campaign !== undefined
}
type SortKey = 'territory' | 'withdrawn' | 'last-work'

/**
 * How each sortable column compares two territories in ascending order. Dates
 * ascend from the oldest, so "Retirada" ascending reads "out the longest
 * first" -- the question the column is there to answer. A territory with no
 * date always goes last, whatever the direction.
 */
function compareBy(key: SortKey, left: Territory, right: Territory): number {
  if (key === 'territory') return compareTerritoriesByNumber(left.name, right.name)
  const pick = (territory: Territory): Date | undefined =>
    key === 'withdrawn' ? territory.assignedSince : territory.lastWork?.workedAt
  const leftDate = pick(left)
  const rightDate = pick(right)
  if (leftDate === undefined && rightDate === undefined) {
    return compareTerritoriesByNumber(left.name, right.name)
  }
  if (leftDate === undefined) return Number.POSITIVE_INFINITY
  if (rightDate === undefined) return Number.NEGATIVE_INFINITY
  return leftDate.getTime() - rightDate.getTime()
}

function sortTerritories(
  territories: readonly Territory[],
  key: SortKey,
  direction: DataTableSortDirection
): Territory[] {
  return [...territories].sort((left, right) => {
    const result = compareBy(key, left, right)
    // Infinite results mark "no date": they stay last in both directions.
    if (!Number.isFinite(result)) return result > 0 ? 1 : -1
    return direction === 'ascending' ? result : -result
  })
}

export interface DesignationsScreenProps {
  /** Where the map centres when there are no territories yet -- the congregation's own city. */
  readonly fallbackCenter?: LatLngTuple
  /** Overridable so a test can pin what counts as "today". */
  readonly now?: Date
}

export function DesignationsScreen({
  fallbackCenter,
  now
}: DesignationsScreenProps): React.JSX.Element {
  const today = now ?? new Date()
  const [territories, setTerritories] = useState<Territory[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const refreshInFlight = useRef(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [actionError, setActionError] = useState<string | null>(null)
  const [isActionPending, setIsActionPending] = useState(false)
  const actionInFlight = useRef(false)
  const [exportPath, setExportPath] = useState<string | null>(null)

  // The id, not the object: the dialog always gets the latest copy from the
  // list, so a reload after marking a block shows up in it immediately.
  const [openTerritoryId, setOpenTerritoryId] = useState<string | null>(null)
  const [view, setView] = useState<'list' | 'map'>('list')
  const [search, setSearch] = useState('')
  const [situation, setSituation] = useState<SituationFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('territory')
  const [sortDirection, setSortDirection] = useState<DataTableSortDirection>('ascending')

  // Only ever runs from an event handler ("Recarregar", reloading after an
  // action) -- the mount fetch below skips the synchronous reset, same
  // rationale as HomeScreen's.
  const load = useCallback(async () => {
    if (refreshInFlight.current) return
    refreshInFlight.current = true
    setIsRefreshing(true)
    setLoadError(null)
    try {
      const list = await window.api.territories.listWithBlocks()
      setTerritories(list)
      setOpenTerritoryId((current) =>
        current !== null && list.some((territory) => territory.id === current) ? current : null
      )
    } catch (error) {
      setLoadError(errorMessage(error))
    } finally {
      setIsLoading(false)
      refreshInFlight.current = false
      setIsRefreshing(false)
    }
  }, [])

  // Every state update happens in a `.then` after the effect body returned,
  // guarded against unmount.
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

  /** Turns a rejected write into a visible `role="alert"`, never an unhandled rejection. */
  const runAction = useCallback(async (action: () => Promise<void>) => {
    if (actionInFlight.current) return
    actionInFlight.current = true
    setIsActionPending(true)
    setActionError(null)
    try {
      await action()
    } catch (error) {
      setActionError(errorMessage(error))
    } finally {
      actionInFlight.current = false
      setIsActionPending(false)
    }
  }, [])

  const [showExportModal, setShowExportModal] = useState(false)
  const [selectedServiceYear, setSelectedServiceYear] = useState<number>(() => getServiceYear())
  const [exportFormat, setExportFormat] = useState<'docx' | 'xlsx'>('docx')
  const [importPreview, setImportPreview] = useState<S13TImportPreview | null>(null)
  const [importStatus, setImportStatus] = useState<string | null>(null)

  /** The spreadsheet is written by the main process; `null` means the admin
   * dismissed the save dialog, which is not an error and says nothing. */
  const exportToExcel = (): Promise<void> =>
    runAction(async () => {
      setExportPath(null)
      setImportStatus(null)
      const path = await window.api.exports.assignments()
      if (path !== null) setExportPath(path)
    })

  const exportS13T = (): Promise<void> =>
    runAction(async () => {
      setExportPath(null)
      setImportStatus(null)
      setShowExportModal(false)
      const path = await window.api.exports.s13t({
        serviceYear: selectedServiceYear,
        format: exportFormat
      })
      if (path !== null) setExportPath(path)
    })

  const importS13T = (): Promise<void> =>
    runAction(async () => {
      setExportPath(null)
      setImportStatus(null)
      const preview = await window.api.imports.s13tSelectAndPreview()
      if (preview !== null) setImportPreview(preview)
    })

  const executeImport = (preview: S13TImportPreview): Promise<void> =>
    runAction(async () => {
      setImportPreview(null)
      const result = await window.api.imports.s13tExecute(preview)
      setImportStatus(
        `Importação concluída: ${result.importedAssignmentsCount} designações processadas (${result.importedPublishersCount} novos publicadores criados).`
      )
      await load()
    })

  const assignedCount = territories.filter(territoryIsOut).length
  const unassignedCount = territories.length - assignedCount
  const coveragePercent =
    territories.length > 0 ? Math.round((assignedCount / territories.length) * 100) : 0

  const currentYear = getServiceYear()
  const availableYears = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1]

  const normalizedSearch = search.trim().toLocaleLowerCase()
  const visibleTerritories = useMemo(
    () =>
      sortTerritories(territories, sortKey, sortDirection).filter((territory) => {
        if (situation === 'assigned' && !territoryIsOut(territory)) return false
        if (situation === 'free' && territoryIsOut(territory)) return false
        if (normalizedSearch === '') return true
        return [territory.name, territory.assignedUser?.name, territory.campaign?.name].some(
          (text) => text?.toLocaleLowerCase().includes(normalizedSearch) ?? false
        )
      }),
    [territories, sortKey, sortDirection, situation, normalizedSearch]
  )
  const openTerritory = territories.find((territory) => territory.id === openTerritoryId)

  const clearFilters = (): void => {
    setSearch('')
    setSituation('all')
  }
  const tableState: DataTableState = isLoading
    ? { kind: 'busy', message: 'Carregando territórios…' }
    : loadError !== null && territories.length === 0
      ? { kind: 'error', message: loadError, onRetry: () => void load() }
      : territories.length === 0
        ? { kind: 'empty', message: 'Nenhum território cadastrado ainda.' }
        : visibleTerritories.length === 0
          ? {
              kind: 'no-results',
              message: 'Nenhum território corresponde à busca.',
              onClear: clearFilters
            }
          : { kind: 'ready' }
  const canShowMap = !isLoading && territories.length > 0 && visibleTerritories.length > 0

  const sortable = (
    key: SortKey
  ): Pick<DataTableColumn<Territory>, 'sortable' | 'sortDirection'> => ({
    sortable: true,
    sortDirection: sortKey === key ? sortDirection : undefined
  })
  const onSort = (key: string): void => {
    const next = key as SortKey
    if (next === sortKey) {
      setSortDirection((current) => (current === 'ascending' ? 'descending' : 'ascending'))
    } else {
      setSortKey(next)
      setSortDirection('ascending')
    }
  }

  const territoryColumns: readonly DataTableColumn<Territory>[] = [
    {
      key: 'territory',
      header: 'Território',
      cell: (territory) => <span className="cell-strong">{territory.name}</span>,
      ...sortable('territory')
    },
    {
      key: 'leader',
      header: 'Dirigente atual',
      cell: (territory) =>
        territory.campaign !== undefined ? (
          <span className="territory-campaign-label">
            {campaignHolderLabel(territory.campaign)}
          </span>
        ) : territory.assignedUser !== undefined ? (
          <span className="territory-leader-badge">
            <span className="avatar avatar-sm" aria-hidden="true">
              {territory.assignedUser.name.charAt(0).toUpperCase()}
            </span>
            {territory.assignedUser.name}
          </span>
        ) : (
          <span className="cell-muted">Sem dirigente</span>
        )
    },
    {
      key: 'withdrawn',
      header: 'Retirada',
      cell: (territory) =>
        territory.assignedSince === undefined ? (
          <span className="cell-muted">—</span>
        ) : (
          <span className="cell-stack">
            <span>{formatDate(territory.assignedSince)}</span>
            <span className="cell-sub">
              {formatDaysAgo(daysSince(territory.assignedSince, today))}
            </span>
          </span>
        ),
      ...sortable('withdrawn')
    },
    {
      key: 'status',
      header: 'Situação',
      cell: (territory) =>
        !territoryIsOut(territory) ? (
          <span className="status-badge status-idle">Livre</span>
        ) : (
          <span className="status-badge status-working">Em andamento</span>
        )
    },
    {
      key: 'blocks',
      header: 'Quadras',
      cell: (territory) => <span className="cell-number">{territory.blocks.length}</span>
    },
    {
      key: 'last-work',
      header: 'Último trabalho',
      cell: (territory) =>
        territory.lastWork === undefined ? (
          <span className="cell-muted">Nunca</span>
        ) : (
          <span
            className="cell-stack"
            title={`Trabalhado por ${territory.lastWork.publisher.name}`}
          >
            <span>{formatDate(territory.lastWork.workedAt)}</span>
            <span className="cell-sub">
              {formatDaysAgo(daysSince(territory.lastWork.workedAt, today))}
            </span>
          </span>
        ),
      ...sortable('last-work')
    }
  ]

  return (
    <div className="designations-screen">
      <header className="page-header">
        <div className="header-title-block">
          <h1>Territórios</h1>
          {!isLoading && territories.length > 0 && (
            <p>
              {assignedCount} de {territories.length} territórios designados
            </p>
          )}
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="icon-button"
            aria-label="Recarregar"
            title="Recarregar"
            disabled={isLoading || isRefreshing || isActionPending}
            onClick={() => void load()}
          >
            <Icon name="refresh" className={isRefreshing ? 'is-spinning' : undefined} />
          </button>
          <button type="button" disabled={isActionPending} onClick={() => void exportToExcel()}>
            <Icon name="sheet" />
            Exportar para Excel
          </button>
          <button type="button" disabled={isActionPending} onClick={() => void importS13T()}>
            <Icon name="upload" />
            Importar S-13-T
          </button>
          <button
            type="button"
            className="button-primary"
            disabled={isActionPending}
            onClick={() => setShowExportModal(true)}
          >
            <Icon name="download" />
            Exportar S-13-T
          </button>
        </div>
      </header>
      <main>
        {actionError !== null && <p role="alert">{actionError}</p>}
        {loadError !== null && territories.length > 0 && <p role="alert">{loadError}</p>}
        {exportPath !== null && <p role="status">Arquivo salvo em {exportPath}</p>}
        {importStatus !== null && <p role="status">{importStatus}</p>}

        <section className="territories-workspace" aria-label="Consulta de territórios">
          <div className="kpi-strip" aria-label="Resumo de territórios">
            <div className="kpi-tile">
              <span className="kpi-label">Territórios</span>
              <strong className="kpi-value">{territories.length}</strong>
            </div>
            <div className="kpi-tile">
              <span className="kpi-label">Designados</span>
              <strong className="kpi-value">{assignedCount}</strong>
            </div>
            <div className="kpi-tile">
              <span className="kpi-label">Livres</span>
              <strong className="kpi-value">{unassignedCount}</strong>
            </div>
            <div className="kpi-tile">
              <span className="kpi-label">Cobertura</span>
              <strong className="kpi-value">{coveragePercent}%</strong>
              <span className="kpi-meter" aria-hidden="true">
                <span style={{ width: `${coveragePercent}%` }} />
              </span>
            </div>
          </div>

          <div className="territories-workspace-toolbar">
            <SearchField
              label="Buscar territórios"
              value={search}
              placeholder="Nome, número, dirigente ou campanha"
              onChange={setSearch}
              disabled={isLoading}
            />
            <SegmentedControl
              label="Situação"
              value={situation}
              onChange={setSituation}
              options={[
                { value: 'all', label: 'Todos' },
                { value: 'assigned', label: 'Em andamento' },
                { value: 'free', label: 'Livres' }
              ]}
            />
            <SegmentedControl
              label="Visualização"
              className="toolbar-end"
              value={view}
              onChange={setView}
              options={[
                { value: 'list', label: 'Lista' },
                { value: 'map', label: 'Mapa' }
              ]}
            />
          </div>

          <div className="territories-workspace-content">
            {view === 'list' || !canShowMap ? (
              <DataTable
                label="Territórios"
                columns={territoryColumns}
                rows={visibleTerritories}
                getRowKey={(territory) => territory.id}
                state={tableState}
                onSort={onSort}
                selectedRowKey={openTerritoryId}
                onRowActivate={(territory) => setOpenTerritoryId(territory.id)}
              />
            ) : (
              <div className="territories-workspace-map">
                <AssignmentsMap
                  territories={visibleTerritories}
                  fallbackCenter={fallbackCenter}
                  onTerritoryTap={(territory) => setOpenTerritoryId(territory.id)}
                />
              </div>
            )}
          </div>
        </section>

        {openTerritory !== undefined && (
          <TerritoryDetailDialog
            territory={openTerritory}
            fallbackCenter={fallbackCenter}
            now={now}
            onClose={() => setOpenTerritoryId(null)}
            onChanged={load}
          />
        )}

        {/* S-13-T Export Modal */}
        {showExportModal && (
          <Dialog
            className="export-modal"
            size="md"
            title="Exportar Registro de Designação (S-13-T)"
            onClose={() => setShowExportModal(false)}
          >
            <p className="dialog-subtitle">
              Gera o documento oficial de Registro de Designação de Território preenchido e
              formatado.
            </p>

            <div className="field">
              <label htmlFor="export-format-select">
                Formato do Documento
                <select
                  id="export-format-select"
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value as 'docx' | 'xlsx')}
                >
                  <option value="docx">Word (.docx) — Modelo Oficial S-13-T</option>
                  <option value="xlsx">Planilha Excel (.xlsx)</option>
                </select>
              </label>
            </div>

            <div className="field">
              <label htmlFor="service-year-select">
                Ano de Serviço
                <select
                  id="service-year-select"
                  value={selectedServiceYear}
                  onChange={(e) => setSelectedServiceYear(Number(e.target.value))}
                >
                  {availableYears.map((year) => (
                    <option key={year} value={year}>
                      Ano de Serviço {year} (01/09/{year - 1} a 31/08/{year})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="dialog-actions">
              <button type="button" onClick={() => setShowExportModal(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className="button-primary"
                disabled={isActionPending}
                onClick={() => void exportS13T()}
              >
                {isActionPending ? 'Gerando…' : `Gerar S-13-T (${exportFormat.toUpperCase()})`}
              </button>
            </div>
          </Dialog>
        )}

        {/* S-13-T Import Preview Modal */}
        {importPreview !== null && (
          <Dialog
            className="import-modal"
            size="xl"
            title="Importar Registros S-13-T"
            onClose={() => setImportPreview(null)}
          >
            <p className="dialog-subtitle">
              Arquivo: <strong>{importPreview.fileName}</strong>
              {importPreview.serviceYear ? ` • Ano de Serviço ${importPreview.serviceYear}` : ''}
            </p>

            <div className="kpi-grid">
              <div className="kpi-card">
                <span className="kpi-label">Territórios no Arquivo</span>
                <strong className="kpi-value">{importPreview.totalTerritoriesFound}</strong>
              </div>
              <div className="kpi-card kpi-card-active">
                <span className="kpi-label">Correspondidos</span>
                <strong className="kpi-value">
                  {importPreview.matchedTerritoriesCount} de {importPreview.totalTerritoriesFound}
                </strong>
              </div>
              <div className="kpi-card">
                <span className="kpi-label">Designações a Importar</span>
                <strong className="kpi-value">{importPreview.totalAssignmentsCount}</strong>
              </div>
            </div>

            <div className="import-preview-list">
              <h3>Territórios identificados</h3>
              <ul>
                {importPreview.territories.map((terr, idx) => (
                  <li key={idx} className={terr.matchedTerritoryId ? 'is-matched' : 'is-unmatched'}>
                    <div className="import-preview-terr-header">
                      <strong>Território {terr.territoryNumberOrName}</strong>
                      {terr.matchedTerritoryId ? (
                        <span className="status-badge status-active">Reconhecido</span>
                      ) : (
                        <span className="status-badge status-pending">Não cadastrado</span>
                      )}
                    </div>
                    {terr.assignments.length > 0 ? (
                      <span className="import-preview-assignments">
                        {terr.assignments.map((a, aIdx) => (
                          <span key={aIdx} className="import-asg-tag">
                            {a.publisherName} ({a.startedAt || '?'}
                            {a.completedAt ? ` a ${a.completedAt}` : ' - em aberto'})
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="import-empty-hint">Sem designações registradas</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div className="dialog-actions">
              <button type="button" onClick={() => setImportPreview(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="button-primary"
                disabled={importPreview.totalAssignmentsCount === 0 || isActionPending}
                onClick={() => void executeImport(importPreview)}
              >
                {isActionPending ? 'Importando…' : 'Confirmar e Importar'}
              </button>
            </div>
          </Dialog>
        )}
      </main>
    </div>
  )
}

export default DesignationsScreen

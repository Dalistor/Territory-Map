// The "Quadras" tab of the territory dialog: every block of the territory with
// its status in words and how long since it was worked, in either of the two
// orders the admin reads it in (by number, or "where do we go today").
//
// Marking from here is always **in the name of the current leader** -- the
// common case is the leader handing back a paper card, and picking the person
// again for every block would be the only friction left. One block or a
// selection, on the date in the toolbar. Recording someone else's work stays
// one click away, in each block's history (the `BlockWorkPanel`, which lets
// the admin choose the publisher).
import { Fragment, useMemo, useState } from 'react'
import type { Block, Territory } from '../../shared/models'
import { parseIpcError } from '../../shared/ipc-error'
import { blockColorCategory, CATEGORY_COLOR } from '../map/blockColor'
import { Icon } from '../components/Icon'
import { SegmentedControl } from '../components/SegmentedControl'
import { BlockWorkPanel } from './BlockWorkPanel'
import {
  BLOCK_STATUS_LABEL,
  daysSince,
  formatDaysAgo,
  fromDateInputValue,
  sortBlocks,
  toDateInputValue,
  type BlockSortOrder
} from './territoryBlocks'

const GENERIC_ERROR_MESSAGE = 'Não foi possível marcar a quadra.'

function formatDate(date: Date): string {
  return date.toLocaleDateString()
}

function blockList(numbers: readonly number[]): string {
  if (numbers.length === 1) return `Quadra ${numbers[0]}`
  const head = numbers.slice(0, -1).join(', ')
  return `Quadras ${head} e ${numbers[numbers.length - 1]}`
}

export interface TerritoryBlocksTabProps {
  readonly territory: Territory
  /** Overridable so a test can pin what counts as "today". */
  readonly now?: Date
  /** The block to open on arrival, e.g. after tapping it on the map tab. */
  readonly initialOpenBlockId?: string | null
  /** Fired after anything that changes a block's colour, so the caller reloads. */
  readonly onChanged: () => Promise<void> | void
}

export function TerritoryBlocksTab({
  territory,
  now,
  initialOpenBlockId = null,
  onChanged
}: TerritoryBlocksTabProps): React.JSX.Element {
  const today = useMemo(() => now ?? new Date(), [now])
  const [order, setOrder] = useState<BlockSortOrder>('number')
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [workedAtValue, setWorkedAtValue] = useState(() => toDateInputValue(today))
  const [openBlockId, setOpenBlockId] = useState<string | null>(initialOpenBlockId)
  const [isMarking, setIsMarking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const leader = territory.assignedUser
  const maxDate = toDateInputValue(today)
  const dateIsValid = workedAtValue !== '' && workedAtValue <= maxDate
  const canMark = leader !== undefined && dateIsValid && !isMarking

  const blocks = useMemo(() => sortBlocks(territory.blocks, order), [territory.blocks, order])
  const selectedBlocks = blocks.filter((block) => selected.has(block.id))
  const allSelected = blocks.length > 0 && selectedBlocks.length === blocks.length

  function toggle(blockId: string): void {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(blockId)) next.delete(blockId)
      else next.add(blockId)
      return next
    })
  }

  function toggleAll(): void {
    setSelected(allSelected ? new Set() : new Set(blocks.map((block) => block.id)))
  }

  /**
   * One request per block, in order. A failure stops the run and says which
   * blocks did make it, instead of leaving the admin to guess what to retry.
   */
  async function mark(targets: readonly Block[]): Promise<void> {
    if (leader === undefined || targets.length === 0 || !dateIsValid || isMarking) return
    setIsMarking(true)
    setError(null)
    setNotice(null)
    const workedAt = fromDateInputValue(workedAtValue)
    const done: number[] = []
    try {
      for (const block of targets) {
        await window.api.workLogs.markWorked(block.id, leader.id, workedAt)
        done.push(block.number)
      }
      setNotice(
        `${blockList(done)} ${done.length === 1 ? 'marcada' : 'marcadas'} como trabalhada${
          done.length === 1 ? '' : 's'
        } em nome de ${leader.name}, em ${formatDate(workedAt)}.`
      )
      setSelected(new Set())
    } catch (caught) {
      const message = parseIpcError(caught, GENERIC_ERROR_MESSAGE).message
      setError(done.length === 0 ? message : `${message} Já marcadas: ${done.join(', ')}.`)
    } finally {
      setIsMarking(false)
      if (done.length > 0) await onChanged()
    }
  }

  if (territory.blocks.length === 0) {
    return (
      <div className="empty-state">
        <Icon name="grid" size={28} />
        <p>Este território ainda não tem quadras desenhadas.</p>
        <p className="empty-state-hint">Desenhe as quadras pelo Mapa, no menu do território.</p>
      </div>
    )
  }

  return (
    <div className="territory-blocks">
      <div className="territory-blocks-toolbar">
        <SegmentedControl
          label="Ordenar por"
          value={order}
          onChange={setOrder}
          options={[
            { value: 'number', label: 'Número' },
            { value: 'longest-unworked', label: 'Mais tempo sem trabalho' }
          ]}
        />
        <label className="field territory-blocks-date">
          <span>Data do trabalho</span>
          <input
            type="date"
            value={workedAtValue}
            max={maxDate}
            aria-invalid={!dateIsValid}
            onChange={(event) => setWorkedAtValue(event.target.value)}
          />
        </label>
        <div className="territory-blocks-bulk">
          <span className="territory-blocks-bulk-hint">
            {leader === undefined ? (
              'Sem dirigente: designe o território para marcar em nome dele.'
            ) : (
              <>
                Em nome de <strong>{leader.name}</strong>
              </>
            )}
          </span>
          <button
            type="button"
            className="button-primary"
            disabled={!canMark || selectedBlocks.length === 0}
            onClick={() => void mark(selectedBlocks)}
          >
            <Icon name="check" />
            {isMarking
              ? 'Marcando…'
              : selectedBlocks.length === 0
                ? 'Marcar selecionadas'
                : `Marcar ${selectedBlocks.length} selecionada${selectedBlocks.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>

      {!dateIsValid && (
        <p className="field-error">A data do trabalho não pode ficar vazia nem estar no futuro.</p>
      )}
      {error !== null && <p role="alert">{error}</p>}
      {notice !== null && (
        <p role="status" className="notice-success">
          {notice}
        </p>
      )}

      <div className="data-table territory-blocks-table">
        <div className="data-table-scroll">
          <table aria-label={`Quadras de ${territory.name}`}>
            <thead>
              <tr>
                <th scope="col" className="cell-check">
                  <input
                    type="checkbox"
                    aria-label="Selecionar todas as quadras"
                    checked={allSelected}
                    onChange={toggleAll}
                  />
                </th>
                <th scope="col">Quadra</th>
                <th scope="col">Situação</th>
                <th scope="col">Última visita</th>
                <th scope="col" className="cell-actions">
                  <span className="visually-hidden">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {blocks.map((block) => {
                const category = blockColorCategory(block, today, territory.rotationDays)
                const isForced = block.statusOverride !== undefined && block.statusOverride !== null
                const isOpen = openBlockId === block.id
                return (
                  <Fragment key={block.id}>
                    <tr className={selected.has(block.id) ? 'is-selected' : undefined}>
                      <td className="cell-check">
                        <input
                          type="checkbox"
                          aria-label={`Selecionar quadra ${block.number}`}
                          checked={selected.has(block.id)}
                          onChange={() => toggle(block.id)}
                        />
                      </td>
                      <td>
                        <span className="block-number">{block.number}</span>
                      </td>
                      <td>
                        <span className={`block-status block-status-${category}`}>
                          <span
                            className="block-status-dot"
                            style={{ background: CATEGORY_COLOR[category] }}
                            aria-hidden="true"
                          />
                          {BLOCK_STATUS_LABEL[category]}
                          {isForced && <span className="block-status-forced"> (forçado)</span>}
                        </span>
                      </td>
                      <td>
                        {block.lastWorkedAt === undefined || block.lastWorkedAt === null ? (
                          <span className="cell-muted">Nunca</span>
                        ) : (
                          <span className="cell-stack">
                            <span>{formatDate(block.lastWorkedAt)}</span>
                            <span className="cell-sub">
                              {formatDaysAgo(daysSince(block.lastWorkedAt, today))}
                            </span>
                          </span>
                        )}
                      </td>
                      <td className="cell-actions">
                        <div className="row-actions">
                          <button
                            type="button"
                            className="button-small"
                            disabled={!canMark}
                            title={
                              leader === undefined
                                ? 'Designe um dirigente para marcar em nome dele'
                                : `Marcar em nome de ${leader.name}`
                            }
                            aria-label={`Marcar quadra ${block.number} como trabalhada`}
                            onClick={() => void mark([block])}
                          >
                            <Icon name="check" />
                            Marcar
                          </button>
                          <button
                            type="button"
                            className="button-small button-quiet"
                            aria-expanded={isOpen}
                            aria-label={`Histórico da quadra ${block.number}`}
                            onClick={() => setOpenBlockId(isOpen ? null : block.id)}
                          >
                            <Icon name="history" />
                            Histórico
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="block-history-row">
                        <td colSpan={5}>
                          <section aria-label={`Trabalho da quadra ${block.number}`}>
                            <BlockWorkPanel
                              territory={territory}
                              block={block}
                              now={now}
                              onChanged={() => void onChanged()}
                            />
                          </section>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default TerritoryBlocksTab

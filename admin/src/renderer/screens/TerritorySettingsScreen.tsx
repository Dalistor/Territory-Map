// The per-territory settings page (spec 0009, Task 09): the name, the
// rotation, a read-only summary and the delete action.
import { Fragment, useMemo, useRef, useState } from 'react'
import { campaignHolderLabel, type Territory } from '../../shared/models'
import { parseIpcError } from '../../shared/ipc-error'
import type { BlockColorCategory } from '../map/blockColor'
import { DEFAULT_ROTATION_DAYS, blockColorCategory } from '../map/blockColor'
import { deleteTerritoryConfirmMessage } from './confirmMessages'
import { BlockWorkPanel } from './BlockWorkPanel'

/** `dd/mm/yyyy` in local time -- the same shape `BlockHistorySheet` shows a visit in. */
function formatDate(moment: Date): string {
  const two = (value: number): string => value.toString().padStart(2, '0')
  return `${two(moment.getDate())}/${two(moment.getMonth() + 1)}/${moment.getFullYear()}`
}

/**
 * How each colour of the map reads in words. The table says the status out
 * loud instead of relying on the colour alone -- the same three categories
 * `blockColorCategory` already decides, never a second copy of the rule.
 */
const CATEGORY_LABEL: Record<BlockColorCategory, string> = {
  never: 'Nunca trabalhada',
  overdue: 'Vencida',
  recent: 'Recente'
}

const BLANK_NAME_ERROR_MESSAGE = 'O nome do território não pode ficar em branco.'
const ROTATION_ERROR_MESSAGE =
  'O tempo de rotação precisa ser um número inteiro de dias maior que zero, ou ficar vazio para usar o padrão.'

/**
 * What the rotation field means: `null` for an empty field (the default
 * rotation, a legitimate value), a positive whole number of days, or
 * `'invalid'` for anything else -- text, zero, a negative or a fraction.
 * Blocking here is the point: the admin sees why before a request is made.
 */
function parseRotation(typed: string): number | null | 'invalid' {
  const trimmed = typed.trim()
  if (trimmed === '') return null
  if (!/^\d+$/.test(trimmed)) return 'invalid'
  const days = Number(trimmed)
  return days > 0 ? days : 'invalid'
}

export interface TerritorySettingsScreenProps {
  /** The territory, with its blocks already loaded by `HomeScreen`. */
  readonly territory: Territory
  /** Overridable so a test can pin what counts as "today" in the summary. */
  readonly now?: Date
  /** Fired after a successful save, so the caller decides what happens next. */
  readonly onSaved?: () => void
  /** Fired after the territory is really gone -- the caller leaves this screen. */
  readonly onDeleted?: () => void
}

export function TerritorySettingsScreen({
  territory,
  now,
  onSaved,
  onDeleted
}: TerritorySettingsScreenProps): React.JSX.Element {
  // The caller hands the territory over already loaded, so a change made in
  // the work panel below would otherwise leave this page showing the state of
  // the moment the admin arrived. This holds the version fetched after such a
  // change; the prop stays the fallback, and the id guard makes a navigation
  // to another territory drop a stale refresh instead of showing it.
  const [refreshed, setRefreshed] = useState<Territory | null>(null)
  const current = refreshed !== null && refreshed.id === territory.id ? refreshed : territory

  const [name, setName] = useState(territory.name)
  // A string, not a number: the empty string is a meaningful value here
  // ("use the default rotation"), and the field also has to be able to hold
  // whatever the admin typed while it is still invalid, so the message can
  // name it.
  const [rotation, setRotation] = useState(
    territory.rotationDays === undefined || territory.rotationDays === null
      ? ''
      : String(territory.rotationDays)
  )

  // The same rule the map colours by (`blockColorCategory`, spec 0009 Task
  // 07), read here instead of recounted -- a second copy of "what counts as
  // overdue" would drift from the map the first time either changed.
  const summary = useMemo(() => {
    const moment = now ?? new Date()
    let overdue = 0
    let never = 0
    let lastVisit: Date | null = null
    for (const block of current.blocks) {
      const category = blockColorCategory(block, moment, current.rotationDays)
      if (category === 'overdue') overdue += 1
      if (category === 'never') never += 1
      const workedAt = block.lastWorkedAt
      if (workedAt !== undefined && (lastVisit === null || workedAt > lastVisit)) {
        lastVisit = workedAt
      }
    }
    return { total: current.blocks.length, overdue, never, lastVisit }
  }, [now, current.blocks, current.rotationDays])

  // Ordered here rather than trusted from the API: the table is read as a
  // numbered list, and a territory whose blocks came back in creation order
  // would read as shuffled.
  const sortedBlocks = useMemo(
    () => [...current.blocks].sort((a, b) => a.number - b.number),
    [current.blocks]
  )

  const rows = useMemo(() => {
    const moment = now ?? new Date()
    return sortedBlocks.map((block) => ({
      block,
      category: blockColorCategory(block, moment, current.rotationDays)
    }))
  }, [now, sortedBlocks, current.rotationDays])

  // Which block has its work panel open, or `null` for none. A single id,
  // not a set: opening another row moves the panel instead of stacking a
  // second one, which is what keeps the page readable while the admin walks
  // block by block.
  const [openBlockId, setOpenBlockId] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const deleteInFlight = useRef(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Re-reads this territory after the work panel changed something. There is
   * no per-territory read on the bridge -- `listWithBlocks` is the one call
   * that brings blocks along -- so the page picks its own territory out of
   * the listing. A territory gone from it means someone else deleted it, and
   * the page keeps what it has rather than blanking the table.
   */
  async function handleBlocksChanged(): Promise<void> {
    try {
      const territories = await window.api.territories.listWithBlocks()
      const fresh = territories.find((candidate) => candidate.id === territory.id)
      if (fresh !== undefined) setRefreshed(fresh)
    } catch (thrown) {
      setError(parseIpcError(thrown, 'Não foi possível recarregar as quadras.').message)
    }
  }

  async function handleSave(): Promise<void> {
    const trimmedName = name.trim()
    if (trimmedName === '') {
      setError(BLANK_NAME_ERROR_MESSAGE)
      return
    }

    const rotationDays = parseRotation(rotation)
    if (rotationDays === 'invalid') {
      setError(ROTATION_ERROR_MESSAGE)
      return
    }

    setSaving(true)
    setError(null)
    try {
      await window.api.territories.update(territory.id, {
        name: trimmedName,
        rotationDays
      })
      onSaved?.()
    } catch (thrown) {
      setError(parseIpcError(thrown, 'Não foi possível salvar as configurações.').message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(): Promise<void> {
    if (!window.confirm(deleteTerritoryConfirmMessage(current))) return
    if (deleteInFlight.current) return
    deleteInFlight.current = true
    setDeleting(true)
    setError(null)
    try {
      await window.api.territories.delete(territory.id)
      onDeleted?.()
    } catch (thrown) {
      setError(parseIpcError(thrown, 'Não foi possível apagar o território.').message)
    } finally {
      deleteInFlight.current = false
      setDeleting(false)
    }
  }

  return (
    <div className="screen screen-settings">
      <header className="screen-header">
        <div className="screen-title-block">
          <p className="eyebrow">Territórios</p>
          <h2>Configurações de {current.name}</h2>
        </div>
      </header>
      <main className="screen-body settings-screen">
        <label className="field">
          Nome do território
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>

        <label className="field">
          Tempo de rotação (dias)
          {/* Not `type="number"`: an invalid keystroke in a number input is
              reported back as an empty value, which here would silently read
              as "use the default" -- exactly the misreading this screen has
              to avoid. Text plus `inputMode` keeps the numeric keypad and
              lets the validation below name what was typed. */}
          <input
            type="text"
            inputMode="numeric"
            value={rotation}
            onChange={(event) => setRotation(event.target.value)}
          />
        </label>
        <p className="field-hint">
          Deixe vazio para usar o padrão de {DEFAULT_ROTATION_DAYS} dias. Passado esse tempo sem
          visita, a quadra volta a aparecer como vencida no mapa.
        </p>

        <button
          type="button"
          className="button-primary"
          onClick={() => void handleSave()}
          disabled={saving}
        >
          {saving ? 'Salvando…' : 'Salvar'}
        </button>

        {error !== null && <p role="alert">{error}</p>}

        <section className="settings-summary screen-card">
          <h3>Resumo</h3>
          <dl>
            <dt>Quadras</dt>
            <dd data-testid="summary-block-count">{summary.total}</dd>
            <dt>Quadras vencidas</dt>
            <dd data-testid="summary-overdue-count">{summary.overdue}</dd>
            <dt>Quadras nunca trabalhadas</dt>
            <dd data-testid="summary-never-count">{summary.never}</dd>
            <dt>Designado a</dt>
            <dd data-testid="summary-assigned-user">
              {current.campaign !== undefined
                ? campaignHolderLabel(current.campaign)
                : (current.assignedUser?.name ?? 'Nenhum')}
            </dd>
            <dt>Última visita registrada</dt>
            <dd data-testid="summary-last-visit">
              {summary.lastVisit === null ? 'Nunca trabalhada' : formatDate(summary.lastVisit)}
            </dd>
          </dl>
        </section>

        <section className="settings-blocks screen-card">
          <h3>Quadras do território</h3>
          {rows.length === 0 ? (
            <p>
              Este território ainda não tem nenhuma quadra. Desenhe a primeira pelo mapa da tela
              inicial.
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th scope="col">Número</th>
                  <th scope="col">Status</th>
                  <th scope="col">Última visita</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ block, category }) => (
                  <Fragment key={block.id}>
                    <tr>
                      <td>
                        {/* The number itself is the control, so the cell still
                            reads as the number it is; the label is what names
                            the row for a screen reader. */}
                        <button
                          type="button"
                          className="block-row-toggle"
                          aria-label={`Quadra ${block.number}`}
                          aria-expanded={openBlockId === block.id}
                          onClick={() =>
                            setOpenBlockId((current) => (current === block.id ? null : block.id))
                          }
                        >
                          {block.number}
                        </button>
                      </td>
                      <td>
                        {CATEGORY_LABEL[category]}
                        {block.statusOverride !== undefined && block.statusOverride !== null && (
                          /* Without this the row would silently contradict the
                             date in the next column, and the admin would read
                             the calculation as broken instead of as his own
                             choice. */
                          <span className="block-status-forced"> (forçado)</span>
                        )}
                      </td>
                      <td>
                        {block.lastWorkedAt === undefined || block.lastWorkedAt === null
                          ? 'Nunca trabalhada'
                          : formatDate(block.lastWorkedAt)}
                      </td>
                    </tr>
                    {openBlockId === block.id && (
                      <tr>
                        <td colSpan={3}>
                          <section aria-label={`Trabalho da quadra ${block.number}`}>
                            <BlockWorkPanel
                              territory={current}
                              block={block}
                              now={now}
                              onChanged={() => void handleBlocksChanged()}
                            />
                          </section>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="settings-danger screen-danger-zone">
          <button
            type="button"
            className="button-danger"
            disabled={deleting}
            onClick={() => void handleDelete()}
          >
            {deleting ? 'Apagando…' : 'Apagar território'}
          </button>
        </section>
      </main>
    </div>
  )
}

export default TerritorySettingsScreen

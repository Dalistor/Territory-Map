// The per-territory settings page (spec 0009, Task 09): the name, the
// rotation, a read-only summary and the delete action.
import { useMemo, useState } from 'react'
import type { Territory } from '../../shared/models'
import { parseIpcError } from '../../shared/ipc-error'
import { DEFAULT_ROTATION_DAYS, blockColorCategory } from '../map/blockColor'
import { deleteTerritoryConfirmMessage } from './confirmMessages'

/** `dd/mm/yyyy` in local time -- the same shape `BlockHistorySheet` shows a visit in. */
function formatDate(moment: Date): string {
  const two = (value: number): string => value.toString().padStart(2, '0')
  return `${two(moment.getDate())}/${two(moment.getMonth() + 1)}/${moment.getFullYear()}`
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
    for (const block of territory.blocks) {
      const category = blockColorCategory(block, moment, territory.rotationDays)
      if (category === 'overdue') overdue += 1
      if (category === 'never') never += 1
      const workedAt = block.lastWorkedAt
      if (workedAt !== undefined && (lastVisit === null || workedAt > lastVisit)) {
        lastVisit = workedAt
      }
    }
    return { total: territory.blocks.length, overdue, never, lastVisit }
  }, [now, territory.blocks, territory.rotationDays])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    if (!window.confirm(deleteTerritoryConfirmMessage(territory))) return
    setError(null)
    try {
      await window.api.territories.delete(territory.id)
      onDeleted?.()
    } catch (thrown) {
      setError(parseIpcError(thrown, 'Não foi possível apagar o território.').message)
    }
  }

  return (
    <div>
      <header>
        <h2>Configurações de {territory.name}</h2>
      </header>
      <main className="settings-screen">
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

        <section className="settings-summary">
          <h3>Resumo</h3>
          <dl>
            <dt>Quadras</dt>
            <dd data-testid="summary-block-count">{summary.total}</dd>
            <dt>Quadras vencidas</dt>
            <dd data-testid="summary-overdue-count">{summary.overdue}</dd>
            <dt>Quadras nunca trabalhadas</dt>
            <dd data-testid="summary-never-count">{summary.never}</dd>
            <dt>Designado a</dt>
            <dd data-testid="summary-assigned-user">{territory.assignedUser?.name ?? 'Nenhum'}</dd>
            <dt>Última visita registrada</dt>
            <dd data-testid="summary-last-visit">
              {summary.lastVisit === null ? 'Nunca trabalhada' : formatDate(summary.lastVisit)}
            </dd>
          </dl>
        </section>

        <section className="settings-danger">
          <button type="button" className="block-action-danger" onClick={() => void handleDelete()}>
            Apagar território
          </button>
        </section>
      </main>
    </div>
  )
}

export default TerritorySettingsScreen

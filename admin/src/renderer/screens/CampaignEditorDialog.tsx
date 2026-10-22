// The form behind "Nova campanha" and "Editar": a name and the territories the
// campaign groups, picked from a searchable list or straight on the map.
//
// A territory already in another active campaign stays visible but cannot be
// picked, and says which campaign holds it -- the server would refuse it
// anyway (one active campaign per territory), and hiding it would leave the
// admin wondering where it went. This dialog only collects the input; what a
// change does to an active campaign, and the confirmation it needs, is the
// screen's business.
import { useMemo, useState } from 'react'
import type { LatLngTuple } from 'leaflet'
import type { CampaignCreateInput } from '../../shared/ipc-contract'
import { compareTerritoriesByNumber, type Territory } from '../../shared/models'
import { parseIpcError } from '../../shared/ipc-error'
import { AssignmentsMap } from '../map/AssignmentsMap'
import { Dialog } from '../components/Dialog'
import { SearchField } from '../components/SearchField'
import { SegmentedControl } from '../components/SegmentedControl'

const GENERIC_ERROR_MESSAGE = 'Não foi possível salvar a campanha.'

function searchable(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase()
}

export interface CampaignEditorDialogProps {
  readonly title: string
  readonly submitLabel: string
  readonly initialName?: string
  readonly initialTerritoryIds?: readonly string[]
  /** Every territory of the congregation, with its boundary for the map. */
  readonly territories: readonly Territory[]
  /** Territory id -> name of the other active campaign that holds it. */
  readonly blockedBy: ReadonlyMap<string, string>
  readonly fallbackCenter?: LatLngTuple
  /** Rejects with the server's refusal, which the dialog shows in place. */
  readonly onSubmit: (input: CampaignCreateInput) => Promise<void>
  readonly onClose: () => void
}

export function CampaignEditorDialog({
  title,
  submitLabel,
  initialName = '',
  initialTerritoryIds = [],
  territories,
  blockedBy,
  fallbackCenter,
  onSubmit,
  onClose
}: CampaignEditorDialogProps): React.JSX.Element {
  const [name, setName] = useState(initialName)
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set(initialTerritoryIds))
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'list' | 'map'>('list')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const ordered = useMemo(
    () => [...territories].sort((a, b) => compareTerritoriesByNumber(a.name, b.name)),
    [territories]
  )
  const term = searchable(search.trim())
  const visible = ordered.filter((territory) => searchable(territory.name).includes(term))

  function toggle(territoryId: string): void {
    if (blockedBy.has(territoryId)) return
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(territoryId)) next.delete(territoryId)
      else next.add(territoryId)
      return next
    })
  }

  const trimmedName = name.trim()
  const canSave = trimmedName !== '' && selected.size > 0 && !isSaving
  // Says why the save button is off, instead of leaving a dead button to guess at.
  const missingInput =
    trimmedName === '' && selected.size === 0
      ? 'Dê um nome e escolha ao menos um território.'
      : trimmedName === ''
        ? 'Dê um nome à campanha.'
        : selected.size === 0
          ? 'Escolha ao menos um território.'
          : null

  async function submit(): Promise<void> {
    if (!canSave) return
    setIsSaving(true)
    setError(null)
    try {
      // Kept in the congregation's reading order, so the reply lists them the same way.
      const territoryIds = ordered.map((t) => t.id).filter((id) => selected.has(id))
      await onSubmit({ name: trimmedName, territoryIds })
    } catch (caught) {
      setError(parseIpcError(caught, GENERIC_ERROR_MESSAGE).message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog
      title={title}
      size="xl"
      className="campaign-editor"
      closeLabel="Fechar"
      onClose={onClose}
    >
      <div className="dialog-body">
        {error !== null && (
          <p className="dialog-error" role="alert">
            {error}
          </p>
        )}

        <label className="field">
          <span>Nome da campanha</span>
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>

        <div className="campaign-editor-toolbar">
          <SearchField
            label="Buscar territórios"
            value={search}
            placeholder="Nome ou número do território"
            onChange={setSearch}
          />
          <SegmentedControl
            label="Visualização"
            value={view}
            onChange={setView}
            options={[
              { value: 'list', label: 'Lista' },
              { value: 'map', label: 'Mapa' }
            ]}
          />
          <p className="campaign-editor-count" aria-live="polite">
            {selected.size === 1
              ? '1 território escolhido'
              : `${selected.size} territórios escolhidos`}
          </p>
        </div>

        {view === 'list' ? (
          <div className="campaign-pick-list" role="group" aria-label="Territórios da campanha">
            {visible.length === 0 ? (
              <p className="cell-muted">Nenhum território corresponde à busca.</p>
            ) : (
              <ul>
                {visible.map((territory) => {
                  const blockingCampaign = blockedBy.get(territory.id)
                  return (
                    <li
                      key={territory.id}
                      className={blockingCampaign === undefined ? undefined : 'is-blocked'}
                    >
                      <label className="campaign-pick">
                        <input
                          type="checkbox"
                          checked={selected.has(territory.id)}
                          disabled={blockingCampaign !== undefined}
                          onChange={() => toggle(territory.id)}
                        />
                        <span className="campaign-pick-name">{territory.name}</span>
                        <span className="cell-sub">
                          {blockingCampaign !== undefined
                            ? `Na campanha "${blockingCampaign}"`
                            : territory.assignedUser !== undefined
                              ? `Dirigente atual: ${territory.assignedUser.name}`
                              : 'Sem dirigente'}
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        ) : (
          <div className="campaign-pick-map">
            <AssignmentsMap
              territories={visible}
              selectedIds={selected}
              fallbackCenter={fallbackCenter}
              onTerritoryTap={(territory) => toggle(territory.id)}
            />
            <p className="cell-sub">
              Clique num território para incluí-lo ou tirá-lo. Os que estão em outra campanha ativa
              não mudam.
            </p>
          </div>
        )}
      </div>

      <div className="dialog-actions">
        {missingInput !== null && <p className="dialog-actions-hint">{missingInput}</p>}
        <button type="button" disabled={isSaving} onClick={onClose}>
          Cancelar
        </button>
        <button
          type="button"
          className="button-primary"
          disabled={!canSave}
          onClick={() => void submit()}
        >
          {isSaving ? 'Salvando…' : submitLabel}
        </button>
      </div>
    </Dialog>
  )
}

export default CampaignEditorDialog

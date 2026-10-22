// Picks who works a campaign: used both to designate it (opening a period)
// and to change the publishers of the period already open. At least one
// publisher is required -- a campaign out with nobody in it would leave every
// territory of it without anyone allowed to mark a block.
//
// Only active publishers are offered, the same rule the territory's own
// "Designar" follows; somebody already in the period stays listed even if
// deactivated since, so changing the list never drops them silently.
import { useState } from 'react'
import type { PublisherBrief } from '../../shared/models'
import { parseIpcError } from '../../shared/ipc-error'
import { Dialog } from '../components/Dialog'
import { SearchField } from '../components/SearchField'

const GENERIC_ERROR_MESSAGE = 'Não foi possível salvar os publicadores.'

export interface CampaignPublishersDialogProps {
  readonly title: string
  /** One sentence on what confirming does, shown above the list. */
  readonly description: string
  readonly submitLabel: string
  readonly publishers: readonly PublisherBrief[]
  readonly initialSelectedIds?: readonly string[]
  /** Rejects with the server's refusal, which the dialog shows in place. */
  readonly onSubmit: (publisherIds: string[]) => Promise<void>
  readonly onClose: () => void
}

export function CampaignPublishersDialog({
  title,
  description,
  submitLabel,
  publishers,
  initialSelectedIds = [],
  onSubmit,
  onClose
}: CampaignPublishersDialogProps): React.JSX.Element {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set(initialSelectedIds))
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const term = search.trim().toLocaleLowerCase()
  const visible = publishers.filter((publisher) =>
    publisher.name.toLocaleLowerCase().includes(term)
  )

  function toggle(publisherId: string): void {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(publisherId)) next.delete(publisherId)
      else next.add(publisherId)
      return next
    })
  }

  async function submit(): Promise<void> {
    if (selected.size === 0 || isSaving) return
    setIsSaving(true)
    setError(null)
    try {
      await onSubmit(publishers.map((p) => p.id).filter((id) => selected.has(id)))
    } catch (caught) {
      setError(parseIpcError(caught, GENERIC_ERROR_MESSAGE).message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog title={title} size="md" className="campaign-publishers" onClose={onClose}>
      <p className="dialog-subtitle">{description}</p>
      {error !== null && (
        <p className="dialog-error" role="alert">
          {error}
        </p>
      )}

      <SearchField
        label="Buscar publicadores"
        value={search}
        placeholder="Nome do publicador"
        onChange={setSearch}
      />

      <div className="campaign-pick-list" role="group" aria-label="Publicadores da campanha">
        {publishers.length === 0 ? (
          <p className="cell-muted">Nenhum publicador ativo. Cadastre na página Publicadores.</p>
        ) : visible.length === 0 ? (
          <p className="cell-muted">Nenhum publicador corresponde à busca.</p>
        ) : (
          <ul>
            {visible.map((publisher) => (
              <li key={publisher.id}>
                <label className="campaign-pick">
                  <input
                    type="checkbox"
                    checked={selected.has(publisher.id)}
                    onChange={() => toggle(publisher.id)}
                  />
                  <span className="campaign-pick-name">{publisher.name}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="campaign-editor-count" aria-live="polite">
        {selected.size === 0
          ? 'Escolha ao menos um publicador.'
          : selected.size === 1
            ? '1 publicador escolhido'
            : `${selected.size} publicadores escolhidos`}
      </p>

      <div className="dialog-actions">
        <button type="button" disabled={isSaving} onClick={onClose}>
          Cancelar
        </button>
        <button
          type="button"
          className="button-primary"
          disabled={selected.size === 0 || isSaving}
          onClick={() => void submit()}
        >
          {isSaving ? 'Salvando…' : submitLabel}
        </button>
      </div>
    </Dialog>
  )
}

export default CampaignPublishersDialog

// The Campanhas page (spec 0017, Task 06): the campaigns of the congregation
// on the left, the one selected on the right -- its territories on a map that
// draws only their outlines, who works it now, and every period it was out.
//
// Everything that changes a campaign lives here and only here: create, rename
// and change territories, designate (which replaces the dirigente of each of
// its territories), change the publishers of the open period, complete and
// delete. The territory dialog and the history only name the campaign on its
// lines. Each write answers with the campaign as the server left it, and the
// page then reloads territories too, because their holders moved with it.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LatLngTuple } from 'leaflet'
import type { CampaignCreateInput } from '../../shared/ipc-contract'
import {
  campaignHolderLabel,
  campaignIsActive,
  compareTerritoriesByNumber,
  type Campaign,
  type Publisher,
  type PublisherBrief,
  type Territory
} from '../../shared/models'
import { parseIpcError } from '../../shared/ipc-error'
import { AssignmentsMap } from '../map/AssignmentsMap'
import { useConfirm } from '../components/ConfirmDialog'
import { Icon } from '../components/Icon'
import { SearchField } from '../components/SearchField'
import { CampaignEditorDialog } from './CampaignEditorDialog'
import { CampaignPublishersDialog } from './CampaignPublishersDialog'
import {
  changeActiveCampaignTerritoriesConfirmMessage,
  completeCampaignConfirmMessage,
  deleteCampaignConfirmMessage,
  designateCampaignConfirmMessage,
  type ReplacedLeader
} from './confirmMessages'
import { formatDate } from '../formatDate'

const GENERIC_ERROR_MESSAGE = 'Não foi possível completar a operação.'

function errorMessage(error: unknown): string {
  return parseIpcError(error, GENERIC_ERROR_MESSAGE).message
}

function territoryCountLabel(count: number): string {
  return count === 1 ? '1 território' : `${count} territórios`
}

type CampaignSituation = 'active' | 'completed' | 'never'

function situationOf(campaign: Campaign): CampaignSituation {
  if (campaignIsActive(campaign)) return 'active'
  return campaign.designations.length > 0 ? 'completed' : 'never'
}

const SITUATION_LABEL: Record<CampaignSituation, string> = {
  active: 'Em andamento',
  completed: 'Concluída',
  never: 'Não designada'
}

function SituationBadge({ campaign }: { campaign: Campaign }): React.JSX.Element {
  const situation = situationOf(campaign)
  return (
    <span className={`status-badge ${situation === 'active' ? 'status-working' : 'status-idle'}`}>
      {SITUATION_LABEL[situation]}
    </span>
  )
}

/**
 * The individual dirigentes a campaign would replace if these territories
 * went out with it now: every one of them that has a dirigente of its own.
 */
function replacedLeaders(
  territoryIds: readonly string[],
  territories: readonly Territory[]
): ReplacedLeader[] {
  const wanted = new Set(territoryIds)
  return territories
    .filter((territory) => wanted.has(territory.id) && territory.assignedUser !== undefined)
    .sort((a, b) => compareTerritoriesByNumber(a.name, b.name))
    .map((territory) => ({
      territoryName: territory.name,
      leaderName: territory.assignedUser?.name ?? ''
    }))
}

/** Territory id -> name of the active campaign other than `exceptId` that holds it. */
function territoriesHeldByOtherCampaigns(
  campaigns: readonly Campaign[],
  exceptId: string | null
): Map<string, string> {
  const held = new Map<string, string>()
  for (const campaign of campaigns) {
    if (campaign.id === exceptId || !campaignIsActive(campaign)) continue
    for (const territory of campaign.territories) held.set(territory.id, campaign.name)
  }
  return held
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && [...left].sort().join() === [...right].sort().join()
}

type OpenDialog =
  | { readonly kind: 'create' }
  | { readonly kind: 'edit' }
  | { readonly kind: 'designate' }
  | { readonly kind: 'publishers' }

export interface CampaignsScreenProps {
  /** Where the map centres when there is nothing to draw -- the congregation's city. */
  readonly fallbackCenter?: LatLngTuple
}

export function CampaignsScreen({ fallbackCenter }: CampaignsScreenProps): React.JSX.Element {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [territories, setTerritories] = useState<Territory[]>([])
  const [publishers, setPublishers] = useState<Publisher[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { confirm, confirmDialog } = useConfirm()
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isActionPending, setIsActionPending] = useState(false)
  const actionInFlight = useRef(false)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [dialog, setDialog] = useState<OpenDialog | null>(null)

  const fetchAll = useCallback(
    () =>
      Promise.all([
        window.api.campaigns.list(),
        window.api.territories.listWithBlocks(),
        window.api.publishers.list()
      ]),
    []
  )

  const apply = useCallback(
    ([campaignList, territoryList, publisherList]: [Campaign[], Territory[], Publisher[]]) => {
      setCampaigns(campaignList)
      setTerritories(territoryList)
      setPublishers(publisherList)
      // A selection the reload no longer returns closes the detail.
      setSelectedId((current) =>
        current !== null && campaignList.some((campaign) => campaign.id === current)
          ? current
          : null
      )
    },
    []
  )

  const reload = useCallback(async () => {
    setLoadError(null)
    setIsLoading(true)
    try {
      apply(await fetchAll())
    } catch (error) {
      setLoadError(errorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }, [apply, fetchAll])

  // Every state update happens in a `.then`, after the effect body returned,
  // guarded against unmount.
  useEffect(() => {
    let cancelled = false
    fetchAll()
      .then((result) => {
        if (!cancelled) apply(result)
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
  }, [apply, fetchAll])

  /** A page-level write: its failure shows as an alert over the detail. */
  const runAction = useCallback(
    async (action: () => Promise<void>) => {
      if (actionInFlight.current) return
      actionInFlight.current = true
      setIsActionPending(true)
      setActionError(null)
      try {
        await action()
        await reload()
      } catch (error) {
        setActionError(errorMessage(error))
      } finally {
        actionInFlight.current = false
        setIsActionPending(false)
      }
    },
    [reload]
  )

  const selected = campaigns.find((campaign) => campaign.id === selectedId)
  const activeCount = campaigns.filter(campaignIsActive).length
  const term = search.trim().toLocaleLowerCase()
  const visibleCampaigns = campaigns.filter((campaign) =>
    campaign.name.toLocaleLowerCase().includes(term)
  )
  const territoriesById = useMemo(
    () => new Map(territories.map((territory) => [territory.id, territory])),
    [territories]
  )
  const selectedTerritories = useMemo(
    () =>
      (selected?.territories ?? [])
        .map((brief) => territoriesById.get(brief.id))
        .filter((territory): territory is Territory => territory !== undefined)
        .sort((a, b) => compareTerritoriesByNumber(a.name, b.name)),
    [selected, territoriesById]
  )

  // Offered to designate: the active publishers, plus anyone already in the
  // open period (a deactivated person must not drop out of the list unseen).
  const publisherOptions = useMemo((): PublisherBrief[] => {
    const options: PublisherBrief[] = publishers
      .filter((publisher) => publisher.isActive)
      .map(({ id, name }) => ({ id, name }))
    for (const current of selected?.currentDesignation?.publishers ?? []) {
      if (!options.some((option) => option.id === current.id)) options.push(current)
    }
    return options.sort((a, b) => a.name.localeCompare(b.name))
  }, [publishers, selected])

  /** Closes the detail and hands focus back to the row that opened it. */
  function closeDetail(): void {
    if (selectedId === null) return
    document.querySelector<HTMLElement>(`[data-campaign-id="${selectedId}"]`)?.focus()
    setSelectedId(null)
  }

  async function create(input: CampaignCreateInput): Promise<void> {
    const created = await window.api.campaigns.create(input)
    setDialog(null)
    setSelectedId(created.id)
    await reload()
  }

  async function edit(campaign: Campaign, input: CampaignCreateInput): Promise<void> {
    const currentIds = campaign.territories.map((territory) => territory.id)
    const nameChanged = input.name !== campaign.name
    const territoriesChanged = !sameIds(currentIds, input.territoryIds)
    if (!nameChanged && !territoriesChanged) {
      setDialog(null)
      return
    }
    if (territoriesChanged && campaignIsActive(campaign)) {
      const added = input.territoryIds.filter((id) => !currentIds.includes(id))
      const removedNames = campaign.territories
        .filter((territory) => !input.territoryIds.includes(territory.id))
        .map((territory) => territory.name)
      const message = changeActiveCampaignTerritoriesConfirmMessage(
        campaign.name,
        replacedLeaders(added, territories),
        removedNames
      )
      const accepted = await confirm({ message, confirmLabel: 'Salvar alterações' })
      if (!accepted) return
    }
    await window.api.campaigns.update(campaign.id, {
      ...(nameChanged && { name: input.name }),
      ...(territoriesChanged && { territoryIds: input.territoryIds })
    })
    setDialog(null)
    await reload()
  }

  async function designate(campaign: Campaign, publisherIds: string[]): Promise<void> {
    const replaced = replacedLeaders(
      campaign.territories.map((territory) => territory.id),
      territories
    )
    // Asked only when someone loses a territory -- same rule as the
    // territory's own "Designar".
    if (
      replaced.length > 0 &&
      !(await confirm({
        message: designateCampaignConfirmMessage(campaign.name, replaced),
        confirmLabel: 'Designar'
      }))
    ) {
      return
    }
    await window.api.campaigns.designate(campaign.id, publisherIds)
    setDialog(null)
    await reload()
  }

  async function changePublishers(campaign: Campaign, publisherIds: string[]): Promise<void> {
    await window.api.campaigns.setPublishers(campaign.id, publisherIds)
    setDialog(null)
    await reload()
  }

  const complete = async (campaign: Campaign): Promise<void> => {
    const names = (campaign.currentDesignation?.publishers ?? []).map((p) => p.name)
    const message = completeCampaignConfirmMessage(
      campaign.name,
      campaign.territories.length,
      names
    )
    if (!(await confirm({ message, confirmLabel: 'Marcar como concluída' }))) return
    return runAction(async () => {
      await window.api.campaigns.complete(campaign.id)
    })
  }

  // An active campaign goes straight to the server, which refuses it with a
  // message saying to complete it first -- the one place that rule lives.
  const remove = async (campaign: Campaign): Promise<void> => {
    if (
      !campaignIsActive(campaign) &&
      !(await confirm({
        title: `Apagar a campanha "${campaign.name}"?`,
        message: deleteCampaignConfirmMessage(campaign.name, campaign.designations.length),
        confirmLabel: 'Apagar campanha',
        danger: true
      }))
    ) {
      return
    }
    return runAction(async () => {
      await window.api.campaigns.delete(campaign.id)
      setSelectedId(null)
    })
  }

  return (
    <div className="campaigns-screen">
      <header className="page-header">
        <div className="header-title-block">
          <h1>Campanhas</h1>
          {!isLoading && campaigns.length > 0 && (
            <p>
              {activeCount} em andamento de {campaigns.length}
            </p>
          )}
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="icon-button"
            aria-label="Recarregar"
            title="Recarregar"
            disabled={isLoading || isActionPending}
            onClick={() => void reload()}
          >
            <Icon name="refresh" className={isLoading ? 'is-spinning' : undefined} />
          </button>
          <button
            type="button"
            className="button-primary"
            disabled={isLoading || loadError !== null}
            onClick={() => setDialog({ kind: 'create' })}
          >
            <Icon name="flag" />
            Nova campanha
          </button>
        </div>
      </header>
      <main>
        {loadError !== null && (
          <div className="campaigns-state">
            <p role="alert">{loadError}</p>
            <button type="button" onClick={() => void reload()}>
              Tentar novamente
            </button>
          </div>
        )}

        {isLoading && campaigns.length === 0 && loadError === null && (
          <p role="status">Carregando campanhas…</p>
        )}

        {!isLoading && loadError === null && campaigns.length === 0 && (
          <div className="campaigns-state">
            <strong>Nenhuma campanha ainda</strong>
            <p>
              Uma campanha agrupa territórios e os designa a vários publicadores ao mesmo tempo.
              Enquanto ela está em andamento, qualquer um deles marca quadras em qualquer território
              dela.
            </p>
          </div>
        )}

        {campaigns.length > 0 && (
          <div className={`campaigns-workspace${selected === undefined ? '' : ' has-detail'}`}>
            <div className="campaigns-directory">
              <SearchField
                label="Buscar campanhas"
                value={search}
                placeholder="Nome da campanha"
                onChange={setSearch}
              />
              {visibleCampaigns.length === 0 ? (
                <div className="campaigns-state">
                  <p>Nenhuma campanha corresponde a “{search.trim()}”.</p>
                  <button type="button" onClick={() => setSearch('')}>
                    Limpar busca
                  </button>
                </div>
              ) : (
                <ul className="campaign-list" aria-label="Campanhas">
                  {visibleCampaigns.map((campaign) => (
                    <li key={campaign.id}>
                      <button
                        type="button"
                        className="campaign-row"
                        data-campaign-id={campaign.id}
                        aria-pressed={campaign.id === selectedId}
                        onClick={() => {
                          setActionError(null)
                          setSelectedId(campaign.id)
                        }}
                      >
                        <span className="campaign-row-text">
                          <span className="campaign-row-name">{campaign.name}</span>
                          <span className="cell-sub">
                            {territoryCountLabel(campaign.territories.length)}
                          </span>
                        </span>
                        <SituationBadge campaign={campaign} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {selected === undefined && (
              <div className="campaign-detail-empty">
                <strong>Escolha uma campanha na lista</strong>
                <p>
                  O detalhe mostra quem está designado, os territórios no mapa e os períodos já
                  trabalhados. Para agrupar territórios novos, use “Nova campanha”.
                </p>
              </div>
            )}

            {selected !== undefined && (
              <section
                className="campaign-detail"
                aria-label={`Campanha ${selected.name}`}
                onKeyDown={(event) => {
                  if (event.key !== 'Escape' || dialog !== null) return
                  event.preventDefault()
                  closeDetail()
                }}
              >
                <div className="campaign-detail-header">
                  <div>
                    <div className="dialog-title-row">
                      <h2>{selected.name}</h2>
                      <SituationBadge campaign={selected} />
                    </div>
                  </div>
                  <div className="campaign-detail-actions">
                    <button
                      type="button"
                      className="button-small"
                      disabled={isActionPending}
                      onClick={() => setDialog({ kind: 'edit' })}
                    >
                      <Icon name="pencil" />
                      Editar
                    </button>
                    <button
                      type="button"
                      className="button-small button-quiet button-danger"
                      disabled={isActionPending}
                      onClick={() => void remove(selected)}
                    >
                      <Icon name="trash" />
                      Apagar
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Fechar detalhe"
                      title="Fechar detalhe"
                      onClick={closeDetail}
                    >
                      <Icon name="close" size={18} />
                    </button>
                  </div>
                </div>

                {actionError !== null && <p role="alert">{actionError}</p>}

                <div className="campaign-detail-body">
                  <section aria-labelledby="campaign-publishers-title" className="campaign-block">
                    <div className="campaign-block-header">
                      <h3 id="campaign-publishers-title">Publicadores</h3>
                      {selected.currentDesignation !== undefined ? (
                        <div className="row-actions">
                          <button
                            type="button"
                            className="button-small"
                            disabled={isActionPending}
                            onClick={() => setDialog({ kind: 'publishers' })}
                          >
                            <Icon name="users" />
                            Trocar publicadores
                          </button>
                          <button
                            type="button"
                            className="button-small"
                            disabled={isActionPending}
                            onClick={() => void complete(selected)}
                          >
                            <Icon name="checkCircle" />
                            Marcar como concluída
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="button-small button-primary"
                          disabled={isActionPending}
                          onClick={() => setDialog({ kind: 'designate' })}
                        >
                          <Icon name="userPlus" />
                          Designar…
                        </button>
                      )}
                    </div>
                    {selected.currentDesignation !== undefined ? (
                      <>
                        <p className="cell-sub">
                          Desde {formatDate(selected.currentDesignation.startedAt)}. Cada um marca
                          quadras em qualquer território da campanha.
                        </p>
                        <ul className="campaign-people">
                          {selected.currentDesignation.publishers.map((publisher) => (
                            <li key={publisher.id}>
                              <span className="avatar avatar-sm" aria-hidden="true">
                                {publisher.name.charAt(0).toUpperCase()}
                              </span>
                              {publisher.name}
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <p className="cell-muted">
                        Ninguém designado. Designar substitui o dirigente de cada território da
                        campanha.
                      </p>
                    )}
                  </section>

                  <section aria-labelledby="campaign-territories-title" className="campaign-block">
                    <div className="campaign-block-header">
                      <h3 id="campaign-territories-title">Territórios</h3>
                      <span className="cell-sub">
                        {territoryCountLabel(selected.territories.length)}
                      </span>
                    </div>
                    <div className="campaign-territories">
                      <ul className="campaign-territory-list">
                        {[...selected.territories]
                          .sort((a, b) => compareTerritoriesByNumber(a.name, b.name))
                          .map((brief) => {
                            const territory = territoriesById.get(brief.id)
                            return (
                              <li key={brief.id}>
                                <span>{brief.name}</span>
                                {/* Before designating, who would be replaced is the useful fact. */}
                                {!campaignIsActive(selected) && (
                                  <span className="cell-sub">
                                    {territory?.campaign !== undefined
                                      ? campaignHolderLabel(territory.campaign)
                                      : territory?.assignedUser !== undefined
                                        ? `Dirigente atual: ${territory.assignedUser.name}`
                                        : 'Sem dirigente'}
                                  </span>
                                )}
                              </li>
                            )
                          })}
                      </ul>
                      <div className="campaign-map">
                        <AssignmentsMap
                          key={selected.id}
                          territories={selectedTerritories}
                          fallbackCenter={fallbackCenter}
                        />
                      </div>
                    </div>
                  </section>

                  <section aria-labelledby="campaign-periods-title" className="campaign-block">
                    <h3 id="campaign-periods-title">Períodos</h3>
                    {selected.designations.length === 0 ? (
                      <p className="cell-muted">A campanha ainda não foi designada.</p>
                    ) : (
                      <div className="data-table">
                        <div className="data-table-scroll">
                          <table aria-label={`Períodos de ${selected.name}`}>
                            <thead>
                              <tr>
                                <th scope="col" className="cell-number">
                                  Retirada
                                </th>
                                <th scope="col" className="cell-number">
                                  Devolução
                                </th>
                                <th scope="col">Publicadores</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selected.designations.map((period) => (
                                <tr key={period.id}>
                                  <td className="cell-number">{formatDate(period.startedAt)}</td>
                                  <td className="cell-number">
                                    {period.completedAt === undefined ? (
                                      <span className="status-badge status-working">
                                        Em andamento
                                      </span>
                                    ) : (
                                      formatDate(period.completedAt)
                                    )}
                                  </td>
                                  <td>{period.publishers.map((p) => p.name).join(', ')}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </section>
                </div>
              </section>
            )}
          </div>
        )}

        {dialog?.kind === 'create' && (
          <CampaignEditorDialog
            title="Nova campanha"
            submitLabel="Criar campanha"
            territories={territories}
            blockedBy={territoriesHeldByOtherCampaigns(campaigns, null)}
            fallbackCenter={fallbackCenter}
            onSubmit={create}
            onClose={() => setDialog(null)}
          />
        )}

        {dialog?.kind === 'edit' && selected !== undefined && (
          <CampaignEditorDialog
            title={`Editar "${selected.name}"`}
            submitLabel="Salvar alterações"
            initialName={selected.name}
            initialTerritoryIds={selected.territories.map((territory) => territory.id)}
            territories={territories}
            blockedBy={territoriesHeldByOtherCampaigns(campaigns, selected.id)}
            fallbackCenter={fallbackCenter}
            onSubmit={(input) => edit(selected, input)}
            onClose={() => setDialog(null)}
          />
        )}

        {dialog?.kind === 'designate' && selected !== undefined && (
          <CampaignPublishersDialog
            title={`Designar "${selected.name}"`}
            description={
              'Os publicadores escolhidos passam a trabalhar todos os territórios da campanha, ' +
              'no lugar do dirigente de cada um.'
            }
            submitLabel="Designar"
            publishers={publisherOptions}
            onSubmit={(ids) => designate(selected, ids)}
            onClose={() => setDialog(null)}
          />
        )}

        {dialog?.kind === 'publishers' && selected?.currentDesignation !== undefined && (
          <CampaignPublishersDialog
            title={`Publicadores de "${selected.name}"`}
            description={
              'Vale na hora: quem sair da lista deixa de poder marcar quadras nos territórios da ' +
              'campanha, e quem entrar passa a poder.'
            }
            submitLabel="Salvar publicadores"
            publishers={publisherOptions}
            initialSelectedIds={selected.currentDesignation.publishers.map((p) => p.id)}
            onSubmit={(ids) => changePublishers(selected, ids)}
            onClose={() => setDialog(null)}
          />
        )}
        {confirmDialog}
      </main>
    </div>
  )
}

export default CampaignsScreen

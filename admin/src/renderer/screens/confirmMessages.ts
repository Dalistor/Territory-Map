// The wording of the destructive confirmations, in one place because more
// than one screen asks the same question. `HomeScreen` and
// `TerritorySettingsScreen` both offer to delete a territory, and a second
// copy of this text would drift -- the copy that drifted would then be a lie
// about what the server actually deletes.
//
// Its own module rather than an export from `HomeScreen`: a file that
// exports both a component and a plain function breaks React Fast Refresh
// (`react-refresh/only-export-components`).
import type { Block, Territory } from '../../shared/models'

/** Literal, because `block_work_logs.block_id` really is `ON DELETE CASCADE` on the server. */
export function deleteTerritoryConfirmMessage(territory: Territory): string {
  if (territory.blocks.length === 0) {
    return `O território "${territory.name}" será apagado.`
  }
  return (
    `O território "${territory.name}" será apagado, e junto dele as ${territory.blocks.length} ` +
    `quadras e todo o histórico de trabalho delas.`
  )
}

export function deleteBlockConfirmMessage(territory: Territory, block: Block): string {
  return (
    `A quadra ${block.number} de "${territory.name}" será apagada, e junto dela todo o ` +
    `histórico de trabalho registrado nela.`
  )
}

/** A territory whose individual dirigente a campaign is about to replace. */
export interface ReplacedLeader {
  readonly territoryName: string
  readonly leaderName: string
}

function replacedLeaderLines(replaced: readonly ReplacedLeader[]): string {
  return replaced
    .map(({ territoryName, leaderName }) => `• ${territoryName} — ${leaderName}`)
    .join('\n')
}

/**
 * Asked only when somebody loses a territory: designating the campaign closes
 * each listed designation with today's date, and the server does it without
 * asking again.
 */
export function designateCampaignConfirmMessage(
  campaignName: string,
  replaced: readonly ReplacedLeader[]
): string {
  return (
    `Designar a campanha "${campaignName}"?\n\n` +
    'O dirigente destes territórios será substituído pela campanha, e a designação dele ' +
    `encerrada com a data de hoje:\n${replacedLeaderLines(replaced)}`
  )
}

/** Changing the territories of a campaign that is out takes effect at once, on both sides. */
export function changeActiveCampaignTerritoriesConfirmMessage(
  campaignName: string,
  replaced: readonly ReplacedLeader[],
  removedTerritoryNames: readonly string[]
): string {
  const parts = [`Alterar os territórios da campanha "${campaignName}", que está em andamento?`]
  if (replaced.length > 0) {
    parts.push(
      'O dirigente destes territórios será substituído pela campanha hoje:\n' +
        replacedLeaderLines(replaced)
    )
  }
  if (removedTerritoryNames.length > 0) {
    parts.push(
      'Estes territórios saem da campanha e ficam sem dirigente:\n' +
        removedTerritoryNames.map((name) => `• ${name}`).join('\n')
    )
  }
  return parts.join('\n\n')
}

export function completeCampaignConfirmMessage(
  campaignName: string,
  territoryCount: number,
  publisherNames: readonly string[]
): string {
  const territories =
    territoryCount === 1 ? 'O território dela fica' : `Os ${territoryCount} territórios dela ficam`
  return (
    `Concluir a campanha "${campaignName}"?\n\n` +
    `${territories} sem dirigente, e ${publisherNames.join(', ')} ` +
    `${publisherNames.length === 1 ? 'perde' : 'perdem'} na hora o acesso para marcar quadras ` +
    `${territoryCount === 1 ? 'nele' : 'neles'}.`
  )
}

/**
 * Literal, because a campaign's lines on the S-13 cards are `ON DELETE
 * CASCADE` on the server. The work recorded on the blocks is not touched.
 */
export function deleteCampaignConfirmMessage(campaignName: string, periodCount: number): string {
  if (periodCount === 0) {
    return `A campanha "${campaignName}" será apagada. Ela nunca foi designada, então nenhum cartão S-13 muda.`
  }
  return (
    `A campanha "${campaignName}" será apagada, e junto dela as linhas que ela deixou nos ` +
    'cartões S-13 dos territórios. O trabalho registrado nas quadras continua. Não há como desfazer.'
  )
}

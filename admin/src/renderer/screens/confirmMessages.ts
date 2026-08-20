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

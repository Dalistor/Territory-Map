/**
 * The one way a calendar date becomes text in the renderer: `dd/mm/aaaa`,
 * pinned to pt-BR so a system set to English does not turn it into mm/dd.
 */
export function formatDate(date: Date): string {
  return date.toLocaleDateString('pt-BR')
}

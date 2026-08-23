// Which territories the map shows, given the filter the publisher picked.
// Pure decision logic — no MapLibre, no view code — so the map screen (Task
// 25) only has to call `visibleTerritories` and draw whatever comes back.
import type { Territory } from '../../domain/models'
import { isTerritoryAssignedToMe } from '../../domain/assignment'

/**
 * The map's filter state: the publisher's own territory/territories, every
 * territory in the congregation, or one picked by id.
 */
export type MapFilter =
  | { mode: 'assigned' }
  | { mode: 'all' }
  | { mode: 'specific'; territoryId: string }

/**
 * Applies `filter` to `all`. `'specific'` with an id that matches nothing
 * returns an empty list rather than throwing — the territory may have been
 * unassigned or deleted since the filter was picked.
 */
export function visibleTerritories(
  all: Territory[],
  filter: MapFilter,
  myUserId: string
): Territory[] {
  switch (filter.mode) {
    case 'assigned':
      return all.filter((territory) => isTerritoryAssignedToMe(territory, myUserId))
    case 'all':
      return all
    case 'specific':
      return all.filter((territory) => territory.id === filter.territoryId)
  }
}

/**
 * The map screen's initial filter: `'assigned'` when the publisher has at
 * least one territory assigned to them, `'all'` otherwise — opening on
 * `'assigned'` with nothing assigned would show an empty map for no reason.
 */
export function defaultFilter(all: Territory[], myUserId: string): MapFilter {
  const hasAssignment = all.some((territory) => isTerritoryAssignedToMe(territory, myUserId))
  return hasAssignment ? { mode: 'assigned' } : { mode: 'all' }
}

/**
 * Strips the accents a Portuguese territory name can carry, so "proximo"
 * finds "Proximo".
 *
 * A hand-written table rather than `String.prototype.normalize('NFD')`:
 * normalization depends on the Unicode data the JS engine ships, and this
 * runs on Hermes on whatever Android build the publisher happens to have.
 * Every accented letter Portuguese actually uses fits in the table below, so
 * the deterministic version costs nothing and cannot regress on one device.
 */
const ACCENTS: Record<string, string> = {
  á: 'a', à: 'a', ã: 'a', â: 'a', ä: 'a',
  é: 'e', è: 'e', ê: 'e', ë: 'e',
  í: 'i', ì: 'i', î: 'i', ï: 'i',
  ó: 'o', ò: 'o', õ: 'o', ô: 'o', ö: 'o',
  ú: 'u', ù: 'u', û: 'u', ü: 'u',
  ç: 'c',
  ñ: 'n'
}

/** Lowercased, accent-free, trimmed -- the form both sides of a search comparison are reduced to. */
function normalizeForSearch(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[\u00c0-\u024f]/g, (character) => ACCENTS[character] ?? character)
}

/** Letters and digits only -- "Santa Helena - N 7" becomes "santahelenan7". */
function compact(text: string): string {
  return normalizeForSearch(text).replace(/[^a-z0-9]/g, '')
}

/** True when every character of `query` appears in `text`, in order, gaps allowed. */
function isSubsequence(query: string, text: string): boolean {
  let index = 0
  for (const character of text) {
    if (character === query[index]) index += 1
    if (index === query.length) return true
  }
  return query.length === 0
}

/**
 * How well a name answers a query. Higher is closer; 0 means "do not offer
 * this one at all".
 *
 * Three tiers, deliberately forgiving in this order:
 *  3. the whole query, punctuation ignored, appears in the name -- "n7"
 *     finds "N 7", which typing the exact spacing would not.
 *  2. every word typed appears somewhere in the name, in any order --
 *     "helena santa" still finds "Santa Helena".
 *  1. the letters appear in order with gaps ("sthelena") -- the tier that
 *     catches a name half-remembered or half-typed.
 */
function matchScore(name: string, query: string): number {
  const compactName = compact(name)
  const compactQuery = compact(query)
  if (compactQuery.length === 0) return 0
  if (compactName.includes(compactQuery)) return 3

  const normalizedName = normalizeForSearch(name)
  const words = normalizeForSearch(query).split(/\s+/).filter(Boolean)
  if (words.length > 1 && words.every((word) => normalizedName.includes(word))) return 2

  return isSubsequence(compactQuery, compactName) ? 1 : 0
}

/**
 * Checks if the query asks for a specific block number (e.g., "4", "quadra 4", "q4", "bloco 4").
 */
function blockMatchScore(territory: Territory, query: string): number {
  const normalized = normalizeForSearch(query);
  const match = normalized.match(/^(?:quadra|q|bloco)?\s*(\d+)$/);
  if (!match) return 0;
  const targetNumber = parseInt(match[1], 10);
  if (isNaN(targetNumber)) return 0;
  const hasExactBlock = territory.blocks.some((b) => b.number === targetNumber);
  if (hasExactBlock) return 2.5;
  return 0;
}

/**
 * The territories matching `query`, closest first. A blank query matches
 * everything -- an empty search box is not a filter.
 *
 * Ranked rather than filtered flat: the publisher is typing a name from
 * memory or a block number, on a phone, in the field.
 */
export function searchTerritories(all: Territory[], query: string): Territory[] {
  if (compact(query).length === 0) return all;
  return all
    .map((territory, index) => {
      const nameScore = matchScore(territory.name, query);
      const blockScore = blockMatchScore(territory, query);
      return { territory, index, score: Math.max(nameScore, blockScore) };
    })
    .filter((scored) => scored.score > 0)
    // Ties keep the caller's order (`sort` alone is stable in modern engines,
    // but the explicit index makes that a property of this function rather
    // than of whichever engine runs it).
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((scored) => scored.territory);
}

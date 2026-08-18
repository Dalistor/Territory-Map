// Builds the assignments spreadsheet in memory. Deliberately pure: it takes
// plain domain objects and hands back an `ExcelJS.Workbook`, touching neither
// disk nor Electron. Saving it is the IPC handler's job (`ipc-handlers.ts`),
// which is what keeps this file testable without a window or a temp file.

import ExcelJS from 'exceljs'
import { compareTerritoriesByNumber, type Assignment, type Territory } from '../shared/models'

/** A territory together with its whole assignment history. */
export interface TerritoryAssignments {
  readonly territory: Territory
  readonly assignments: Assignment[]
}

const HEADER = ['Publicador', 'Data de início', 'Data de conclusão']
const DATE_FORMAT = 'dd/mm/yyyy'
const MAX_SHEET_NAME_LENGTH = 31
/** The characters Excel refuses in a sheet name; ExcelJS throws on them. */
const FORBIDDEN_SHEET_NAME_CHARS = /[[\]:*?/\\]/g
const FALLBACK_SHEET_NAME = 'Território'

/**
 * Turns a territory name into something Excel accepts as a tab label: at most
 * 31 characters, none of them forbidden. The full name is never lost — it is
 * written in the sheet's title row, which has no such limits.
 */
function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(FORBIDDEN_SHEET_NAME_CHARS, '').trim()
  const truncated = cleaned.slice(0, MAX_SHEET_NAME_LENGTH).trim()
  return truncated.length > 0 ? truncated : FALLBACK_SHEET_NAME
}

/**
 * Appends ` (2)`, ` (3)`… until the name is free. Two territories can perfectly
 * well collide once truncated to 31 characters, and two sheets cannot share a
 * name — the suffix has to fit inside the limit too, so the base is trimmed to
 * make room for it.
 */
function uniqueSheetName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base
  for (let suffixNumber = 2; ; suffixNumber += 1) {
    const suffix = ` (${suffixNumber})`
    const candidate = base.slice(0, MAX_SHEET_NAME_LENGTH - suffix.length).trim() + suffix
    if (!taken.has(candidate)) return candidate
  }
}

export function buildAssignmentsWorkbook(territories: TerritoryAssignments[]): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook()

  // One sheet per territory, in the order the congregation reads them —
  // the same ordering `HomeScreen` uses, reused instead of re-derived.
  const ordered = [...territories].sort((a, b) =>
    compareTerritoriesByNumber(a.territory.name, b.territory.name)
  )

  const usedSheetNames = new Set<string>()

  for (const { territory, assignments } of ordered) {
    const sheetName = uniqueSheetName(sanitizeSheetName(territory.name), usedSheetNames)
    usedSheetNames.add(sheetName)

    const sheet = workbook.addWorksheet(sheetName)
    sheet.addRow([territory.name])
    sheet.addRow(HEADER)

    // The API returns the history newest-first; the card is read downwards in
    // time, so it is reversed here rather than at the call site.
    for (const assignment of [...assignments].reverse()) {
      const row = sheet.addRow([
        assignment.publisher.name,
        assignment.startedAt,
        assignment.completedAt ?? null
      ])
      row.getCell(2).numFmt = DATE_FORMAT
      row.getCell(3).numFmt = DATE_FORMAT
    }
  }

  return workbook
}

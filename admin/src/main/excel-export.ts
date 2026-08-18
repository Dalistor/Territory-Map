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
 * Column widths in Excel's character units. The publisher column has to hold a
 * full name, and the two date columns have to hold the header label
 * ("Data de conclusão") — at the default width it is cut off and a date can
 * even render as `####`.
 */
const COLUMN_WIDTHS = [32, 18, 18]

const TITLE_FONT_SIZE = 14

/** Light grey behind the header labels, so the table reads as a table on paper. */
const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFD9D9D9' }
}

/** A thin grid on every table cell, so the printed card has lines to write between. */
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' }
}

/**
 * Print settings shared by every sheet: the table is three columns wide, so it
 * always fits one page across (`fitToHeight: 0` lets it run as long as it
 * needs), and `printTitlesRow` repeats the header on every page — without it a
 * long history's second page is a column of unlabelled names and dates.
 */
const PAGE_SETUP: Partial<ExcelJS.PageSetup> = {
  fitToPage: true,
  fitToWidth: 1,
  fitToHeight: 0,
  orientation: 'portrait',
  margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
  printTitlesRow: '2:2'
}

/**
 * Borders every column of a table row, including the ones with no value: an
 * assignment still open has an empty completion cell, and the grid would break
 * there if only filled cells were touched.
 */
function borderRow(row: ExcelJS.Row): void {
  for (let column = 1; column <= HEADER.length; column += 1) {
    row.getCell(column).border = THIN_BORDER
  }
}

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

    const sheet = workbook.addWorksheet(sheetName, { pageSetup: { ...PAGE_SETUP } })
    COLUMN_WIDTHS.forEach((width, index) => {
      sheet.getColumn(index + 1).width = width
    })

    // Title and header stay put while the history scrolls under them.
    sheet.views = [{ state: 'frozen', ySplit: 2 }]

    const titleRow = sheet.addRow([territory.name])
    // The full territory name can be longer than the sheet tab allows, so the
    // title spans the whole table instead of spilling into a neighbour cell.
    sheet.mergeCells('A1:C1')
    titleRow.getCell(1).font = { bold: true, size: TITLE_FONT_SIZE }

    const headerRow = sheet.addRow(HEADER)
    headerRow.eachCell((cell) => {
      cell.font = { bold: true }
      cell.fill = HEADER_FILL
    })
    borderRow(headerRow)
    // The two date columns are narrow and their values are centred by nature;
    // centring the labels keeps the column reading straight.
    headerRow.getCell(2).alignment = { horizontal: 'center' }
    headerRow.getCell(3).alignment = { horizontal: 'center' }

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
      borderRow(row)
    }
  }

  return workbook
}

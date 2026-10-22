// Builds the assignments spreadsheet in memory. Deliberately pure: it takes
// plain domain objects and hands back an `ExcelJS.Workbook`, touching neither
// disk nor Electron. Saving it is the IPC handler's job (`ipc-handlers.ts`),
// which is what keeps this file testable without a window or a temp file.

import ExcelJS from 'exceljs'
import {
  assignmentHolderName,
  compareTerritoriesByNumber,
  type Assignment,
  type Territory
} from '../shared/models'

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
        assignmentHolderName(assignment),
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

/** The name written in a dirigente slot of the S-13-T: empty when the slot is unused. */
function holderOf(assignment: Assignment | undefined): string {
  return assignment === undefined ? '' : assignmentHolderName(assignment)
}

export interface S13TExportInput {
  readonly congregation?: { readonly name: string; readonly city: string } | null
  readonly serviceYear?: number
  readonly territories: TerritoryAssignments[]
}

const S13T_COLUMN_WIDTHS = [12, 18, 16, 16, 16, 16, 16, 16, 16, 16]

const S13T_PAGE_SETUP: Partial<ExcelJS.PageSetup> = {
  fitToPage: true,
  fitToWidth: 1,
  fitToHeight: 0,
  orientation: 'landscape',
  margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.5, header: 0.2, footer: 0.2 },
  printTitlesRow: '3:4'
}

/**
 * Builds the official congregation Territory Assignment Record (Form S-13-T) spreadsheet.
 * Matches the official S-13_T layout:
 * - Landscape A4 orientation
 * - Top title: "REGISTRO DE DESIGNAÇÃO DE TERRITÓRIO"
 * - Subheader: "Ano de Serviço: XXXX"
 * - 10 columns with 2-row layout per territory:
 *   Col 1: Terr. n.º (merged 2 rows)
 *   Col 2: Última data concluída* (merged 2 rows)
 *   Cols 3-4, 5-6, 7-8, 9-10: 4 slots for "Designado para" (Row 1) & "Data da designação" / "Data da conclusão" (Row 2)
 * - Footer note: "* Ao iniciar uma nova folha, use esta coluna para registrar a data em que cada território foi concluído pela última vez."
 * - Footer left: "S-13-T  01/22"
 */
export function buildS13TWorkbook(input: S13TExportInput): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook()
  const serviceYear =
    input.serviceYear ??
    (new Date().getMonth() >= 8 ? new Date().getFullYear() + 1 : new Date().getFullYear())
  const sheetName = `S-13-T (${serviceYear})`

  const sheet = workbook.addWorksheet(sheetName, {
    pageSetup: { ...S13T_PAGE_SETUP },
    headerFooter: {
      firstFooter: '&LS-13-T  01/22&RPágina &P de &N',
      oddFooter: '&LS-13-T  01/22&RPágina &P de &N',
      evenFooter: '&LS-13-T  01/22&RPágina &P de &N'
    }
  })

  // Set column widths
  S13T_COLUMN_WIDTHS.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width
  })

  // Freeze top 4 header rows
  sheet.views = [{ state: 'frozen', ySplit: 4 }]

  // Row 1: Title
  const row1 = sheet.addRow(['REGISTRO DE DESIGNAÇÃO DE TERRITÓRIO'])
  sheet.mergeCells('A1:J1')
  row1.getCell(1).font = { name: 'Arial', bold: true, size: 14 }
  row1.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  row1.height = 24

  // Row 2: Service Year & Congregation Info
  const congText = input.congregation
    ? `   •   Congregação ${input.congregation.name} — ${input.congregation.city}`
    : ''
  const row2 = sheet.addRow([`Ano de Serviço: ${serviceYear}${congText}`])
  sheet.mergeCells('A2:J2')
  row2.getCell(1).font = { name: 'Arial', bold: true, size: 10.5 }
  row2.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' }
  row2.height = 20

  // Row 3 & 4: Table Headers
  sheet.addRow([
    'Terr. n.º',
    'Última data concluída*',
    'Designado para',
    '',
    'Designado para',
    '',
    'Designado para',
    '',
    'Designado para',
    ''
  ])
  sheet.addRow([
    '',
    '',
    'Data da designação',
    'Data da conclusão',
    'Data da designação',
    'Data da conclusão',
    'Data da designação',
    'Data da conclusão',
    'Data da designação',
    'Data da conclusão'
  ])

  sheet.mergeCells('A3:A4')
  sheet.mergeCells('B3:B4')
  sheet.mergeCells('C3:D3')
  sheet.mergeCells('E3:F3')
  sheet.mergeCells('G3:H3')
  sheet.mergeCells('I3:J3')

  for (let r = 3; r <= 4; r += 1) {
    const row = sheet.getRow(r)
    row.height = 20
    for (let c = 1; c <= 10; c += 1) {
      const cell = row.getCell(c)
      cell.font = { name: 'Arial', bold: true, size: 9 }
      cell.fill = HEADER_FILL
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.border = THIN_BORDER
    }
  }

  // Service Year Dates (Sept 1 of serviceYear - 1 to Aug 31 of serviceYear)
  const serviceYearStart = new Date(Date.UTC(serviceYear - 1, 8, 1))
  const serviceYearEnd = new Date(Date.UTC(serviceYear, 7, 31, 23, 59, 59, 999))

  const orderedTerritories = [...input.territories].sort((a, b) =>
    compareTerritoriesByNumber(a.territory.name, b.territory.name)
  )

  for (const { territory, assignments } of orderedTerritories) {
    // 1. Calculate Last Completed Date prior to this service year
    const priorCompleted = assignments
      .filter((a) => a.completedAt && a.completedAt < serviceYearStart)
      .sort((a, b) => b.completedAt!.getTime() - a.completedAt!.getTime())

    // If no prior in previous service years, fallback to the latest completed date overall
    const allCompleted = assignments
      .filter((a) => a.completedAt)
      .sort((a, b) => b.completedAt!.getTime() - a.completedAt!.getTime())

    const lastCompletedDate = priorCompleted[0]?.completedAt ?? allCompleted[0]?.completedAt ?? null

    // 2. Collect assignments relevant for this service year
    // Older active assignments that carried over into this service year
    const carryOverActive = assignments.filter(
      (a) => a.startedAt < serviceYearStart && (!a.completedAt || a.completedAt >= serviceYearStart)
    )
    // Assignments started during this service year
    const inServiceYear = assignments.filter(
      (a) => a.startedAt >= serviceYearStart && a.startedAt <= serviceYearEnd
    )

    // Sorted chronologically oldest to newest
    const yearAssignments = [...carryOverActive, ...inServiceYear]
      .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
      // If none in this year, also include recent assignments up to 4 if available
      .slice(0, 4)

    const startRowIndex = sheet.rowCount + 1

    // Row A: Publisher names and merged territory info
    sheet.addRow([
      territory.name,
      lastCompletedDate,
      holderOf(yearAssignments[0]),
      '',
      holderOf(yearAssignments[1]),
      '',
      holderOf(yearAssignments[2]),
      '',
      holderOf(yearAssignments[3]),
      ''
    ])

    // Row B: Dates
    sheet.addRow([
      '',
      '',
      yearAssignments[0]?.startedAt ?? null,
      yearAssignments[0]?.completedAt ?? null,
      yearAssignments[1]?.startedAt ?? null,
      yearAssignments[1]?.completedAt ?? null,
      yearAssignments[2]?.startedAt ?? null,
      yearAssignments[2]?.completedAt ?? null,
      yearAssignments[3]?.startedAt ?? null,
      yearAssignments[3]?.completedAt ?? null
    ])

    const rowTop = sheet.getRow(startRowIndex)
    const rowBottom = sheet.getRow(startRowIndex + 1)
    rowTop.height = 22
    rowBottom.height = 20

    // Merges
    sheet.mergeCells(`A${startRowIndex}:A${startRowIndex + 1}`)
    sheet.mergeCells(`B${startRowIndex}:B${startRowIndex + 1}`)
    sheet.mergeCells(`C${startRowIndex}:D${startRowIndex}`)
    sheet.mergeCells(`E${startRowIndex}:F${startRowIndex}`)
    sheet.mergeCells(`G${startRowIndex}:H${startRowIndex}`)
    sheet.mergeCells(`I${startRowIndex}:J${startRowIndex}`)

    // Format Row A & B cells
    for (let c = 1; c <= 10; c += 1) {
      const cellTop = rowTop.getCell(c)
      const cellBottom = rowBottom.getCell(c)
      cellTop.border = THIN_BORDER
      cellBottom.border = THIN_BORDER
      cellTop.font = { name: 'Arial', size: 9.5 }
      cellBottom.font = { name: 'Arial', size: 9 }
      cellTop.alignment = { horizontal: 'center', vertical: 'middle' }
      cellBottom.alignment = { horizontal: 'center', vertical: 'middle' }
    }

    // Col A (Territory): Bold & Centered
    rowTop.getCell(1).font = { name: 'Arial', bold: true, size: 10 }

    // Col B (Last Completed Date): Date format
    if (lastCompletedDate) {
      rowTop.getCell(2).numFmt = DATE_FORMAT
    }

    // Date cells in Row B
    for (let c = 3; c <= 10; c += 1) {
      rowBottom.getCell(c).numFmt = DATE_FORMAT
    }
  }

  // Footer Note Row
  const noteRow = sheet.addRow([
    '* Ao iniciar uma nova folha, use esta coluna para registrar a data em que cada território foi concluído pela última vez.'
  ])
  const noteRowIndex = noteRow.number
  sheet.mergeCells(`A${noteRowIndex}:J${noteRowIndex}`)
  noteRow.getCell(1).font = { name: 'Arial', italic: true, size: 8.5 }
  noteRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' }
  noteRow.height = 18

  return workbook
}

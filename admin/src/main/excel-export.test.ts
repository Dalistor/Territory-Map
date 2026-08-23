// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { ValueType } from 'exceljs'
import {
  buildAssignmentsWorkbook,
  buildS13TWorkbook,
  type TerritoryAssignments
} from './excel-export'
import type { Assignment, Territory } from '../shared/models'

function territory(name: string): Territory {
  return { id: `t-${name}`, name, boundary: [], blocks: [] }
}

function assignment(publisherName: string, startedAt: Date, completedAt?: Date): Assignment {
  return {
    id: `a-${publisherName}-${startedAt.getTime()}`,
    publisher: { id: `p-${publisherName}`, name: publisherName },
    startedAt,
    ...(completedAt !== undefined && { completedAt })
  }
}

const JANUARY = new Date(Date.UTC(2026, 0, 10))
const MARCH = new Date(Date.UTC(2026, 2, 20))
const JUNE = new Date(Date.UTC(2026, 5, 1))

describe('buildAssignmentsWorkbook', () => {
  it('writes one row per assignment, oldest first, with publisher and both dates', () => {
    // The API hands the history back newest-first; the card reads downwards in
    // time, so the sheet has to invert it.
    const input: TerritoryAssignments[] = [
      {
        territory: territory('Centro - N6'),
        assignments: [assignment('Maria', MARCH, JUNE), assignment('João', JANUARY, MARCH)]
      }
    ]

    const workbook = buildAssignmentsWorkbook(input)
    const sheet = workbook.worksheets[0]

    expect(sheet.getRow(3).getCell(1).value).toBe('João')
    expect(sheet.getRow(3).getCell(2).value).toEqual(JANUARY)
    expect(sheet.getRow(3).getCell(3).value).toEqual(MARCH)
    expect(sheet.getRow(4).getCell(1).value).toBe('Maria')
    expect(sheet.getRow(4).getCell(2).value).toEqual(MARCH)
    expect(sheet.getRow(4).getCell(3).value).toEqual(JUNE)
  })

  it('leaves the completion cell empty for an assignment still open', () => {
    const input: TerritoryAssignments[] = [
      { territory: territory('Centro - N6'), assignments: [assignment('Maria', MARCH)] }
    ]

    const sheet = buildAssignmentsWorkbook(input).worksheets[0]

    expect(sheet.getRow(3).getCell(1).value).toBe('Maria')
    expect(sheet.getRow(3).getCell(2).value).toEqual(MARCH)
    expect(sheet.getRow(3).getCell(3).type).toBe(ValueType.Null)
  })

  it('orders the sheets by the territory number, not by the order received', () => {
    const input: TerritoryAssignments[] = [
      { territory: territory('Jardim - N12'), assignments: [] },
      { territory: territory('Centro - N6'), assignments: [] },
      { territory: territory('Santa Helena - N 7'), assignments: [] }
    ]

    const workbook = buildAssignmentsWorkbook(input)

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Centro - N6',
      'Santa Helena - N 7',
      'Jardim - N12'
    ])
  })

  it('still gives a territory with no assignments its sheet, with only the header', () => {
    const input: TerritoryAssignments[] = [{ territory: territory('Centro - N6'), assignments: [] }]

    const sheet = buildAssignmentsWorkbook(input).worksheets[0]

    expect(sheet.getRow(1).getCell(1).value).toBe('Centro - N6')
    expect(sheet.getRow(2).getCell(1).value).toBe('Publicador')
    expect(sheet.getRow(2).getCell(2).value).toBe('Data de início')
    expect(sheet.getRow(2).getCell(3).value).toBe('Data de conclusão')
    expect(sheet.actualRowCount).toBe(2)
  })

  it('truncates a territory name too long to be a sheet name, keeping it in the title row', () => {
    const longName = 'Jardim Universitário Zona Norte Extensão - N6'
    const input: TerritoryAssignments[] = [{ territory: territory(longName), assignments: [] }]

    const sheet = buildAssignmentsWorkbook(input).worksheets[0]

    expect(sheet.name.length).toBeLessThanOrEqual(31)
    expect(longName.startsWith(sheet.name)).toBe(true)
    // The full name is never lost -- it just moves to the title row.
    expect(sheet.getRow(1).getCell(1).value).toBe(longName)
  })

  it('strips the characters Excel refuses in a sheet name', () => {
    const rawName = 'Centro/Norte: bloco [A]? - N6'
    const input: TerritoryAssignments[] = [{ territory: territory(rawName), assignments: [] }]

    const sheet = buildAssignmentsWorkbook(input).worksheets[0]

    expect(sheet.name).not.toMatch(/[[\]:*?/\\]/)
    expect(sheet.name.length).toBeGreaterThan(0)
    expect(sheet.getRow(1).getCell(1).value).toBe(rawName)
  })

  it('gives two territories whose sanitized names would collide distinct sheet names', () => {
    const input: TerritoryAssignments[] = [
      { territory: territory('Jardim Universitário Zona Norte A - N6'), assignments: [] },
      { territory: territory('Jardim Universitário Zona Norte B - N7'), assignments: [] }
    ]

    const names = buildAssignmentsWorkbook(input).worksheets.map((sheet) => sheet.name)

    expect(names[0]).not.toBe(names[1])
    expect(names.every((name) => name.length <= 31)).toBe(true)
  })

  it('falls back to a placeholder when the name is nothing but forbidden characters', () => {
    const input: TerritoryAssignments[] = [{ territory: territory('///[]'), assignments: [] }]

    const sheet = buildAssignmentsWorkbook(input).worksheets[0]

    expect(sheet.name).toBe('Território')
    expect(sheet.getRow(1).getCell(1).value).toBe('///[]')
  })

  it('keeps suffixing past the second collision', () => {
    const base = 'Jardim Universitário Zona Norte'
    const input: TerritoryAssignments[] = [
      { territory: territory(`${base} A - N6`), assignments: [] },
      { territory: territory(`${base} B - N7`), assignments: [] },
      { territory: territory(`${base} C - N8`), assignments: [] }
    ]

    const names = buildAssignmentsWorkbook(input).worksheets.map((sheet) => sheet.name)

    expect(new Set(names).size).toBe(3)
    expect(names.every((name) => name.length <= 31)).toBe(true)
  })
})

describe('buildAssignmentsWorkbook formatting', () => {
  const oneSheet = (
    name = 'Centro - N6',
    assignments: Assignment[] = []
  ): TerritoryAssignments[] => [{ territory: territory(name), assignments }]

  it('widens the three columns so the header labels and the dates are not cut off', () => {
    const sheet = buildAssignmentsWorkbook(oneSheet('Centro - N6', [assignment('Maria', MARCH)]))
      .worksheets[0]

    expect(sheet.getColumn(1).width).toBeGreaterThanOrEqual(30)
    expect(sheet.getColumn(2).width).toBeGreaterThanOrEqual(16)
    expect(sheet.getColumn(3).width).toBeGreaterThanOrEqual(16)
  })

  it('sets the title row in bold, in a larger font, merged across the three columns', () => {
    const sheet = buildAssignmentsWorkbook(oneSheet()).worksheets[0]
    const title = sheet.getCell('A1')

    expect(title.font?.bold).toBe(true)
    expect(title.font?.size).toBeGreaterThanOrEqual(14)
    expect(title.isMerged).toBe(true)
    expect(sheet.getCell('C1').master.address).toBe('A1')
  })

  it('sets the header row in bold, with a solid fill and the date labels centred', () => {
    const sheet = buildAssignmentsWorkbook(oneSheet()).worksheets[0]
    const header = sheet.getRow(2)

    expect(header.getCell(1).font?.bold).toBe(true)
    expect(header.getCell(1).fill?.type).toBe('pattern')
    expect(header.getCell(3).fill).toEqual(header.getCell(1).fill)
    expect(header.getCell(2).alignment?.horizontal).toBe('center')
    expect(header.getCell(3).alignment?.horizontal).toBe('center')
  })

  it('draws a thin border on all four sides of every header and data cell', () => {
    const sheet = buildAssignmentsWorkbook(
      oneSheet('Centro - N6', [assignment('Maria', MARCH, JUNE)])
    ).worksheets[0]

    for (const address of ['A2', 'C2', 'A3', 'B3', 'C3']) {
      const border = sheet.getCell(address).border
      expect(border?.top?.style).toBe('thin')
      expect(border?.left?.style).toBe('thin')
      expect(border?.bottom?.style).toBe('thin')
      expect(border?.right?.style).toBe('thin')
    }
  })

  it('freezes the panes below the header so it stays visible on a long history', () => {
    const sheet = buildAssignmentsWorkbook(oneSheet()).worksheets[0]

    expect(sheet.views).toEqual([expect.objectContaining({ state: 'frozen', ySplit: 2 })])
  })

  it('sets up printing to fit one page wide, portrait, repeating the header row', () => {
    const sheet = buildAssignmentsWorkbook(oneSheet()).worksheets[0]

    expect(sheet.pageSetup.fitToPage).toBe(true)
    expect(sheet.pageSetup.fitToWidth).toBe(1)
    expect(sheet.pageSetup.fitToHeight).toBe(0)
    expect(sheet.pageSetup.orientation).toBe('portrait')
    expect(sheet.pageSetup.margins).toBeDefined()
    expect(sheet.pageSetup.printTitlesRow).toBe('2:2')
  })

  it('formats title and header of a territory with no assignments, and adds no data row', () => {
    const sheet = buildAssignmentsWorkbook(oneSheet('Centro - N6', [])).worksheets[0]

    expect(sheet.getCell('A1').value).toBe('Centro - N6')
    expect(sheet.getCell('A1').font?.bold).toBe(true)
    expect(sheet.getCell('A2').font?.bold).toBe(true)
    expect(sheet.getCell('A2').border?.bottom?.style).toBe('thin')
    expect(sheet.getCell('C2').fill?.type).toBe('pattern')
    expect(sheet.actualRowCount).toBe(2)
    expect(sheet.getRow(3).getCell(1).type).toBe(ValueType.Null)
  })
})

describe('buildS13TWorkbook', () => {
  const t1 = territory('Setor 1')
  const t2 = territory('Setor 2')

  const lastYearCompleted = new Date('2025-05-10T12:00:00Z')
  const sept2025 = new Date('2025-09-15T10:00:00Z')
  const nov2025 = new Date('2025-11-20T10:00:00Z')
  const dec2025 = new Date('2025-12-05T10:00:00Z')

  it('builds a single S-13-T sheet with 10 columns and 2 rows per territory', () => {
    const input = {
      congregation: { name: 'Vila Mariana', city: 'São Paulo' },
      serviceYear: 2026,
      territories: [
        {
          territory: t1,
          assignments: [
            assignment('Carlos', lastYearCompleted, new Date('2025-06-01T12:00:00Z')),
            assignment('João', sept2025, nov2025),
            assignment('Maria', dec2025)
          ]
        },
        {
          territory: t2,
          assignments: []
        }
      ]
    }

    const workbook = buildS13TWorkbook(input)
    expect(workbook.worksheets.length).toBe(1)
    const sheet = workbook.worksheets[0]

    expect(sheet.name).toBe('S-13-T (2026)')
    // Row 1: Title
    expect(sheet.getCell('A1').value).toBe('REGISTRO DE DESIGNAÇÃO DE TERRITÓRIO')
    // Row 2: Subtitle
    expect(sheet.getCell('A2').value).toContain('Ano de Serviço: 2026')
    expect(sheet.getCell('A2').value).toContain('Vila Mariana')

    // Headers on row 3 and 4
    expect(sheet.getCell('A3').value).toBe('Terr. n.º')
    expect(sheet.getCell('B3').value).toBe('Última data concluída*')
    expect(sheet.getCell('C3').value).toBe('Designado para')
    expect(sheet.getCell('C4').value).toBe('Data da designação')
    expect(sheet.getCell('D4').value).toBe('Data da conclusão')

    // Territory 1 is on rows 5 and 6
    // Row 5: Territory name, last completed date, publisher 1 and publisher 2
    expect(sheet.getCell('A5').value).toBe('Setor 1')
    expect(sheet.getCell('B5').value).toEqual(new Date('2025-06-01T12:00:00Z'))
    expect(sheet.getCell('C5').value).toBe('João')
    expect(sheet.getCell('E5').value).toBe('Maria')

    // Row 6: Dates for João and Maria
    expect(sheet.getCell('C6').value).toEqual(sept2025)
    expect(sheet.getCell('D6').value).toEqual(nov2025)
    expect(sheet.getCell('E6').value).toEqual(dec2025)
    expect(sheet.getCell('F6').value).toBeNull()

    // Territory 2 is on rows 7 and 8
    expect(sheet.getCell('A7').value).toBe('Setor 2')
    expect(sheet.getCell('B7').value).toBeNull()
    expect(sheet.getCell('C7').value).toBe('')

    // Footer note exists at the end
    const noteCell = sheet.getRow(sheet.rowCount).getCell(1)
    expect(noteCell.value).toContain('Ao iniciar uma nova folha')
  })

  it('configures landscape orientation and print setup for S-13-T', () => {
    const workbook = buildS13TWorkbook({
      serviceYear: 2026,
      territories: [{ territory: t1, assignments: [] }]
    })
    const sheet = workbook.worksheets[0]

    expect(sheet.pageSetup.orientation).toBe('landscape')
    expect(sheet.pageSetup.fitToPage).toBe(true)
    expect(sheet.pageSetup.fitToWidth).toBe(1)
    expect(sheet.pageSetup.printTitlesRow).toBe('3:4')
  })
})

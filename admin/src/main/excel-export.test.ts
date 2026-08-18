// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { ValueType } from 'exceljs'
import { buildAssignmentsWorkbook, type TerritoryAssignments } from './excel-export'
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

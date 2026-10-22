// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  buildS13TDocx,
  parseS13TDocx,
  parseDocxDate,
  type TerritoryAssignments
} from './docx-handler'
import type { Assignment, Territory } from '../shared/models'

function territory(name: string): Territory {
  return { id: `terr-${name}`, name, boundary: [], blocks: [] }
}

function assignment(publisherName: string, startedAt: Date, completedAt?: Date): Assignment {
  return {
    id: `asg-${publisherName}-${startedAt.getTime()}`,
    publisher: { id: `pub-${publisherName}`, name: publisherName },
    startedAt,
    completedAt
  }
}

describe('parseDocxDate', () => {
  it('parses DD/MM/YYYY dates', () => {
    const d = parseDocxDate('15/09/2025')
    expect(d).not.toBeNull()
    expect(d?.getUTCFullYear()).toBe(2025)
    expect(d?.getUTCMonth()).toBe(8) // 0-indexed September
    expect(d?.getUTCDate()).toBe(15)
  })

  it('parses DD-MM-YYYY dates', () => {
    const d = parseDocxDate('05-01-2026')
    expect(d).not.toBeNull()
    expect(d?.getUTCFullYear()).toBe(2026)
    expect(d?.getUTCMonth()).toBe(0) // January
    expect(d?.getUTCDate()).toBe(5)
  })

  it('parses YYYY-MM-DD dates', () => {
    const d = parseDocxDate('2026-03-20')
    expect(d).not.toBeNull()
    expect(d?.getUTCFullYear()).toBe(2026)
    expect(d?.getUTCMonth()).toBe(2) // March
    expect(d?.getUTCDate()).toBe(20)
  })

  it('returns null for invalid strings', () => {
    expect(parseDocxDate('')).toBeNull()
    expect(parseDocxDate('abc')).toBeNull()
  })
})

describe('buildS13TDocx and parseS13TDocx round-trip', () => {
  const t1 = territory('Setor 1')
  const t2 = territory('Setor 2')

  const lastYearCompleted = new Date('2025-05-10T12:00:00Z')
  const sept2025 = new Date('2025-09-15T12:00:00Z')
  const nov2025 = new Date('2025-11-20T12:00:00Z')
  const dec2025 = new Date('2025-12-05T12:00:00Z')

  const territoriesData: TerritoryAssignments[] = [
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

  it('generates a valid docx buffer and parses it back accurately', async () => {
    const docxBuffer = await buildS13TDocx({
      congregation: { name: 'Vila Mariana', city: 'São Paulo' },
      serviceYear: 2026,
      territories: territoriesData
    })

    expect(docxBuffer).toBeInstanceOf(Buffer)
    expect(docxBuffer.length).toBeGreaterThan(1000)

    const parsed = await parseS13TDocx(docxBuffer)

    expect(parsed.serviceYear).toBe(2026)
    expect(parsed.territories.length).toBeGreaterThanOrEqual(2)

    const parsedT1 = parsed.territories.find((t) => t.territoryNumberOrName === 'Setor 1')
    expect(parsedT1).toBeDefined()
    expect(parsedT1?.lastCompletedDate).toBe('01/06/2025')
    expect(parsedT1?.assignments.length).toBe(2)

    expect(parsedT1?.assignments[0]).toEqual({
      publisherName: 'João',
      startedAt: '15/09/2025',
      completedAt: '20/11/2025'
    })

    expect(parsedT1?.assignments[1]).toEqual({
      publisherName: 'Maria',
      startedAt: '05/12/2025',
      completedAt: null
    })

    const parsedT2 = parsed.territories.find((t) => t.territoryNumberOrName === 'Setor 2')
    expect(parsedT2).toBeDefined()
    expect(parsedT2?.assignments.length).toBe(0)
  })

  it('writes a campaign line in its slot as "Campanha: <nome>"', async () => {
    const campaignLine: Assignment = {
      id: 'asg-campaign',
      campaign: { id: 'camp-1', name: 'Celebração' },
      startedAt: dec2025
    }
    const buffer = await buildS13TDocx({
      serviceYear: 2026,
      territories: [
        { territory: t1, assignments: [campaignLine, assignment('João', sept2025, nov2025)] }
      ]
    })

    const parsed = await parseS13TDocx(buffer)
    const parsedT1 = parsed.territories.find((t) => t.territoryNumberOrName === 'Setor 1')

    expect(parsedT1?.assignments.map((line) => line.publisherName)).toEqual([
      'João',
      'Campanha: Celebração'
    ])
  })

  it('correctly parses multi-table docx with 20+ territories and multiline cells', async () => {
    // Generate a docx with 25 territories so it spans multiple prototype rows
    const manyTerritories: TerritoryAssignments[] = Array.from({ length: 25 }, (_, i) => ({
      territory: territory(`Território ${i + 1}`),
      assignments: [
        assignment(
          `Publicador ${i + 1}`,
          new Date('2025-10-01T12:00:00Z'),
          new Date('2025-11-01T12:00:00Z')
        )
      ]
    }))

    const buffer = await buildS13TDocx({
      serviceYear: 2026,
      territories: manyTerritories
    })

    const parsed = await parseS13TDocx(buffer)
    expect(parsed.serviceYear).toBe(2026)
    expect(parsed.territories.length).toBe(25)
    expect(parsed.territories[24].territoryNumberOrName).toBe('Território 25')
    expect(parsed.territories[24].assignments[0].publisherName).toBe('Publicador 25')
  })
})

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import {
  compareTerritoriesByNumber,
  getServiceYear,
  type Assignment,
  type Territory
} from '../shared/models'

export interface TerritoryAssignments {
  readonly territory: Territory
  readonly assignments: readonly Assignment[]
}

export interface S13TExportInput {
  readonly congregation?: { name: string; city: string } | null
  readonly serviceYear?: number
  readonly territories: readonly TerritoryAssignments[]
  readonly templateBuffer?: Buffer
}

export interface S13TParsedAssignment {
  readonly publisherName: string
  readonly startedAt?: string | null
  readonly completedAt?: string | null
}

export interface S13TParsedTerritory {
  readonly territoryNumberOrName: string
  readonly lastCompletedDate?: string | null
  readonly assignments: readonly S13TParsedAssignment[]
}

export interface S13TParsedDocument {
  readonly serviceYear?: number | null
  readonly congregationName?: string | null
  readonly territories: readonly S13TParsedTerritory[]
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return ''
  const day = String(d.getUTCDate()).padStart(2, '0')
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const year = d.getUTCFullYear()
  return `${day}/${month}/${year}`
}

export function parseDocxDate(text: string): Date | null {
  if (!text) return null
  const cleaned = text.trim()
  if (!cleaned) return null

  // Matches DD/MM/YYYY or DD/MM/YY or DD-MM-YYYY
  const ptMatch = cleaned.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (ptMatch) {
    const day = parseInt(ptMatch[1], 10)
    const month = parseInt(ptMatch[2], 10) - 1
    let year = parseInt(ptMatch[3], 10)
    if (year < 100) {
      year += year < 70 ? 2000 : 1900
    }
    const d = new Date(Date.UTC(year, month, day, 12, 0, 0))
    return isNaN(d.getTime()) ? null : d
  }

  // Matches YYYY-MM-DD
  const isoMatch = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10)
    const month = parseInt(isoMatch[2], 10) - 1
    const day = parseInt(isoMatch[3], 10)
    const d = new Date(Date.UTC(year, month, day, 12, 0, 0))
    return isNaN(d.getTime()) ? null : d
  }

  return null
}

function resolveTemplateBuffer(customBuffer?: Buffer): Buffer {
  if (customBuffer) return customBuffer

  const possiblePaths = [
    join(__dirname, '../../resources/S-13_T_template.docx'),
    join(__dirname, '../resources/S-13_T_template.docx'),
    join(process.cwd(), 'resources/S-13_T_template.docx')
  ]

  for (const p of possiblePaths) {
    try {
      return readFileSync(p)
    } catch {
      // try next
    }
  }

  throw new Error('S-13_T_template.docx not found')
}

function setCellText(cellXml: string, text: string): string {
  const pPattern = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/
  const escaped = escapeXml(text)

  const newP = `<w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:pPr><w:r><w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>${escaped}</w:t></w:r></w:p>`

  if (pPattern.test(cellXml)) {
    return cellXml.replace(pPattern, newP)
  }
  // If no <w:p> in cell, append inside </w:tc>
  return cellXml.replace('</w:tc>', `${newP}</w:tc>`)
}

function getCellText(cellXml: string): string {
  const tMatches = cellXml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)
  const pieces: string[] = []
  for (const m of tMatches) {
    pieces.push(m[1])
  }
  return pieces.join('').trim()
}

/**
 * Builds the official S-13-T Word (.docx) document by populating the template.
 */
export async function buildS13TDocx(input: S13TExportInput): Promise<Buffer> {
  const templateBuf = resolveTemplateBuffer(input.templateBuffer)
  const zip = await JSZip.loadAsync(templateBuf)

  const docXmlFile = zip.file('word/document.xml')
  if (!docXmlFile) {
    throw new Error('Invalid docx: word/document.xml missing')
  }

  let docXml = await docXmlFile.async('string')
  const serviceYear = input.serviceYear ?? getServiceYear()

  // 1. Update Table 0 (Ano de Serviço)
  const tblPattern = /<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>/g
  const tables = [...docXml.matchAll(tblPattern)]
  if (tables.length < 2) {
    throw new Error('Invalid S-13-T template: expected at least 2 tables')
  }

  const table0Xml = tables[0][0]
  const table1Xml = tables[1][0]

  // Update Table 0 cell 1 with Service Year
  const t0Cells = [...table0Xml.matchAll(/<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g)]
  let updatedTable0Xml = table0Xml
  if (t0Cells.length >= 2) {
    const origCell1 = t0Cells[1][0]
    let yearText = String(serviceYear)
    if (input.congregation?.name) {
      yearText += `  •  ${input.congregation.name}`
    }
    const newCell1 = setCellText(origCell1, yearText)
    updatedTable0Xml = updatedTable0Xml.replace(origCell1, newCell1)
  }

  // 2. Update Table 1 (Territories and Assignments)
  const sorted = [...input.territories].sort((a, b) =>
    compareTerritoriesByNumber(a.territory.name, b.territory.name)
  )

  const serviceYearStart = new Date(Date.UTC(serviceYear - 1, 8, 1, 0, 0, 0))
  const serviceYearEnd = new Date(Date.UTC(serviceYear, 7, 31, 23, 59, 59, 999))

  const trPattern = /<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g
  const rows = [...table1Xml.matchAll(trPattern)].map((m) => m[0])

  if (rows.length < 4) {
    throw new Error('Invalid S-13-T template: Table 1 has fewer than 4 rows')
  }

  // Prototype rows for territory pairs:
  const protoRowA = rows[2]
  const protoRowB = rows[3]

  const newRows: string[] = [rows[0], rows[1]]

  const maxTerritories = Math.max(sorted.length, 20)

  for (let tIdx = 0; tIdx < maxTerritories; tIdx++) {
    const item = sorted[tIdx]
    let rowA = tIdx < 20 && 2 + tIdx * 2 < rows.length ? rows[2 + tIdx * 2] : protoRowA
    let rowB = tIdx < 20 && 3 + tIdx * 2 < rows.length ? rows[3 + tIdx * 2] : protoRowB

    if (item) {
      const { territory, assignments } = item

      // Find last completion date prior to service year
      const priorCompletions = assignments
        .filter((a) => a.completedAt && a.completedAt < serviceYearStart)
        .map((a) => a.completedAt!)
        .sort((a, b) => b.getTime() - a.getTime())

      const lastCompletedPrior = priorCompletions.length > 0 ? priorCompletions[0] : null

      // Find assignments within service year
      const syAssignments = assignments
        .filter((a) => {
          const s = a.startedAt
          const c = a.completedAt
          return (
            (s >= serviceYearStart && s <= serviceYearEnd) ||
            (c && c >= serviceYearStart && c <= serviceYearEnd)
          )
        })
        .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
        .slice(0, 4)

      // Populate Row A (6 cells)
      const cellsA = [...rowA.matchAll(/<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g)].map((m) => m[0])
      if (cellsA.length >= 6) {
        let updatedA = rowA
        // Cell 0: Territory name
        const newC0 = setCellText(cellsA[0], territory.name)
        updatedA = updatedA.replace(cellsA[0], newC0)

        // Cell 1: Last completed date
        const newC1 = setCellText(
          cellsA[1],
          lastCompletedPrior ? formatDate(lastCompletedPrior) : ''
        )
        updatedA = updatedA.replace(cellsA[1], newC1)

        // Cells 2..5: Publisher names
        for (let slot = 0; slot < 4; slot++) {
          const pubName = syAssignments[slot]?.publisher.name ?? ''
          const newCSlot = setCellText(cellsA[2 + slot], pubName)
          updatedA = updatedA.replace(cellsA[2 + slot], newCSlot)
        }
        rowA = updatedA
      }

      // Populate Row B (10 cells)
      const cellsB = [...rowB.matchAll(/<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g)].map((m) => m[0])
      if (cellsB.length >= 10) {
        let updatedB = rowB
        for (let slot = 0; slot < 4; slot++) {
          const asg = syAssignments[slot]
          const startDate = asg ? formatDate(asg.startedAt) : ''
          const endDate = asg && asg.completedAt ? formatDate(asg.completedAt) : ''

          const cellStart = cellsB[2 + slot * 2]
          const cellEnd = cellsB[3 + slot * 2]

          const newStart = setCellText(cellStart, startDate)
          updatedB = updatedB.replace(cellStart, newStart)

          const newEnd = setCellText(cellEnd, endDate)
          updatedB = updatedB.replace(cellEnd, newEnd)
        }
        rowB = updatedB
      }
    } else {
      // Empty territory row (clear text while preserving layout)
      const cellsA = [...rowA.matchAll(/<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g)].map((m) => m[0])
      let updatedA = rowA
      for (const c of cellsA) {
        updatedA = updatedA.replace(c, setCellText(c, ''))
      }
      rowA = updatedA

      const cellsB = [...rowB.matchAll(/<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g)].map((m) => m[0])
      let updatedB = rowB
      for (let i = 2; i < cellsB.length; i++) {
        updatedB = updatedB.replace(cellsB[i], setCellText(cellsB[i], ''))
      }
      rowB = updatedB
    }

    newRows.push(rowA, rowB)
  }

  // Replace Table 1 in docXml
  const table1Header = table1Xml.slice(0, table1Xml.indexOf('<w:tr'))
  const table1Footer = '</w:tbl>'
  const updatedTable1Xml = `${table1Header}${newRows.join('')}${table1Footer}`

  docXml = docXml.replace(table0Xml, updatedTable0Xml)
  docXml = docXml.replace(table1Xml, updatedTable1Xml)

  zip.file('word/document.xml', docXml)

  const outputBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  })

  return outputBuffer
}

/**
 * Parses an S-13-T Word (.docx) document and extracts territory assignments history.
 */
export async function parseS13TDocx(buffer: Buffer): Promise<S13TParsedDocument> {
  const zip = await JSZip.loadAsync(buffer)
  const docXmlFile = zip.file('word/document.xml')
  if (!docXmlFile) {
    throw new Error('Formato DOCX inválido: word/document.xml não encontrado')
  }

  const docXml = await docXmlFile.async('string')

  // Extract service year from paragraphs or Table 0
  let serviceYear: number | null = null
  const yearMatch =
    docXml.match(/Ano de Servi[çc]o:\s*(\d{4})/i) ||
    docXml.match(/Ano de Servi[çc]o[\s\S]*?\b(20\d{2}|19\d{2})\b/i)
  if (yearMatch) {
    serviceYear = parseInt(yearMatch[1], 10)
  }

  const tblPattern = /<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>/g
  const tables = [...docXml.matchAll(tblPattern)]
  if (tables.length === 0) {
    throw new Error('Nenhuma tabela encontrada no arquivo DOCX')
  }

  // If serviceYear not found in paragraphs, check the first table
  if (!serviceYear && tables.length > 0) {
    const t0Text = getCellText(tables[0][0])
    const m = t0Text.match(/\b(20\d{2}|19\d{2})\b/)
    if (m) {
      serviceYear = parseInt(m[1], 10)
    }
  }

  const trPattern = /<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g
  const tcPattern = /<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g
  const territories: S13TParsedTerritory[] = []

  for (const tblMatch of tables) {
    const tableXml = tblMatch[0]
    const rows = [...tableXml.matchAll(trPattern)].map((m) => m[0])
    if (rows.length < 2) continue

    // Verify this table is an S-13-T table by checking row 0 text
    const r0Text = getCellText(rows[0])
    if (!r0Text.toLowerCase().includes('terr') && !r0Text.toLowerCase().includes('designado')) {
      continue
    }

    // Territory rows start after header rows (index 2) in steps of 2 rows
    for (let i = 2; i + 1 < rows.length; i += 2) {
      const rowA = rows[i]
      const rowB = rows[i + 1]

      const cellsA = [...rowA.matchAll(tcPattern)].map((m) => getCellText(m[0]))
      const cellsB = [...rowB.matchAll(tcPattern)].map((m) => getCellText(m[0]))

      if (cellsA.length === 0) continue

      const rawTerritory = cellsA[0].replace(/[\r\n]+/g, ' ').trim()
      if (!rawTerritory) continue

      const lastCompletedText = cellsA[1] ? cellsA[1].replace(/[\r\n]+/g, ' ').trim() : ''

      const assignments: S13TParsedAssignment[] = []

      for (let slot = 0; slot < 4; slot++) {
        const pubName = cellsA[2 + slot] ? cellsA[2 + slot].replace(/[\r\n]+/g, ' ').trim() : ''
        if (!pubName) continue

        const startedAt = cellsB[2 + slot * 2]
          ? cellsB[2 + slot * 2].replace(/[\r\n]+/g, ' ').trim()
          : null
        const completedAt = cellsB[3 + slot * 2]
          ? cellsB[3 + slot * 2].replace(/[\r\n]+/g, ' ').trim()
          : null

        assignments.push({
          publisherName: pubName,
          startedAt: startedAt || null,
          completedAt: completedAt || null
        })
      }

      territories.push({
        territoryNumberOrName: rawTerritory,
        lastCompletedDate: lastCompletedText || null,
        assignments
      })
    }
  }

  return {
    serviceYear,
    territories
  }
}

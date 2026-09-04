import type { Member } from './types'

export interface ImportRow { name: string; email: string; phone: string; ownerId: string | null }
export interface ImportResult { leads: ImportRow[]; dupes: number; blanks: number }

/** A CSV parser that handles quoted fields and doubled quotes, because the
 *  sheets people export from Meta and Excel both contain commas in names. */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++ } else quoted = false
      } else cur += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(cur); cur = '' }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = '' }
    else if (c !== '\r') cur += c
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row) }
  return rows.filter((r) => r.some((x) => String(x ?? '').trim() !== ''))
}

const HEADERS = {
  name: ['name', 'full name', 'lead name', 'customer', 'customer name'],
  phone: ['phone', 'mobile', 'phone number', 'mobile number', 'contact', 'contact number'],
  email: ['email', 'e-mail', 'email address', 'mail'],
  owner: ['assign to', 'assigned to', 'owner', 'salesperson', 'sales person'],
}

/**
 * Maps a sheet onto leads. Two rules the prototype settled on and this keeps:
 * a row needs either a name or a phone to count, and a phone already in this
 * project is skipped rather than duplicated — an agency re-uploads the same
 * export more often than it uploads a new one.
 */
export function mapImport(
  rows: string[][],
  existingPhones: string[],
  members: Member[],
): ImportResult | { error: string } {
  if (!rows || rows.length < 2) return { error: 'That file has no rows under the header.' }

  const head = rows[0]!.map((h) => String(h ?? '').trim().toLowerCase())
  const col = (names: string[]) => {
    for (const n of names) { const k = head.indexOf(n); if (k > -1) return k }
    return -1
  }
  const iName = col(HEADERS.name)
  const iPhone = col(HEADERS.phone)
  const iEmail = col(HEADERS.email)
  const iOwner = col(HEADERS.owner)

  if (iName < 0 && iPhone < 0) {
    return { error: 'No "Name" or "Phone" column in the header row. Rename the header and try again.' }
  }

  const cell = (r: string[], i: number) => (i < 0 ? '' : String(r[i] ?? '').trim())
  const digits = (s: string) => s.replace(/\D/g, '')

  const seen = new Set(existingPhones.map(digits).filter(Boolean))
  const out: ImportRow[] = []
  let dupes = 0
  let blanks = 0

  for (const r of rows.slice(1)) {
    const name = cell(r, iName)
    const phone = cell(r, iPhone)
    if (!name && !phone) { blanks++; continue }
    const key = digits(phone)
    if (key && seen.has(key)) { dupes++; continue }
    if (key) seen.add(key)
    const ownerName = cell(r, iOwner).toLowerCase()
    const owner = ownerName ? members.find((m) => m.name.toLowerCase() === ownerName) : undefined
    out.push({
      name: name || '(no name)',
      email: cell(r, iEmail) || '',
      phone: phone || '',
      ownerId: owner?.id ?? null,
    })
  }
  return { leads: out, dupes, blanks }
}

/** .csv is parsed here; .xlsx goes through SheetJS, and if that script did not
 *  load the caller is told so rather than failing silently. */
let sheetJs: Promise<void> | null = null

/** Fetched the first time somebody opens a spreadsheet, and never again. */
function loadSheetJs(): Promise<void> {
  if (typeof XLSX !== 'undefined') return Promise.resolve()
  if (sheetJs) return sheetJs
  sheetJs = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
    s.onload = () => resolve()
    s.onerror = () => { sheetJs = null; reject(new Error('The Excel reader could not load. Save the sheet as CSV and import that.')) }
    document.head.appendChild(s)
  })
  return sheetJs
}

export async function readSheet(file: File): Promise<string[][]> {
  const lower = file.name.toLowerCase()
  if (/\.(xlsx|xls)$/.test(lower)) {
    await loadSheetJs()
    return new Promise((resolve, reject) => {
      const fr = new FileReader()
      fr.onload = () => {
        try {
          const wb = XLSX.read(new Uint8Array(fr.result as ArrayBuffer), { type: 'array' })
          resolve(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' }))
        } catch {
          reject(new Error('That file could not be read as a spreadsheet.'))
        }
      }
      fr.onerror = () => reject(new Error('The file could not be opened.'))
      fr.readAsArrayBuffer(file)
    })
  }
  return file.text().then(parseCSV)
}

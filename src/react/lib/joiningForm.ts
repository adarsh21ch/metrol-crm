import type { Color, PDFDocument, PDFFont, PDFPage } from 'pdf-lib'
import type { JobApplication } from '@/lib/hr'
import { fmtDate } from '@/lib/hr'

/**
 * Round 6 (0026) — "when HR wants to download the joining form, it should
 * fill itself in from what the candidate already typed on the apply form,
 * with their uploaded signature printed where a physical form has you sign."
 *
 * There is no scanned copy of Metrol's PRINTED joining form in this repo to
 * overlay text onto, so this builds a clean equivalent from scratch with
 * pdf-lib — same fields, same order as the application (and as
 * TermsAndConditions.tsx's transcript), laid out as a form rather than a
 * report. If Adarsh hands over the actual paper form later, this is the one
 * function that would change to draw onto it instead of drawing its own page.
 */

const MARGIN = 44
const PAGE_W = 595.28   // A4 at 72dpi
const PAGE_H = 841.89

interface Ctx {
  doc: PDFDocument
  page: PDFPage
  font: PDFFont
  bold: PDFFont
  y: number
  /** Threaded through rather than imported at module scope — see the
   *  dynamic import in buildJoiningFormPdf below for why. */
  rgb: (r: number, g: number, b: number) => Color
}

function newPage(ctx: Pick<Ctx, 'doc' | 'font' | 'bold' | 'rgb'>): Ctx {
  const page = ctx.doc.addPage([PAGE_W, PAGE_H])
  return { ...ctx, page, y: PAGE_H - MARGIN }
}

function ensureRoom(c: Ctx, need: number): Ctx {
  if (c.y - need < MARGIN) return newPage(c)
  return c
}

function heading(c: Ctx, text: string): Ctx {
  c = ensureRoom(c, 30)
  c.y -= 8
  c.page.drawText(text, { x: MARGIN, y: c.y, size: 12, font: c.bold, color: c.rgb(0.1, 0.1, 0.12) })
  c.y -= 6
  c.page.drawLine({ start: { x: MARGIN, y: c.y }, end: { x: PAGE_W - MARGIN, y: c.y }, thickness: 0.75, color: c.rgb(0.75, 0.75, 0.78) })
  c.y -= 14
  return c
}

/** A label/value grid — two per row, wrapping to a new row every 2 fields. */
function fields(c: Ctx, rows: [string, string][]): Ctx {
  const colW = (PAGE_W - MARGIN * 2) / 2
  for (let i = 0; i < rows.length; i += 2) {
    c = ensureRoom(c, 18)
    const pair = rows.slice(i, i + 2)
    pair.forEach(([label, value], j) => {
      const x = MARGIN + j * colW
      c.page.drawText(label + ':', { x, y: c.y, size: 8.5, font: c.bold, color: c.rgb(0.4, 0.4, 0.45) })
      c.page.drawText(value || '—', { x, y: c.y - 11, size: 9.5, font: c.font, color: c.rgb(0.1, 0.1, 0.12), maxWidth: colW - 12 })
    })
    c.y -= 30
  }
  return c
}

function paragraph(c: Ctx, text: string): Ctx {
  c = ensureRoom(c, 14)
  c.page.drawText(text || '—', { x: MARGIN, y: c.y, size: 9.5, font: c.font, maxWidth: PAGE_W - MARGIN * 2, lineHeight: 12 })
  c.y -= 16
  return c
}

/** A simple table: a header row in bold, then one row per record. Columns are
 *  given as [header, width-fraction] pairs so callers can weight them. */
function table(c: Ctx, cols: [string, number][], rows: string[][]): Ctx {
  if (rows.length === 0) return c
  const totalW = PAGE_W - MARGIN * 2
  const widths = cols.map(([, f]) => f * totalW)
  c = ensureRoom(c, 16)
  let x = MARGIN
  cols.forEach(([h], i) => { c.page.drawText(h, { x, y: c.y, size: 8, font: c.bold, color: c.rgb(0.4, 0.4, 0.45) }); x += widths[i]! })
  c.y -= 12
  for (const row of rows) {
    c = ensureRoom(c, 14)
    x = MARGIN
    row.forEach((cell, i) => {
      c.page.drawText(cell || '—', { x, y: c.y, size: 8.5, font: c.font, maxWidth: widths[i]! - 6 })
      x += widths[i]!
    })
    c.y -= 13
  }
  c.y -= 6
  return c
}

export interface JoiningFormApproval {
  designation: string
  departmentName: string
  employmentType: string
  officeName: string
  dateOfJoining: string
  employeeCode: string
}

/** `signatureBytes` is the downloaded applicant signature image (PNG or
 *  JPEG) — pass null when there is none to embed and the box is left blank
 *  for a wet signature instead. */
export async function buildJoiningFormPdf(
  app: JobApplication, approval: JoiningFormApproval, signatureBytes: Uint8Array | null,
): Promise<Uint8Array> {
  // pdf-lib is ~450 KB minified and used on exactly one button HR presses
  // occasionally — loaded here, not at the top of the file, so it never
  // ships in the bundle every employee downloads to punch in each morning.
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  let c = newPage({ doc, font, bold, rgb })

  c.page.drawText('Metrol Media — Employee Joining Form', { x: MARGIN, y: c.y, size: 15, font: bold })
  c.y -= 16
  c.page.drawText(`Generated ${fmtDate(new Date().toISOString().slice(0, 10))} · Employee ID ${approval.employeeCode || 'pending'}`,
    { x: MARGIN, y: c.y, size: 8.5, font, color: rgb(0.45, 0.45, 0.5) })
  c.y -= 20

  c = heading(c, '1. Appointment')
  c = fields(c, [
    ['Designation', approval.designation],
    ['Department', approval.departmentName],
    ['Employment type', approval.employmentType],
    ['Branch', approval.officeName],
    ['Date of joining', fmtDate(approval.dateOfJoining)],
    ['Employee ID', approval.employeeCode],
  ])

  c = heading(c, '2. Personal details')
  c = fields(c, [
    ['Full name', app.fullName],
    ["Father's / husband's name", app.fatherOrHusband],
    ['Gender', app.gender],
    ['Date of birth', fmtDate(app.dateOfBirth)],
    ['Place of birth', app.placeOfBirth],
    ['Nationality', app.nationality],
    ['Religion', app.religion],
    ['Marital status', app.maritalStatus],
    ['Dependents', app.dependents],
    ['Aadhaar number', app.aadhaarNumber],
    ['Phone', app.phone],
    ['Email', app.email],
  ])

  c = heading(c, '3. Address')
  c = fields(c, [['Pincode', app.pincode]])
  c.page.drawText('Present address:', { x: MARGIN, y: c.y, size: 8.5, font: bold, color: rgb(0.4, 0.4, 0.45) })
  c.y -= 11
  c = paragraph(c, app.presentAddress)
  c.page.drawText('Permanent address:', { x: MARGIN, y: c.y, size: 8.5, font: bold, color: rgb(0.4, 0.4, 0.45) })
  c.y -= 11
  c = paragraph(c, app.permanentAddress)

  if (app.education.length) {
    c = heading(c, '4. Education')
    c = table(c,
      [['Examination', 0.28], ['Year', 0.1], ['Institution', 0.34], ['Marks', 0.12], ['Subjects', 0.16]],
      app.education.map((e) => [e.examination, e.year, e.institution, e.marks, e.subjects]))
  }
  if (app.technicalQualification) {
    c = fields(c, [['Technical qualification', app.technicalQualification]])
  }

  if (app.employmentHistory.length) {
    c = heading(c, '5. Previous employment')
    c = table(c,
      [['From', 0.09], ['To', 0.09], ['Years', 0.08], ['Company', 0.3], ['Designation', 0.22], ['Reason for leaving', 0.22]],
      app.employmentHistory.map((e) => [e.from, e.to, e.totalYears, e.company, e.designation, e.reason]))
  } else {
    c = heading(c, '5. Previous employment')
    c = paragraph(c, 'No previous employer (fresher).')
  }

  c = heading(c, '6. Bank details')
  c = fields(c, [
    ['Bank name', app.bankName],
    ['Account name', app.bankAccountName],
    ['Account number', app.bankAccountNo],
    ['IFSC', app.bankIfsc],
  ])

  if (app.languages.length) {
    c = heading(c, '7. Languages')
    c = table(c,
      [['Language', 0.3], ['Understand', 0.17], ['Speak', 0.17], ['Read', 0.17], ['Write', 0.19]],
      app.languages.map((l) => [l.language, l.understand ? 'Yes' : '—', l.speak ? 'Yes' : '—', l.read ? 'Yes' : '—', l.write ? 'Yes' : '—']))
  }

  c = heading(c, '8. Reference')
  c = fields(c, [['Name', app.referenceName], ['Department', app.referenceDepartment]])

  // Signature block — always on its own room at the foot of the form, never
  // split across a page break.
  c = ensureRoom(c, 130)
  c = heading(c, '9. Signature')
  const boxW = 200, boxH = 70
  c.page.drawRectangle({ x: MARGIN, y: c.y - boxH, width: boxW, height: boxH, borderColor: rgb(0.7, 0.7, 0.74), borderWidth: 0.75 })
  if (signatureBytes) {
    try {
      const isPng = signatureBytes[0] === 0x89
      const img = isPng ? await doc.embedPng(signatureBytes) : await doc.embedJpg(signatureBytes)
      const scale = Math.min((boxW - 12) / img.width, (boxH - 12) / img.height, 1)
      const w = img.width * scale, h = img.height * scale
      c.page.drawImage(img, { x: MARGIN + (boxW - w) / 2, y: c.y - boxH + (boxH - h) / 2, width: w, height: h })
    } catch {
      c.page.drawText('(signature image could not be embedded — attach the original)',
        { x: MARGIN + 8, y: c.y - boxH / 2, size: 7, font, color: rgb(0.5, 0.5, 0.55), maxWidth: boxW - 16 })
    }
  } else {
    c.page.drawText('(no signature on file — sign here)', { x: MARGIN + 8, y: c.y - boxH / 2, size: 8, font, color: rgb(0.5, 0.5, 0.55) })
  }
  c.page.drawText('Employee signature', { x: MARGIN, y: c.y - boxH - 12, size: 8, font, color: rgb(0.45, 0.45, 0.5) })

  const rightX = MARGIN + boxW + 60
  c.page.drawRectangle({ x: rightX, y: c.y - boxH, width: boxW, height: boxH, borderColor: rgb(0.7, 0.7, 0.74), borderWidth: 0.75 })
  c.page.drawText('For Metrol Media (HR signature)', { x: rightX, y: c.y - boxH - 12, size: 8, font, color: rgb(0.45, 0.45, 0.5) })
  c.y -= boxH + 28

  c = ensureRoom(c, 24)
  c.page.drawText(
    'This form is generated from the applicant\'s own submission on company.metrol.in and reviewed by HR before printing.',
    { x: MARGIN, y: c.y, size: 7.5, font, color: rgb(0.5, 0.5, 0.55), maxWidth: PAGE_W - MARGIN * 2 },
  )

  return doc.save()
}

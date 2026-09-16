import { useEffect, useRef, useState } from 'react'
import { isConfigured } from '@/lib/supabase'
import {
  useJobApplications,
  type ApplicationSubmission, type EducationRow, type EmploymentRow, type LanguageRow,
} from '@/data/useJobApplications'
import { APPLICATION_DOCS } from '@/lib/hr'

/**
 * The one screen in this app that renders for a signed-out stranger — reached
 * at /apply, before App.tsx's session check runs (see App.tsx). It must never
 * import useWorkspace or anything that queries a policied table: an anonymous
 * visitor has no session for those queries to run under.
 *
 * It collects exactly what Metrol Media's printed APPLICATION FORM collects
 * (migration 0020 carries the columns). Submitting writes one row into
 * job_applications and up to five files into the QUARANTINED
 * 'job-applications' bucket — nothing else in the database is touched until
 * HR reviews and approves it.
 *
 * WHY A WIZARD RATHER THAN ONE LONG PAGE: this is ~30 fields plus three
 * repeatable tables plus five uploads. On a phone that is a scroll with no
 * end in sight, and the person filling it in is usually standing in an office
 * on somebody else's time. Eight short sections instead, each one screen or
 * less, with every answer saved as they type.
 */

const DRAFT_KEY = 'metrol-apply-draft-v1'
const TERMS_PDF = '/metrol-media-terms-and-conditions.pdf'

/** Ten digits, nothing else. A pasted "+91 98765 43210", "0098765…" or a
 *  number with spaces all end up as the same ten characters, so what gets
 *  stored does not depend on how somebody happened to type it. */
const tenDigits = (v: string) => v.replace(/\D/g, '').replace(/^(?:0+|91)/, '').slice(0, 10)

const blankEducation = (): EducationRow => ({ examination: '', year: '', institution: '', marks: '', subjects: '' })
const blankEmployment = (): EmploymentRow => ({ from: '', to: '', totalYears: '', company: '', designation: '', grossSalary: '', reason: '' })
const blankLanguage = (): LanguageRow => ({ language: '', understand: false, speak: false, read: false, write: false, remarks: '' })

/** Everything the applicant types. Files are deliberately NOT in here — see
 *  the restore notice on step 7 for why a browser cannot keep them. */
interface Draft {
  firstName: string; lastName: string; fatherOrHusband: string
  gender: string; dateOfBirth: string; placeOfBirth: string
  nationality: string; religion: string; maritalStatus: string; dependents: string
  aadhaarNumber: string; phone: string; email: string; positionInterest: string
  presentAddress: string; permanentAddress: string; sameAddress: boolean; pincode: string
  education: EducationRow[]; technicalQualification: string
  employmentHistory: EmploymentRow[]; noPreviousEmployment: boolean
  bankName: string; bankAccountName: string; bankAccountNo: string; bankIfsc: string
  languages: LanguageRow[]
  referenceName: string; referenceDepartment: string
  declarationAccepted: boolean; termsAccepted: boolean
}

const EMPTY: Draft = {
  firstName: '', lastName: '', fatherOrHusband: '',
  gender: '', dateOfBirth: '', placeOfBirth: '',
  nationality: 'Indian', religion: '', maritalStatus: '', dependents: '',
  aadhaarNumber: '', phone: '', email: '', positionInterest: '',
  presentAddress: '', permanentAddress: '', sameAddress: false, pincode: '',
  education: [blankEducation()], technicalQualification: '',
  employmentHistory: [], noPreviousEmployment: false,
  bankName: '', bankAccountName: '', bankAccountNo: '', bankIfsc: '',
  languages: [{ ...blankLanguage(), language: 'Hindi' }, { ...blankLanguage(), language: 'English' }],
  referenceName: '', referenceDepartment: '',
  declarationAccepted: false, termsAccepted: false,
}

/** Has the applicant actually typed anything? Merely opening the page used to
 *  be enough to write a draft, and the next visit then greeted a first-time
 *  visitor with "we found answers you had already started" over an empty
 *  form. A draft only counts once it differs from the blank one. */
const isBlank = (draft: Draft) => JSON.stringify(draft) === JSON.stringify(EMPTY)

/** The asterisk beside a label. Required means "this step will not let you
 *  past without it" — the same list `blocking()` enforces, so the mark and
 *  the rule cannot drift apart. */
const Req = () => <span className="req" aria-hidden="true">*</span>

const STEPS = [
  'Personal details',
  'Contact & address',
  'Education',
  'Work history',
  'Bank details',
  'Languages & reference',
  'Documents',
  'Declaration & terms',
]

export function ApplyPage() {
  const apps = useJobApplications(false)

  const [step, setStep] = useState(0)
  const [d, setD] = useState<Draft>(EMPTY)
  const [restored, setRestored] = useState(false)
  const [files, setFiles] = useState<Record<string, File | null>>({
    photo: null, pan: null, aadhaar: null, bank_proof: null, relieving_letter: null,
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const topRef = useRef<HTMLDivElement | null>(null)

  /* ---------------------------------------------------------- persistence */
  /* Read once on mount. Somebody filling this in on a phone gets a call, or
     the browser drops the tab — coming back to an empty form after ten
     minutes of typing is what makes people give up on a form entirely. */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (!raw) return
      const saved = JSON.parse(raw) as { draft?: Partial<Draft>; step?: number }
      if (!saved?.draft) return
      // Merged over EMPTY rather than used as-is: a draft written by an older
      // version of this form would otherwise arrive missing whatever has been
      // added since, and every one of those fields would read as undefined.
      const merged = { ...EMPTY, ...saved.draft }
      // A draft written before the +91 became furniture holds the whole
      // number; keep only what the field now expects.
      merged.phone = tenDigits(merged.phone)
      if (isBlank(merged)) return          // a draft of nothing is not progress
      setD(merged)
      setStep(Math.min(saved.step ?? 0, STEPS.length - 1))
      setRestored(true)
    } catch { /* a corrupt or blocked draft is not worth failing the page over */ }
  }, [])

  /* Written on every keystroke. localStorage is synchronous and this payload
     is a few KB, so there is nothing worth debouncing — and a debounce is
     exactly what would lose the last thing typed before the tab closed. */
  useEffect(() => {
    if (isBlank(d)) return                 // nothing typed yet — nothing to keep
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ draft: d, step })) } catch { /* private mode */ }
  }, [d, step])

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }))
  const setFile = (key: string, f: File | null) => setFiles((p) => ({ ...p, [key]: f }))

  /* ------------------------------------------------------------- stepping */
  const go = (n: number) => {
    setErr(null)
    setStep(n)
    topRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  /** What must be filled before a step will let you past it. Only what the
   *  paper form treats as required — everything else stays optional, so
   *  nobody is stuck unable to submit over a field that does not apply. */
  function blocking(n: number): string | null {
    if (n === 0) {
      if (!d.firstName.trim() || !d.lastName.trim()) return 'First and last name are required.'
      if (!d.gender) return 'Please select a gender.'
      if (!d.dateOfBirth) return 'Date of birth is required.'
    }
    if (n === 1) {
      if (d.phone.length !== 10) return 'Enter the 10 digits of your mobile number.'
      if (!d.email.trim()) return 'An email address is required.'
      if (!/^\S+@\S+\.\S+$/.test(d.email.trim())) return 'That email address does not look right.'
      if (!d.presentAddress.trim()) return 'Present address is required.'
      if (!d.pincode.trim()) return 'Pincode is required.'
    }
    if (n === 6) {
      const missing = APPLICATION_DOCS.filter((doc) => {
        if (doc.key === 'relieving_letter' && d.noPreviousEmployment) return false
        return !files[doc.key]
      })
      if (missing.length) return `Please attach: ${missing.map((m) => m.label).join(', ')}.`
    }
    if (n === 7) {
      if (!d.declarationAccepted) return 'Please tick the declaration to continue.'
      if (!d.termsAccepted) return 'Please accept the Terms & Conditions to continue.'
    }
    return null
  }

  const next = () => {
    const stop = blocking(step)
    if (stop) return setErr(stop)
    go(step + 1)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!isConfigured) return setErr('This form is not configured yet. Contact HR directly.')
    const stop = blocking(7)
    if (stop) return setErr(stop)

    setBusy(true); setErr(null)
    const submission: ApplicationSubmission = {
      firstName: d.firstName, lastName: d.lastName, fatherOrHusband: d.fatherOrHusband,
      gender: d.gender, dateOfBirth: d.dateOfBirth, placeOfBirth: d.placeOfBirth,
      nationality: d.nationality, religion: d.religion, maritalStatus: d.maritalStatus,
      dependents: d.dependents, aadhaarNumber: d.aadhaarNumber,
      // Stored complete — HR, the employee record and any future WhatsApp
      // link all want a dialable number, not ten bare digits.
      phone: d.phone ? `+91 ${d.phone}` : '',
      email: d.email, positionInterest: d.positionInterest,
      presentAddress: d.presentAddress,
      permanentAddress: d.sameAddress ? d.presentAddress : d.permanentAddress,
      pincode: d.pincode,
      education: d.education, technicalQualification: d.technicalQualification,
      employmentHistory: d.employmentHistory,
      bankName: d.bankName, bankAccountName: d.bankAccountName,
      bankAccountNo: d.bankAccountNo, bankIfsc: d.bankIfsc,
      languages: d.languages,
      referenceName: d.referenceName, referenceDepartment: d.referenceDepartment,
      declarationAccepted: d.declarationAccepted, termsAccepted: d.termsAccepted,
      noPreviousEmployment: d.noPreviousEmployment,
      files: {
        photo: files.photo!, pan: files.pan!, aadhaar: files.aadhaar!,
        bank_proof: files.bank_proof!,
        relieving_letter: d.noPreviousEmployment ? null : files.relieving_letter,
      },
    }
    const message = await apps.submit(submission)
    setBusy(false)
    if (message) return setErr(message)
    // Only now — a failed submit must leave the draft exactly where it was.
    try { localStorage.removeItem(DRAFT_KEY) } catch { /* nothing to clean up */ }
    setDone(true)
  }

  /* ------------------------------------------------------------ rendering */
  if (done) {
    return (
      <div className="screen is-active">
        <div className="auth">
          <div className="auth-card">
            <div className="auth-head">
              <div className="monogram" style={{ marginBottom: 6 }}>M</div>
              <h2>Application received</h2>
              <p>
                Thank you, {d.firstName.trim() || 'there'}. Metrol Media HR will review your
                application and email you at <strong>{d.email.trim()}</strong> if you are taken forward.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const pct = Math.round(((step + 1) / STEPS.length) * 100)
  const ed = (i: number, patch: Partial<EducationRow>) =>
    set('education', d.education.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const eh = (i: number, patch: Partial<EmploymentRow>) =>
    set('employmentHistory', d.employmentHistory.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const lg = (i: number, patch: Partial<LanguageRow>) =>
    set('languages', d.languages.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  return (
    <div className="screen is-active">
      <div className="auth">
        <div className="apply-card" ref={topRef}>
          <div className="auth-head">
            <div className="monogram" style={{ marginBottom: 6 }}>M</div>
            <h2>Join Metrol Media</h2>
            <p>
              Your answers save on this device as you type — you can close this and come back.
              Fields marked <span className="req">*</span> are required.
            </p>
          </div>

          <div className="wiz-head">
            <div className="wiz-meta">
              <span className="wiz-step">Step {step + 1} of {STEPS.length}</span>
              <span className="wiz-name">{STEPS[step]}</span>
            </div>
            <div className="wiz-bar"><i style={{ width: `${pct}%` }} /></div>
          </div>

          {restored && step === 0 && (
            <div className="wiz-note">
              We found answers you had already started — they are filled in below, so carry on where
              you left off. <strong>Attached documents are the one thing a browser cannot keep</strong>,
              so you will be asked for those again at step 7.
            </div>
          )}

          <form className="auth-form" onSubmit={submit}>

            {/* ----------------------------------------- 1. personal details */}
            {step === 0 && (
              <div className="field-grid">
                <div className="field">
                  <label htmlFor="apFirst">First name<Req /></label>
                  <input className="input" id="apFirst" autoComplete="given-name"
                         value={d.firstName} onChange={(e) => set('firstName', e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="apLast">Last name<Req /></label>
                  <input className="input" id="apLast" autoComplete="family-name"
                         value={d.lastName} onChange={(e) => set('lastName', e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="apFather">Father's / husband's name</label>
                  <input className="input" id="apFather"
                         value={d.fatherOrHusband} onChange={(e) => set('fatherOrHusband', e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="apGender">Gender<Req /></label>
                  <select className="input" id="apGender" value={d.gender}
                          onChange={(e) => set('gender', e.target.value)}>
                    <option value="">Select…</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="apDob">Date of birth<Req /></label>
                  <input className="input" id="apDob" type="date"
                         value={d.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="apPob">Place of birth</label>
                  <input className="input" id="apPob"
                         value={d.placeOfBirth} onChange={(e) => set('placeOfBirth', e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="apNat">Nationality</label>
                  <input className="input" id="apNat"
                         value={d.nationality} onChange={(e) => set('nationality', e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="apRel">Religion</label>
                  <input className="input" id="apRel"
                         value={d.religion} onChange={(e) => set('religion', e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="apMar">Marital status</label>
                  <select className="input" id="apMar" value={d.maritalStatus}
                          onChange={(e) => set('maritalStatus', e.target.value)}>
                    <option value="">Select…</option>
                    <option value="Bachelor">Bachelor / single</option>
                    <option value="Married">Married</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="apDep">Dependents</label>
                  <input className="input" id="apDep" placeholder="e.g. No, or 2"
                         value={d.dependents} onChange={(e) => set('dependents', e.target.value)} />
                </div>
              </div>
            )}

            {/* -------------------------------------- 2. contact and address */}
            {step === 1 && (
              <>
                <div className="field-grid">
                  <div className="field">
                    <label htmlFor="apPhone">Contact number<Req /></label>
                    <div className="phone-wrap">
                      <span className="phone-cc">+91</span>
                      <input className="input" id="apPhone" type="tel" inputMode="numeric"
                             autoComplete="tel-national" placeholder="10 digit number" maxLength={10}
                             value={d.phone} onChange={(e) => set('phone', tenDigits(e.target.value))} />
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="apEmail">Email<Req /></label>
                    <input className="input" id="apEmail" type="email" autoComplete="email"
                           value={d.email} onChange={(e) => set('email', e.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="apAadhaar">Aadhaar number</label>
                    <input className="input" id="apAadhaar" inputMode="numeric" placeholder="12 digits"
                           value={d.aadhaarNumber} onChange={(e) => set('aadhaarNumber', e.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="apPin">Pincode<Req /></label>
                    <input className="input" id="apPin" inputMode="numeric"
                           value={d.pincode} onChange={(e) => set('pincode', e.target.value)} />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="apPresent">Present address<Req /></label>
                  <textarea className="input" id="apPresent" rows={3}
                            value={d.presentAddress} onChange={(e) => set('presentAddress', e.target.value)} />
                </div>
                <label className="check">
                  <input type="checkbox" checked={d.sameAddress}
                         onChange={(e) => set('sameAddress', e.target.checked)} />
                  My permanent address is the same as above
                </label>
                {!d.sameAddress && (
                  <div className="field">
                    <label htmlFor="apPerm">Permanent address</label>
                    <textarea className="input" id="apPerm" rows={3}
                              value={d.permanentAddress} onChange={(e) => set('permanentAddress', e.target.value)} />
                  </div>
                )}
              </>
            )}

            {/* ----------------------------------------------- 3. education */}
            {step === 2 && (
              <>
                <p className="field-hint">Start with 10th standard, then a row for each one after it.</p>
                {d.education.map((row, i) => (
                  <div className="rep-row" key={i}>
                    <div className="rep-head">
                      <span>Qualification {i + 1}</span>
                      {d.education.length > 1 && (
                        <button type="button" className="rep-x"
                                onClick={() => set('education', d.education.filter((_, j) => j !== i))}>
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="field-grid">
                      <div className="field">
                        <label>Examination passed</label>
                        <input className="input" placeholder="e.g. 10th Std." value={row.examination}
                               onChange={(e) => ed(i, { examination: e.target.value })} />
                      </div>
                      <div className="field">
                        <label>Year of passing</label>
                        <input className="input" inputMode="numeric" placeholder="e.g. 2022" value={row.year}
                               onChange={(e) => ed(i, { year: e.target.value })} />
                      </div>
                      <div className="field">
                        <label>School / college / university</label>
                        <input className="input" value={row.institution}
                               onChange={(e) => ed(i, { institution: e.target.value })} />
                      </div>
                      <div className="field">
                        <label>% of marks</label>
                        <input className="input" value={row.marks}
                               onChange={(e) => ed(i, { marks: e.target.value })} />
                      </div>
                      <div className="field">
                        <label>Subjects</label>
                        <input className="input" value={row.subjects}
                               onChange={(e) => ed(i, { subjects: e.target.value })} />
                      </div>
                    </div>
                  </div>
                ))}
                <button type="button" className="btn btn--sm rep-add"
                        onClick={() => set('education', [...d.education, blankEducation()])}>
                  + Add another qualification
                </button>
                <div className="field">
                  <label htmlFor="apTech">Technical qualification (if any)</label>
                  <textarea className="input" id="apTech" rows={2}
                            placeholder="Any professional or technical course"
                            value={d.technicalQualification}
                            onChange={(e) => set('technicalQualification', e.target.value)} />
                </div>
              </>
            )}

            {/* -------------------------------------------- 4. work history */}
            {step === 3 && (
              <>
                <label className="check">
                  <input type="checkbox" checked={d.noPreviousEmployment}
                         onChange={(e) => {
                           set('noPreviousEmployment', e.target.checked)
                           if (e.target.checked) set('employmentHistory', [])
                         }} />
                  I have no previous employer (fresher)
                </label>
                <p className="field-hint">
                  Ticking this skips the work history, and means no relieving letter is asked for at step 7.
                </p>

                {!d.noPreviousEmployment && (
                  <>
                    {d.employmentHistory.length === 0 && (
                      <p className="field-hint">Add a row for each company you have worked at.</p>
                    )}
                    {d.employmentHistory.map((row, i) => (
                      <div className="rep-row" key={i}>
                        <div className="rep-head">
                          <span>Employer {i + 1}</span>
                          <button type="button" className="rep-x"
                                  onClick={() => set('employmentHistory', d.employmentHistory.filter((_, j) => j !== i))}>
                            Remove
                          </button>
                        </div>
                        <div className="field-grid">
                          <div className="field">
                            <label>From</label>
                            <input className="input" type="month" value={row.from}
                                   onChange={(e) => eh(i, { from: e.target.value })} />
                          </div>
                          <div className="field">
                            <label>To</label>
                            <input className="input" type="month" value={row.to}
                                   onChange={(e) => eh(i, { to: e.target.value })} />
                          </div>
                          <div className="field">
                            <label>Total years</label>
                            <input className="input" value={row.totalYears}
                                   onChange={(e) => eh(i, { totalYears: e.target.value })} />
                          </div>
                          <div className="field">
                            <label>Gross salary</label>
                            <input className="input" value={row.grossSalary}
                                   onChange={(e) => eh(i, { grossSalary: e.target.value })} />
                          </div>
                        </div>
                        <div className="field">
                          <label>Company name &amp; address</label>
                          <input className="input" value={row.company}
                                 onChange={(e) => eh(i, { company: e.target.value })} />
                        </div>
                        <div className="field">
                          <label>Designation &amp; nature of work</label>
                          <input className="input" value={row.designation}
                                 onChange={(e) => eh(i, { designation: e.target.value })} />
                        </div>
                        <div className="field">
                          <label>Reason for leaving</label>
                          <input className="input" value={row.reason}
                                 onChange={(e) => eh(i, { reason: e.target.value })} />
                        </div>
                      </div>
                    ))}
                    <button type="button" className="btn btn--sm rep-add"
                            onClick={() => set('employmentHistory', [...d.employmentHistory, blankEmployment()])}>
                      + Add an employer
                    </button>
                  </>
                )}
              </>
            )}

            {/* -------------------------------------------- 5. bank details */}
            {step === 4 && (
              <>
                <p className="field-hint">
                  Your salary account. The name must match exactly what is printed on the passbook or cheque.
                </p>
                <div className="field-grid">
                  <div className="field">
                    <label htmlFor="apBank">Bank name</label>
                    <input className="input" id="apBank"
                           value={d.bankName} onChange={(e) => set('bankName', e.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="apBankName">Name as on document</label>
                    <input className="input" id="apBankName"
                           value={d.bankAccountName} onChange={(e) => set('bankAccountName', e.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="apAcc">Account number</label>
                    <input className="input" id="apAcc" inputMode="numeric"
                           value={d.bankAccountNo} onChange={(e) => set('bankAccountNo', e.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="apIfsc">IFSC code</label>
                    <input className="input" id="apIfsc" autoCapitalize="characters"
                           value={d.bankIfsc} onChange={(e) => set('bankIfsc', e.target.value)} />
                  </div>
                </div>
              </>
            )}

            {/* ----------------------------------- 6. languages and reference */}
            {step === 5 && (
              <>
                <p className="field-hint">Tick what you can do in each language.</p>
                {d.languages.map((row, i) => (
                  <div className="rep-row" key={i}>
                    <div className="rep-head">
                      <input className="input rep-title" placeholder="Language" value={row.language}
                             onChange={(e) => lg(i, { language: e.target.value })} />
                      {d.languages.length > 1 && (
                        <button type="button" className="rep-x"
                                onClick={() => set('languages', d.languages.filter((_, j) => j !== i))}>
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="lang-ticks">
                      {(['understand', 'speak', 'read', 'write'] as const).map((skill) => (
                        <label className="check" key={skill}>
                          <input type="checkbox" checked={row[skill]}
                                 onChange={(e) => lg(i, { [skill]: e.target.checked })} />
                          {skill[0].toUpperCase() + skill.slice(1)}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                <button type="button" className="btn btn--sm rep-add"
                        onClick={() => set('languages', [...d.languages, blankLanguage()])}>
                  + Add a language
                </button>

                <div className="field-grid" style={{ marginTop: 6 }}>
                  <div className="field">
                    <label htmlFor="apPost">Post applied for</label>
                    <input className="input" id="apPost" placeholder="e.g. Video Editor"
                           value={d.positionInterest} onChange={(e) => set('positionInterest', e.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="apRefName">Reference name (if any)</label>
                    <input className="input" id="apRefName"
                           value={d.referenceName} onChange={(e) => set('referenceName', e.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="apRefDept">Reference department</label>
                    <input className="input" id="apRefDept"
                           value={d.referenceDepartment} onChange={(e) => set('referenceDepartment', e.target.value)} />
                  </div>
                </div>
              </>
            )}

            {/* ------------------------------------------------ 7. documents */}
            {step === 6 && (
              <>
                {restored && (
                  <div className="wiz-note">
                    Your typed answers came back, but <strong>a browser cannot save files</strong> —
                    please attach your documents again below.
                  </div>
                )}
                <p className="field-hint">
                  A clear photo of each is fine. Images or PDF.
                </p>
                <div className="field-grid">
                  {APPLICATION_DOCS.map((doc) => {
                    if (doc.key === 'relieving_letter' && d.noPreviousEmployment) return null
                    return (
                      <div className="field" key={doc.key}>
                        <label htmlFor={`apf-${doc.key}`}>{doc.label}<Req /></label>
                        <input className="input" id={`apf-${doc.key}`} type="file"
                               accept="image/*,.pdf"
                               onChange={(e) => setFile(doc.key, e.target.files?.[0] ?? null)} />
                        {files[doc.key] && <span className="file-ok">Attached — {files[doc.key]!.name}</span>}
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {/* --------------------------------------- 8. declaration, terms */}
            {step === 7 && (
              <>
                <div className="decl">
                  I do hereby declare that I have correctly furnished all above information after fully
                  understanding the question and same are true and complete in every respect to the best
                  of my knowledge and belief. I further undertake that in the event above information
                  being found untrue or material information is found to have been withheld by me, I
                  hereby accept company's right to terminate my services forthwith, without assigning
                  any reason thereof. Further my appointment is subject to my being found fit by
                  company's medical officer or other medical officer designated by the company for the
                  purpose.
                </div>
                <label className="check">
                  <input type="checkbox" checked={d.declarationAccepted}
                         onChange={(e) => set('declarationAccepted', e.target.checked)} />
                  I have read and accept the declaration above.
                </label>

                <div className="tc-box">
                  <div className="tc-top">
                    <strong>Terms &amp; Conditions of Employment</strong>
                    <a className="btn btn--sm" href={TERMS_PDF} target="_blank" rel="noopener" download>
                      Download PDF
                    </a>
                  </div>
                  <p className="field-hint">
                    Working hours and attendance, paid leave and salary adjustment, the annual
                    performance review, workplace conduct, termination and notice period,
                    confidentiality, and non-compete. Please read it before accepting.
                  </p>
                  <label className="check">
                    <input type="checkbox" checked={d.termsAccepted}
                           onChange={(e) => set('termsAccepted', e.target.checked)} />
                    I have read, understood and accept the Terms &amp; Conditions of Employment.
                  </label>
                </div>
              </>
            )}

            {err && <p className="auth-err">{err}</p>}

            <div className="wiz-nav">
              {step > 0 && (
                <button type="button" className="btn" onClick={() => go(step - 1)} disabled={busy}>
                  Back
                </button>
              )}
              {step < STEPS.length - 1 ? (
                <button type="button" className="btn btn--primary btn--lg wiz-next" onClick={next}>
                  Next
                </button>
              ) : (
                <button className="btn btn--primary btn--lg wiz-next" type="submit" disabled={busy}>
                  {busy ? 'Submitting…' : 'Submit application'}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

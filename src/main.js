import { auth, isConfigured, loadWorkspace, saveEvent, saveLead, insertLeads, supabase } from './data.js'
import './prototype.css'

const $ = (s) => document.querySelector(s)
const show = (id) => {
  document.querySelectorAll('.screen').forEach((el) => el.classList.toggle('is-active', el.id === id))
}

// The prototype's screen switcher belongs to a demo, not to a product.
document.querySelector('.proto')?.remove()

function fail(msg) {
  const el = $('#authErr')
  if (el) { el.textContent = msg; el.hidden = false }
}

function wireSignIn() {
  const go = $('#authGo')
  const email = $('#authEmail')
  const pass = $('#authPass')
  if (!go) return

  async function submit() {
    if (!isConfigured) return fail('Supabase is not configured for this deployment.')
    go.disabled = true
    go.textContent = 'Signing in…'
    const { error } = await auth.signIn(email.value.trim(), pass.value)
    go.disabled = false
    go.textContent = 'Sign in'
    if (error) return fail(error.message)
    location.reload()   // boot again, this time with a session
  }

  go.addEventListener('click', submit)
  ;[email, pass].forEach((i) =>
    i?.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit() }),
  )
}

async function boot() {
  const { data } = await auth.session()
  if (!data.session) {
    show('screen-signin')
    wireSignIn()
    return
  }

  const ws = await loadWorkspace()
  if (ws.error) {
    show('screen-signin')
    wireSignIn()
    return fail(ws.error.message ?? String(ws.error))
  }

  // Hand the prototype its rows, and the writes it should make when they change.
  window.__SEED = ws
  window.__DB = {
    saveLead: (id, patch) => saveLead(id, patch),
    saveEvent: (e) => saveEvent(e),
    insertLeads: (rows) => insertLeads(rows),
    signOut: async () => { await auth.signOut(); location.reload() },
    supabase,
  }

  await import('./app.js')

  // A signed-in owner lands on their projects, not on the marketing page.
  show(ws.me && ws.me.role === 'member' ? 'screen-member' : 'screen-projects')
  window.dispatchEvent(new Event('resize'))   // grids measure on first paint
}

boot()

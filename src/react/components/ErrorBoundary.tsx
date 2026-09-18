import React from 'react'

/**
 * The thing that turns a white screen into a sentence.
 *
 * React unmounts the ENTIRE tree when a render or a lifecycle throws and
 * nothing catches it — which paints the page blank, with the real error only
 * in a console no employee is going to open on their phone. That is exactly
 * what Adarsh hit on 2026-09-18: the dashboard appeared for a fraction of a
 * second and then went completely white, twice, with nothing to report but
 * the colour.
 *
 * This catches it and shows what broke, because a message somebody can read
 * out or screenshot is worth more than any amount of guessing from the
 * outside. It deliberately does NOT try to recover: the tree is already
 * unmounted and half the app's state is gone, so a reload is the honest
 * offer.
 */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Kept in the console too, with the component stack the UI has no room
    // for — that is what says WHICH part of the screen threw.
    console.error('[Metrol CRM] a screen crashed:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const detail = `${error.name}: ${error.message}`
    return (
      <div className="auth">
        <div className="auth-card">
          <div className="auth-head">
            <h2>Something broke</h2>
            <p>This screen hit an error and stopped. Nothing you did caused it, and nothing has been lost.</p>
          </div>
          <div className="auth-form">
            <p className="auth-err" style={{ wordBreak: 'break-word' }}>{detail}</p>
            <button className="btn btn--block btn--primary" onClick={() => window.location.reload()}>
              Reload the page
            </button>
            <button
              className="btn btn--block"
              onClick={() => { void navigator.clipboard?.writeText(detail).catch(() => {}) }}
            >
              Copy the error
            </button>
            <p className="field-hint">
              If this keeps happening, send that error text over — it names the exact cause.
            </p>
          </div>
        </div>
      </div>
    )
  }
}

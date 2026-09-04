import { useState } from 'react'

/**
 * The front door. It exists so company.metrol.in is a page rather than a bare
 * login box, and so the logo has somewhere to live.
 *
 * Drop a file at public/logo.png (or .svg) and it replaces the lettering below;
 * until one exists the image fails to load and the monogram lockup stays. No
 * configuration, no build flag — the presence of the file is the switch.
 */
export function Landing({ onSignIn }: { onSignIn: () => void }) {
  const [hasLogo, setHasLogo] = useState(true)

  return (
    <div className="screen is-active">
      <div className="landing">
        <div className="landing-bar">
          <div className="brand">
            <div className="monogram">M</div>
            <div className="brand-name">Metrol Media</div>
          </div>
          <button className="btn btn--primary btn--sm" onClick={onSignIn}>Sign in</button>
        </div>

        <div className="landing-main">
          <div className="logo-plate">
            {hasLogo ? (
              <img
                src="/logo.png"
                alt="Metrol Media"
                className="logo-img"
                onError={() => setHasLogo(false)}
              />
            ) : (
              <>
                <div className="logo-lockup">
                  <div className="monogram">M</div>
                  <div className="logo-word">METROL MEDIA</div>
                </div>
                <div className="logo-note">Placeholder — drop your logo at public/logo.png</div>
              </>
            )}
          </div>

          <div className="landing-copy">
            <div className="eyebrow">Internal systems</div>
            <h1>The workspace where Metrol Media runs its projects.</h1>
            <p>
              Leads, follow-ups, conversions and team performance for every client project — in one
              place, updated by the people doing the work. Access is limited to Metrol Media staff.
            </p>
            <button className="btn btn--primary btn--lg" onClick={onSignIn}>Sign in to dashboard</button>
          </div>
        </div>

        <div className="landing-foot">
          <div>© {new Date().getFullYear()} Metrol Media · metrol.in</div>
          <div style={{ display: 'flex', gap: 18 }}>
            <a href="#" onClick={(e) => e.preventDefault()}>Privacy</a>
            <a href="#" onClick={(e) => e.preventDefault()}>Support</a>
          </div>
        </div>
      </div>
    </div>
  )
}

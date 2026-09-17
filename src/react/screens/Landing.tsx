import { useState } from 'react'

/**
 * The front door — the one page somebody outside Metrol Media might ever see,
 * so it is the only screen in this app designed as a brand surface rather than
 * as product chrome.
 *
 * IT IS PINNED DARK ON PURPOSE, and does not follow the app's light/dark
 * toggle. Two reasons, and the first is the deciding one: the supplied logo is
 * a rendered plate with its own black ground and gold rim light baked in — it
 * is not a transparent mark. On a white card it reads as a screenshot of a logo
 * pasted onto a page; on black it reads as the logo. The second is that black,
 * white and gold IS the brand, and a front door should state that rather than
 * inherit whatever the viewer's laptop was set to last night.
 *
 * The full plate is shown whole, at full size, with the copy sitting BELOW it
 * — not cropped into a background. A full-bleed background version of this was
 * tried and dropped: the logo's own wordmark sits in the middle of the plate,
 * so any text overlaid on top of it collided with the render's own lettering.
 * Showing the plate intact avoids that outright.
 *
 * Drop a file at public/logo.png (or .svg) and it replaces the lettering
 * below; until one exists the image fails to load and the monogram lockup
 * stays. No configuration, no build flag — the presence of the file is the
 * switch.
 */
export function Landing({ onSignIn }: { onSignIn: () => void }) {
  const [hasLogo, setHasLogo] = useState(true)

  return (
    <div className="screen is-active">
      <div className="landing landing--hero">
        <main className="lh-main">
          {/* The glow sits BEHIND the logo and picks up the same gold the render
              already throws onto its own floor, so the plate reads as lit by the
              page rather than pasted onto it. Decorative only. */}
          <div className="lh-glow" aria-hidden="true" />

          <div className="lh-logo">
            {hasLogo ? (
              <img src="/logo.png" alt="Metrol Media" className="lh-logo-img" onError={() => setHasLogo(false)} />
            ) : (
              <div className="lh-lockup">
                <span className="lh-mono lh-mono--lg">M</span>
                <span className="lh-word">METROL MEDIA</span>
              </div>
            )}
          </div>

          <h1 className="lh-title">
            One workspace, every <span className="lh-em">Metrol Media</span> project.
          </h1>
          <p className="lh-sub">
            Leads, follow-ups, conversions and team performance — tracked live, in one place.
          </p>

          <button className="btn lh-cta" onClick={onSignIn}>Sign in</button>
        </main>

        <footer className="lh-foot">
          <span>© {new Date().getFullYear()} Metrol Media</span>
        </footer>
      </div>
    </div>
  )
}

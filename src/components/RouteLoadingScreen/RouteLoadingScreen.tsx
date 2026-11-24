import { useEffect } from 'react'
import './RouteLoadingScreen.css'

export default function RouteLoadingScreen() {
  const betrayals = import.meta.env.VITE_BETRAYALS_EDITION === 'true'
  useEffect(() => {
    // The route fallback owns the application viewport while a screen bundle
    // arrives. Use a root class as a WebView-safe counterpart to :has().
    document.documentElement.classList.add('route-loading-active')
    return () => document.documentElement.classList.remove('route-loading-active')
  }, [])

  return (
    <div
      className="route-loading-screen"
      data-edition={betrayals ? 'betrayals' : undefined}
      role="status"
      aria-label="Loading screen"
    >
      <div className="route-loading-screen__glass">
        <div className="route-loading-screen__signal" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p>{betrayals ? 'Raising the castle walls…' : 'Preparing the Hub…'}</p>
      </div>
    </div>
  )
}

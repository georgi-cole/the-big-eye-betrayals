import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RouteLoadingScreen from '../RouteLoadingScreen'

describe('RouteLoadingScreen', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllEnvs()
  })

  it('marks the route loading handoff so persistent chrome can be hidden', () => {
    vi.stubEnv('VITE_BETRAYALS_EDITION', 'false')
    const view = render(<RouteLoadingScreen />)

    expect(screen.getByRole('status', { name: 'Loading screen' })).toHaveTextContent(
      'Preparing the Hub…'
    )
    expect(document.documentElement).toHaveClass('route-loading-active')

    view.unmount()

    expect(document.documentElement).not.toHaveClass('route-loading-active')
  })

  it('uses the castle treatment for Betrayals route loading', () => {
    vi.stubEnv('VITE_BETRAYALS_EDITION', 'true')
    render(<RouteLoadingScreen />)

    const loading = screen.getByRole('status', { name: 'Loading screen' })
    expect(loading).toHaveAttribute('data-edition', 'betrayals')
    expect(loading).toHaveTextContent('Raising the castle walls…')
  })
})

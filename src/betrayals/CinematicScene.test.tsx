import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CinematicScene } from './CinematicScene'

const known = { id: 'ash', name: 'Ash', portrait: '/ash.webp' }
const hidden = { id: 'alien', name: 'Hidden identity', portrait: '/hidden.webp', concealed: true }

describe('Betrayals cinematic scenes', () => {
  afterEach(() => vi.useRealTimers())

  it('reveals only known conclave participants and waits for the player to continue', () => {
    vi.useFakeTimers()
    const onComplete = vi.fn()
    const { container } = render(
      <CinematicScene
        scene={{ id: 'conclave', kind: 'conclave-arrival', cast: [known, hidden] }}
        onComplete={onComplete}
      />
    )
    expect(screen.getByText(known.name)).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(680))
    expect(screen.getByText(known.name)).toBeInTheDocument()
    expect(container.querySelector('.betrayals-cine__guest img')).toHaveAttribute(
      'src',
      expect.stringContaining('Ash_informal.webp')
    )
    expect(screen.queryByText(hidden.name)).not.toBeInTheDocument()
    expect(container.querySelector(`[src="${hidden.portrait}"]`)).not.toBeInTheDocument()
    expect(onComplete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onComplete).toHaveBeenCalledOnce()
  })

  it('keeps a concealed shield recipient absent even when the animation is reduced', () => {
    const { container } = render(
      <CinematicScene
        scene={{ id: 'shield', kind: 'shield', subject: hidden, concealed: true }}
        reducedMotion
        onComplete={vi.fn()}
      />
    )
    expect(screen.getByRole('heading', { name: 'Full Immunity' })).toBeInTheDocument()
    expect(screen.queryByText(hidden.name)).not.toBeInTheDocument()
    expect(container.querySelector(`[src="${hidden.portrait}"]`)).not.toBeInTheDocument()
  })

  it('lights the surviving contestant seats and leaves the night victim dark', () => {
    render(
      <CinematicScene
        scene={{
          id: 'wake',
          kind: 'awakening',
          cast: [known, { id: 'finn', name: 'Finn' }],
          darkSeatId: 'finn',
        }}
        reducedMotion
        onComplete={vi.fn()}
      />
    )
    const roster = within(screen.getByRole('list', { name: 'Morning roll call' }))
    expect(roster.getByText('Ash').closest('li')).toHaveAttribute('data-awake', 'true')
    expect(roster.getByText('Finn').closest('li')).toHaveAttribute('data-awake', 'false')
    expect(
      roster.getByText('Finn').closest('li')?.querySelector('.betrayals-sleep-mask')
    ).toBeInTheDocument()
  })

  it('reveals the role on a full-figure verdict and keeps a blind ballot sealed', () => {
    const { container, rerender } = render(
      <CinematicScene
        scene={{ id: 'verdict', kind: 'departure', subject: known, role: 'Loyal' }}
        reducedMotion
        onComplete={vi.fn()}
      />
    )
    expect(screen.getByText('I was a Loyal.')).toBeVisible()
    expect(container.querySelector('.betrayals-verdict-stage__figure img')).toHaveAttribute(
      'src',
      expect.stringContaining('Ash_informal.webp')
    )
    rerender(
      <CinematicScene
        scene={{ id: 'sealed', kind: 'departure', subject: known }}
        reducedMotion
        onComplete={vi.fn()}
      />
    )
    expect(screen.getByText('Role sealed until the finale')).toBeVisible()
  })

  it('shows the Night letter as the accessible outcome without a walk', () => {
    const { container } = render(
      <CinematicScene
        scene={{ id: 'night', kind: 'death-letter', subject: known }}
        reducedMotion
        onComplete={vi.fn()}
      />
    )
    expect(screen.getByText('For Ash')).toBeVisible()
    expect(screen.getByText('You have been eliminated at Night.')).toBeVisible()
    expect(container.querySelector('[data-walk]')).not.toBeInTheDocument()
  })

  it('walks backstage in the saved casual look and then closes the door', () => {
    vi.useFakeTimers()
    const { container } = render(
      <CinematicScene
        scene={{
          id: 'exit',
          kind: 'departure',
          angle: 'door',
          subject: {
            id: 'human',
            human: true,
            name: 'Georgi',
            portrait: '/assets/player_characters/character%2015/main.webp',
          },
        }}
        onComplete={vi.fn()}
      />
    )
    act(() => vi.advanceTimersByTime(1050))
    act(() => vi.advanceTimersByTime(1750))
    expect(container.querySelector('[data-walk="character-15"]')).toBeInTheDocument()
    expect(container.querySelector('.betrayals-cine__corridor-plane')).toHaveAttribute(
      'data-closed',
      'false'
    )
    act(() => vi.advanceTimersByTime(2550))
    expect(container.querySelector('.betrayals-cine__corridor-plane')).toHaveAttribute(
      'data-closed',
      'true'
    )
    expect(container.querySelector('[data-walk]')).not.toBeInTheDocument()
  })

  it('hands off an intermediate scene once after its final beat', () => {
    vi.useFakeTimers()
    const onComplete = vi.fn()
    render(
      <CinematicScene
        scene={{ id: 'transition', kind: 'interlude' }}
        autoAdvance
        onComplete={onComplete}
      />
    )
    act(() => vi.advanceTimersByTime(1200))
    act(() => vi.advanceTimersByTime(2199))
    expect(onComplete).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onComplete).toHaveBeenCalledOnce()
  })
})

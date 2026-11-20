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
        scene={{ id: 'conclave', kind: 'conclave-arrival', cast: [known, hidden], castCount: 4 }}
        onComplete={onComplete}
      />
    )
    expect(container.querySelectorAll('.betrayals-cine__hood')).toHaveLength(4)
    expect(screen.queryByText(known.name)).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1600))
    act(() => vi.advanceTimersByTime(1400))
    expect(screen.getByText(known.name)).toBeInTheDocument()
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
    expect(screen.getByRole('heading', { name: 'The shield is awarded' })).toBeInTheDocument()
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

  it.each([
    ['elimination', 'Murdered'],
    ['departure', 'Evicted'],
  ] as const)('uses the correct verdict stamp for %s with reduced motion', (kind, name) => {
    const { container } = render(
      <CinematicScene
        scene={{ id: kind, kind, subject: known }}
        reducedMotion
        onComplete={vi.fn()}
      />
    )
    expect(screen.getByRole('img', { name })).toHaveAttribute(
      'src',
      expect.stringContaining('verdict-' + name.toLowerCase() + '.png')
    )
    expect(container.querySelector('[src*="cracked_glass"]')).not.toBeInTheDocument()
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

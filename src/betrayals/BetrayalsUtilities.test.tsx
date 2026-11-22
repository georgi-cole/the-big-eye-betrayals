import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SoundManager } from '../services/sound/SoundManager'
import {
  BETRAYALS_PORTRAITS,
  getBetrayalsPortrait,
  useBetrayalsUtilities,
} from './betrayalsPreferences'
import { BetrayalsUtilityChips, BetrayalsUtilityPanel } from './BetrayalsUtilities'
import type { Phase } from './run'

vi.mock('../services/sound/SoundManager', () => ({
  SoundManager: {
    init: vi.fn(),
    unlockFromGesture: vi.fn(),
    stopAllMusic: vi.fn(),
    setMusicVolume: vi.fn(),
    setMusicMuted: vi.fn(),
    setDesiredMusic: vi.fn(),
    setCategoryEnabled: vi.fn(),
    setCategoryVolume: vi.fn(),
    play: vi.fn(),
  },
}))

function UtilitiesHarness({ phase, playing }: { phase?: Phase; playing?: boolean }) {
  const utilities = useBetrayalsUtilities(phase, playing)
  return (
    <>
      <BetrayalsUtilityChips utilities={utilities} />
      <BetrayalsUtilityPanel utilities={utilities} />
    </>
  )
}

describe('Betrayals game controls', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (
      this: HTMLDialogElement
    ) {
      this.open = true
    })
    vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (
      this: HTMLDialogElement
    ) {
      this.open = false
    })
  })

  afterEach(() => vi.restoreAllMocks())

  it('starts the phase soundtrack on demand and releases it during a challenge', () => {
    const view = render(<UtilitiesHarness phase="dawn" />)
    const music = screen.getByRole('button', { name: 'Music', pressed: false })
    fireEvent.click(music)
    expect(music).toHaveAttribute('aria-pressed', 'true')
    expect(SoundManager.setDesiredMusic).toHaveBeenLastCalledWith('nominations', 'betrayals')
    expect(SoundManager.unlockFromGesture).toHaveBeenCalled()

    view.rerender(<UtilitiesHarness phase="immunity" playing />)
    expect(SoundManager.setDesiredMusic).toHaveBeenLastCalledWith('none', 'betrayals')
    view.rerender(<UtilitiesHarness phase="night" />)
    expect(SoundManager.setDesiredMusic).toHaveBeenLastCalledWith('nominations_horror', 'betrayals')

    view.unmount()
    render(<UtilitiesHarness phase="night" />)
    expect(screen.getByRole('button', { name: 'Music', pressed: true })).toBeInTheDocument()
  })

  it('applies sound and motion settings, then restores them on the next visit', () => {
    const view = render(<UtilitiesHarness />)
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    const settings = screen.getByRole('dialog', { name: 'Settings' })
    fireEvent.change(within(settings).getByRole('slider', { name: 'Effects volume' }), {
      target: { value: '70' },
    })
    expect(SoundManager.setCategoryVolume).toHaveBeenCalledWith('minigame', 0.7)
    fireEvent.click(within(settings).getByRole('switch', { name: 'Sound effects' }))
    expect(SoundManager.setCategoryEnabled).toHaveBeenCalledWith('tv', false)
    fireEvent.click(within(settings).getByRole('switch', { name: 'Animations' }))
    expect(settings).toHaveAttribute('data-betrayals-motion', 'reduced')
    fireEvent.click(within(settings).getByRole('button', { name: 'Close settings' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    view.unmount()
    render(<UtilitiesHarness />)
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(screen.getByRole('switch', { name: 'Animations' })).not.toBeChecked()
    expect(screen.getByRole('slider', { name: 'Effects volume' })).toBeDisabled()
    expect(screen.getByRole('slider', { name: 'Effects volume' })).toHaveValue('70')
  })

  it('remembers the equipped portrait and allows restoring the default', () => {
    const portrait = BETRAYALS_PORTRAITS[1]
    const view = render(<UtilitiesHarness />)
    fireEvent.click(screen.getByRole('button', { name: 'Store' }))
    fireEvent.click(screen.getByRole('button', { name: portrait.name }))
    expect(screen.getByRole('button', { name: portrait.name, pressed: true })).toBeInTheDocument()
    expect(getBetrayalsPortrait(portrait.id)).toMatch(
      /assets\/player_characters\/character%2015\/main.webp$/
    )

    view.unmount()
    render(<UtilitiesHarness />)
    fireEvent.click(screen.getByRole('button', { name: 'Store' }))
    expect(screen.getByRole('button', { name: portrait.name, pressed: true })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Default portrait' }))
    expect(
      screen.getByRole('button', { name: 'Default portrait', pressed: true })
    ).toBeInTheDocument()
  })
})

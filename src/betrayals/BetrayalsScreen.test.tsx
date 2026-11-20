import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BetrayalsScreen from './BetrayalsScreen'
import { BETRAYALS_AI_POOL } from './cast'
import { saveRun } from './persistence'
import { startRun } from './run'

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

vi.mock('../components/ColorMatchComp/ColorMatchComp', () => ({
  default: ({ onFinish }: { onFinish: (score: number) => void }) => (
    <button onClick={() => onFinish(100)}>Finish challenge</button>
  ),
}))

vi.mock('../minigames/quickTapRace/QuickTapRaceCanvasGame', () => ({
  default: ({ onFinish }: { onFinish: (score: number) => void }) => (
    <button onClick={() => onFinish(1000)}>Finish challenge</button>
  ),
}))

describe('Betrayals season review', () => {
  beforeEach(() => {
    localStorage.clear()
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

  it('opens a 25-seat season, restores it, and advances through both challenge windows', async () => {
    const app = render(<BetrayalsScreen />)
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Georgi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start season' }))

    expect(screen.getByRole('heading', { name: 'Your role' })).toBeInTheDocument()
    const cast = screen.getByRole('list', { name: 'Contestant roster' })
    expect(within(cast).getAllByRole('button')).toHaveLength(25)
    expect(within(cast).getByRole('button', { name: 'Georgi' })).toBeInTheDocument()

    app.unmount()
    render(<BetrayalsScreen />)
    expect(screen.getByRole('heading', { name: 'Your role' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Play: open Day 1' }))
    expect(screen.getByRole('heading', { name: 'Dawn' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Play: enter Social' }))
    expect(screen.getByRole('heading', { name: 'Social' })).toBeInTheDocument()
    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Season actions' })).getByRole('button', {
        name: /^Social/,
      })
    )
    const conversations = screen.getByRole('dialog', { name: 'Social' })
    expect(conversations).toBeVisible()
    fireEvent.click(within(conversations).getByRole('button', { name: 'Close Social' }))
    expect(screen.queryByRole('dialog', { name: 'Social' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Play: begin Immunity Challenge' }))
    fireEvent.click(screen.getByRole('button', { name: 'Play Quick Tap Race' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Finish challenge' }))
    expect(screen.getByRole('heading', { name: 'Safety Challenge' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'See results' }))
    expect(screen.getByRole('heading', { name: 'Round Table' })).toBeInTheDocument()
  })

  it('keeps the revealed contestant in their original seat after a banishment', () => {
    const run = startRun(
      { id: 'human', name: 'Georgi' },
      BETRAYALS_AI_POOL,
      { publicMode: false, realityMode: 'off' },
      { id: 'test-banishment', roleSeed: 32, publicSeed: 12 }
    )
    const banished = run.seats.find(
      ({ id }) => id !== run.humanId && !run.private.betrayers.includes(id)
    )!
    saveRun(localStorage, 'edition-local', {
      ...run,
      phase: 'table-reveal',
      private: {
        ...run.private,
        pendingTable: {
          banishedId: banished.id,
          blind: false,
          tally: { [banished.id]: 18 },
          tiedByDraw: false,
        },
      },
    })

    render(<BetrayalsScreen />)
    const tv = within(screen.getByRole('region', { name: 'Faux TV' }))
    const cast = within(screen.getByRole('list', { name: 'Contestant roster' }))
    const position = cast
      .getAllByRole('button')
      .indexOf(cast.getByRole('button', { name: banished.name }))
    expect(tv.getByText('The ballots are sealed.')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Reveal result' }))
    expect(tv.getByText(banished.name + ' was banished. A Loyal.')).toBeVisible()
    const seats = cast.getAllByRole('button')
    expect(seats).toHaveLength(25)
    expect(seats[position]).toHaveAccessibleName(banished.name + ', Banished, Loyal')
  })
})

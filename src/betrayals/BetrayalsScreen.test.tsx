import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as durablePersistence from '../store/durablePersistence'
import BetrayalsScreen from './BetrayalsScreen'
import { BETRAYALS_AI_POOL } from './cast'
import { saveRun } from './persistence'
import { commandToken, startRun } from './run'
import { settleRun } from './settlement'
import { resolveTable } from './table'

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

async function clickAndSave(target: HTMLElement) {
  await act(async () => {
    fireEvent.click(target)
  })
}

async function finishCinematic() {
  await clickAndSave(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: /^(Skip cinematic|Continue)$/,
    })
  )
}

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

  it('waits for the save before showing a scene that must survive an immediate reload', async () => {
    render(<BetrayalsScreen />)
    await clickAndSave(screen.getByRole('button', { name: 'Start season' }))

    let completeSave: (result: boolean) => void = () => {}
    const pendingSave = new Promise<boolean>((resolve) => {
      completeSave = resolve
    })
    const flush = vi
      .spyOn(durablePersistence, 'flushDurablePersistence')
      .mockReturnValueOnce(pendingSave)
    const openDay = screen.getByRole('button', { name: 'Play: open Day 1' })
    fireEvent.click(openDay)
    fireEvent.click(openDay)

    expect(flush).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('heading', { name: 'Your role' })).toBeVisible()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await act(async () => completeSave(true))
    expect(screen.getByRole('dialog')).toHaveAttribute('data-scene', 'sunrise')
  })

  it.each([
    ['immunity', 'Quick Tap Race', /Wait for the start signal/],
    ['safety', 'Color Match', /red, green, and blue sliders/],
  ] as const)('offers the shared Eye controls during %s', async (phase, game, rule) => {
    const run = startRun(
      { id: 'human', name: 'Georgi' },
      BETRAYALS_AI_POOL,
      { publicMode: false, realityMode: 'off' },
      { id: 'test-challenge-eye', roleSeed: 32, publicSeed: 12 }
    )
    saveRun(localStorage, 'edition-local', { ...run, phase })
    render(<BetrayalsScreen />)

    fireEvent.click(screen.getByRole('button', { name: 'Play ' + game }))
    const openEye = () =>
      fireEvent.click(screen.getByRole('button', { name: 'Open minigame menu' }))
    openEye()
    fireEvent.click(screen.getByRole('menuitem', { name: /View rules/ }))
    const rules = within(screen.getByRole('dialog', { name: game + ' rules' }))
    expect(rules.getByText(rule)).toBeVisible()
    fireEvent.click(rules.getByRole('button', { name: 'Return to game' }))

    openEye()
    fireEvent.click(screen.getByRole('menuitem', { name: /Forfeit challenge/ }))
    const confirm = () => within(screen.getByRole('dialog', { name: 'Forfeit ' + game + '?' }))
    fireEvent.click(confirm().getByRole('button', { name: 'Keep playing' }))
    openEye()
    fireEvent.click(screen.getByRole('menuitem', { name: /Forfeit challenge/ }))
    await clickAndSave(confirm().getByRole('button', { name: 'Confirm forfeit' }))

    expect(screen.queryByRole('button', { name: 'Open minigame menu' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeVisible()
  })

  it('explains the sealed finale vote and why a loyal final two win', () => {
    const base = startRun(
      { id: 'human', name: 'Georgi' },
      BETRAYALS_AI_POOL,
      { publicMode: false, realityMode: 'off' },
      { id: 'test-finale-explanation', roleSeed: 32, publicSeed: 12 }
    )
    const finalists = base.seats
      .filter(({ id }) => !base.private.betrayers.includes(id))
      .slice(0, 3)
    const banished = base.seats.find(({ id }) => base.private.betrayers.includes(id))!
    const endVote = {
      ...base,
      phase: 'end-vote' as const,
      humanId: finalists[0].id,
      pot: 700,
      seats: base.seats.map((seat) =>
        finalists.includes(seat) ? seat : { ...seat, exit: { cause: 'banished' as const, day: 1 } }
      ),
      lastTable: {
        banishedId: banished.id,
        blind: true,
        tally: { [banished.id]: 3 },
        tiedByDraw: false,
      },
    }
    saveRun(localStorage, 'edition-local', endVote)
    const app = render(<BetrayalsScreen />)
    expect(
      screen.getByText(banished.name + ' was banished. Their role stays sealed.')
    ).toBeVisible()
    expect(screen.getByText(/Ending takes a unanimous vote/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'End Season' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Banish Again' })).toBeVisible()
    app.unmount()

    saveRun(
      localStorage,
      'edition-local',
      settleRun(
        {
          ...endVote,
          seats: endVote.seats.map((seat) =>
            seat.id === finalists[2].id
              ? { ...seat, exit: { cause: 'banished' as const, day: 1 } }
              : seat
          ),
        },
        'final-two'
      )
    )
    render(<BetrayalsScreen />)
    expect(screen.getByText('The Loyals win.')).toBeVisible()
    expect(
      screen.getByText('The season ended automatically when two guests remained.')
    ).toBeVisible()
    expect(screen.getByText('Only Loyals remained, so they split the pot.')).toBeVisible()
  })

  it('opens a 25-seat season, restores it, and advances through both challenge windows', async () => {
    const app = render(<BetrayalsScreen />)
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Georgi' } })
    await clickAndSave(screen.getByRole('button', { name: 'Start season' }))

    expect(screen.getByRole('heading', { name: 'Your role' })).toBeInTheDocument()
    const cast = screen.getByRole('list', { name: 'Contestant roster' })
    expect(within(cast).getAllByRole('button')).toHaveLength(25)
    expect(within(cast).getByRole('button', { name: 'Georgi' })).toBeInTheDocument()

    app.unmount()
    render(<BetrayalsScreen />)
    expect(screen.getByRole('heading', { name: 'Your role' })).toBeInTheDocument()

    await clickAndSave(screen.getByRole('button', { name: 'Play: open Day 1' }))
    await finishCinematic()
    expect(screen.getByRole('heading', { name: 'Dawn' })).toBeInTheDocument()
    await clickAndSave(screen.getByRole('button', { name: 'Play: enter Social' }))
    await finishCinematic()
    expect(screen.getByRole('heading', { name: 'Social' })).toBeInTheDocument()
    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Season actions' })).getByRole('button', {
        name: /^Social/,
      })
    )
    const conversations = screen.getByRole('dialog', { name: 'Social' })
    expect(conversations).toBeVisible()
    fireEvent.click(within(conversations).getByRole('button', { name: 'Close social panel' }))
    expect(screen.queryByRole('dialog', { name: 'Social' })).not.toBeInTheDocument()
    await clickAndSave(screen.getByRole('button', { name: 'Play: begin Immunity Challenge' }))
    fireEvent.click(screen.getByRole('button', { name: 'Play Quick Tap Race' }))
    await clickAndSave(await screen.findByRole('button', { name: 'Finish challenge' }))
    await finishCinematic()
    expect(screen.getByRole('heading', { name: 'Safety Challenge' })).toBeInTheDocument()
    await clickAndSave(screen.getByRole('button', { name: 'See results' }))
    const results = screen.getByRole('dialog', { name: 'Safety Challenge results' })
    const [, ...standings] = within(results).getAllByRole('row')
    expect(standings).toHaveLength(24)
    expect(within(results).getAllByLabelText('Hidden').length).toBeGreaterThanOrEqual(22)
    const firstPlace = within(standings[0]).getAllByRole('cell')
    expect(firstPlace[0]).toHaveTextContent(/^1$/)
    expect(firstPlace[1]).toHaveTextContent(/\d/)
    expect(firstPlace[2]).toHaveTextContent(/^Won$/)
    await finishCinematic()
    await finishCinematic()
    const chamber = screen.getByRole('dialog', { name: 'Round Table' })
    expect(within(chamber).getByRole('log', { name: 'Round Table conversation' })).toBeVisible()
    const tv = within(screen.getByRole('region', { name: 'Faux TV' }))
    expect(tv.queryByRole('log')).not.toBeInTheDocument()
    fireEvent.click(within(chamber).getByRole('button', { name: 'Back to castle' }))
    expect(screen.queryByRole('dialog', { name: 'Round Table' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Social/ }))
    const privateTalk = within(screen.getByRole('dialog', { name: 'Social' }))
    expect(privateTalk.getByRole('button', { name: /Speak one-on-one/ })).toBeVisible()
    expect(privateTalk.getByRole('button', { name: /Plan a vote/ })).toBeVisible()
    fireEvent.click(privateTalk.getByRole('button', { name: 'Close social panel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enter Round Table' }))
    await clickAndSave(screen.getByRole('button', { name: 'Go to vote' }))
    expect(screen.queryByRole('dialog', { name: 'Round Table' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lock vote' })).toBeDisabled()
  })

  it('keeps a completed vote count visible after a private check-in', async () => {
    const start = startRun(
      { id: 'human', name: 'Georgi' },
      BETRAYALS_AI_POOL,
      { publicMode: false, realityMode: 'off' },
      { id: 'table-check-in', roleSeed: 32, publicSeed: 12 }
    )
    const table = { ...start, phase: 'round-table' as const }
    const [, target, alternate] = table.seats
    const counted = resolveTable(
      table,
      commandToken(table),
      table.seats.map(({ id }) => ({
        voterId: id,
        targetId: id === target.id ? alternate.id : target.id,
      }))
    )
    saveRun(localStorage, 'edition-local', counted)
    render(<BetrayalsScreen />)
    const feed = within(screen.getByRole('region', { name: 'Round Table vote count' }))
    fireEvent.click(feed.getByRole('button', { name: 'Show full count' }))
    expect(feed.getByRole('status')).toHaveTextContent('The count is complete.')

    fireEvent.click(screen.getByRole('button', { name: /^Social/ }))
    const social = within(screen.getByRole('dialog', { name: 'Social' }))
    const guests = within(social.getByRole('region', { name: 'Player roster' }))
    fireEvent.click(guests.getAllByRole('button')[0])
    expect(social.queryByRole('button', { name: /Plan a vote/ })).not.toBeInTheDocument()
    fireEvent.click(social.getByRole('button', { name: /Check in after the vote/ }))
    await clickAndSave(social.getByRole('button', { name: 'Execute' }))
    expect(social.getByLabelText('Energy: 4')).toBeVisible()
    fireEvent.click(social.getByRole('button', { name: 'Close social panel' }))

    expect(feed.getByRole('status')).toHaveTextContent('The count is complete.')
    expect(screen.getByRole('button', { name: 'Reveal result' })).toBeEnabled()
  })

  it('keeps the revealed contestant in their original seat after a banishment', async () => {
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
      immunityId: run.humanId,
      private: {
        ...run.private,
        betrayers: run.seats
          .filter(({ id }) => id !== run.humanId && id !== banished.id)
          .slice(0, 3)
          .map(({ id }) => id),
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
    await clickAndSave(screen.getByRole('button', { name: 'Reveal result' }))
    expect(screen.getByRole('dialog')).toHaveAttribute('data-scene', 'departure')
    await finishCinematic()
    await finishCinematic()
    await finishCinematic()
    expect(tv.getByText(banished.name + ' was banished. A Loyal.')).toBeVisible()
    const seats = cast.getAllByRole('button')
    expect(seats).toHaveLength(25)
    expect(seats[position]).toHaveAccessibleName(banished.name + ', Banished, Loyal')
    expect(screen.queryByRole('region', { name: 'Private conclave' })).not.toBeInTheDocument()
    await clickAndSave(screen.getByRole('button', { name: 'Play: follow the Night' }))
    expect(screen.getByRole('dialog')).toHaveAttribute('data-scene', 'conclave-seal')
    await finishCinematic()
    expect(screen.getByRole('dialog')).toHaveAttribute('data-scene', 'sunrise')
    await finishCinematic()
    expect(cast.getAllByRole('button', { name: /Asleep/ })).toHaveLength(24)
    expect(seats[position]).not.toHaveAttribute('data-asleep')
    await clickAndSave(screen.getByRole('button', { name: 'Open Dawn' }))
    expect(screen.getByRole('dialog')).toHaveAttribute('data-scene', 'awakening')
    await finishCinematic()
    expect(screen.getByRole('dialog')).toHaveAttribute('data-scene', 'death-letter')
    await finishCinematic()
    expect(screen.getByRole('dialog')).toHaveAttribute('data-scene', 'elimination')
    await finishCinematic()
    expect(cast.getAllByRole('button', { name: /Eliminated at Night/ })).toHaveLength(1)
    expect(cast.queryByRole('button', { name: /Asleep/ })).not.toBeInTheDocument()
  })
})

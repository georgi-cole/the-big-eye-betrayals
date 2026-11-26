import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { declarePlayerAge } from '../safety/playerSafety'
import * as durablePersistence from '../store/durablePersistence'
import BetrayalsScreen from './BetrayalsScreen'
import { BETRAYALS_AI_POOL } from './cast'
import { castleRoleFor, type CastleRolePreview } from './castleRoles'
import { openDayFlow } from './dayFlow'
import { challengeGame } from './challengeRotation'
import { challengeContestantIds, resolveChallenge } from './challenges'
import { investigationFor } from './investigationRecords'
import { getConclaveView, resolveNightCastleRole } from './night'
import { restoreRun, saveRun } from './persistence'
import { commandToken, startRun } from './run'
import { settleRun } from './settlement'
import { recordSeasonCheckpoints } from './seasonRewards'
import { applySocialMove } from './social'
import { resolveTable } from './table'
import { preparePaidNightShieldPurchase, recordBetrayalsEconomy } from './economy'

const recharge = vi.hoisted(() => ({ request: vi.fn(), dailyLimitReached: vi.fn() }))
vi.mock('../services/ads/useRewardedAd', () => ({
  useRewardedAd: () => ({ ...recharge, pending: false }),
}))

const commerce = vi.hoisted(() => ({
  ready: true,
  vip: true,
  myPulse: true,
  realityMode: true,
  dramaMode: true,
  noAds: true,
  premiumGames: false,
  paidLooks: true,
  billingAvailable: false,
  products: {},
  loading: false,
  purchasing: null,
  error: null,
  notice: null,
  vipUpgradeAvailable: false,
  purchase: vi.fn(),
  restore: vi.fn(),
  refresh: vi.fn(),
}))
vi.mock('./commerce/useBetrayalsCommerce', () => ({ useBetrayalsCommerce: () => commerce }))

vi.mock('../services/sound/SoundManager', () => ({
  SoundManager: {
    init: vi.fn(),
    unlockFromGesture: vi.fn(),
    stopAllMusic: vi.fn(),
    setMusicVolume: vi.fn(),
    setMusicMuted: vi.fn(),
    setDesiredMusic: vi.fn(),
    syncMusic: vi.fn(),
    claimExternalMusic: vi.fn(),
    setExternalMusicVolume: vi.fn(),
    releaseExternalMusic: vi.fn(),
    setCategoryEnabled: vi.fn(),
    setCategoryVolume: vi.fn(),
    play: vi.fn(),
    stop: vi.fn(),
  },
}))

vi.mock('../components/HoldTheWallComp/HoldTheWallComp', () => ({
  default: ({
    participants,
    onComplete,
  }: {
    participants: { id: string; name: string }[]
    onComplete: (result: { authoritativeRankedIds: string[] }) => void
  }) => (
    <>
      <ul aria-label="On the wall">
        {participants.map(({ id, name }) => (
          <li key={id}>{name}</li>
        ))}
      </ul>
      <button
        onClick={() => onComplete({ authoritativeRankedIds: participants.map(({ id }) => id) })}
      >
        Finish challenge
      </button>
    </>
  ),
}))

vi.mock('../minigames/quickTapRace/QuickTapRaceCanvasGame', () => ({
  default: ({ onFinish }: { onFinish: (score: number) => void }) => (
    <button onClick={() => onFinish(1000)}>Finish challenge</button>
  ),
}))

vi.mock('../components/TiltLabyrinthComp/TiltLabyrinthComp', async () => {
  const { useState } = await import('react')
  const { default: MinigameCompleteWrapper } =
    await import('../components/MinigameHost/MinigameCompleteWrapper')
  return {
    default: function TiltFixture({
      participants,
    }: {
      participants: { id: string; isHuman: boolean }[]
    }) {
      const [finished, setFinished] = useState(false)
      if (!finished) return <button onClick={() => setFinished(true)}>Finish maze</button>
      const winner = participants.find(({ isHuman }) => isHuman)!
      const rankedIds = [
        winner.id,
        ...participants.filter(({ isHuman }) => !isHuman).map(({ id }) => id),
      ]
      return (
        <MinigameCompleteWrapper
          result={{
            rawValue: 160_007,
            partial: false,
            completion: {
              authoritativeRankedIds: rankedIds,
              rawResults: Object.fromEntries(rankedIds.map((id, i) => [id, 160_007 + i * 10000])),
            },
          }}
          onContinue={vi.fn()}
          placementsNode={<p>Maze standings</p>}
        >
          <h2>Maze results</h2>
        </MinigameCompleteWrapper>
      )
    },
  }
})

async function clickAndSave(target: HTMLElement) {
  await act(async () => {
    fireEvent.click(target)
  })
}

async function finishCinematic() {
  const scene = within(screen.getByRole('dialog'))
  await clickAndSave(
    scene.queryByRole('button', { name: 'Skip cinematic' }) ??
      scene.getByRole('button', { name: 'Continue' })
  )
}

function startCastleRoleNight(role: CastleRolePreview) {
  const run = startRun(
    { id: 'human', name: 'Georgi' },
    BETRAYALS_AI_POOL,
    { publicMode: false, realityMode: 'off', castleRoles: true },
    { id: 'castle-role-preview', roleSeed: 32, publicSeed: 12, previewCastleRole: role }
  )
  const night = { ...run, phase: 'night' as const, day: 2 }
  saveRun(localStorage, 'edition-local', night)
  return night
}

describe('Betrayals season review', () => {
  it('opens the private gallery only after Nightfall and the Sealed Ballot cinematic', async () => {
    const run = { ...startCastleRoleNight('secret-betrayer'), presentation: ['nightfall' as const] }
    saveRun(localStorage, 'edition-local', run)
    const ballot = getConclaveView(run, run.humanId)
    if (!ballot?.sealed) throw new Error('Expected a private ballot')
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    render(<BetrayalsScreen />)
    expect(screen.getByRole('dialog')).toHaveAttribute('data-scene', 'nightfall')
    const castle = screen.getByRole('main', { hidden: true })
    expect(castle).toHaveAttribute('data-conclave-cover', 'true')
    expect(castle.querySelectorAll('[data-asleep]')).toHaveLength(run.seats.length)
    await finishCinematic()
    expect(screen.queryByRole('dialog', { name: 'The Conclave' })).not.toBeInTheDocument()
    const scene = screen.getByRole('dialog', { name: 'The Sealed Ballot' })
    expect(scene).toHaveAttribute('data-frame', 'latch')
    expect(scene.querySelector('.conclave-film')).toHaveAttribute('data-group', '0')
    expect(
      within(scene).queryByRole('region', { name: 'Murder shortlist' })
    ).not.toBeInTheDocument()
    await clickAndSave(within(scene).getByRole('button', { name: 'Skip cinematic' }))
    expect(screen.getByRole('dialog', { name: 'The Sealed Ballot' })).toBe(scene)
    const gallery = within(scene).getByRole('region', { name: 'Murder shortlist' })
    const names = run.seats
      .filter(({ id }) => ballot.targetIds.includes(id))
      .map(({ name }) => name)
    expect(within(gallery).getAllByRole('button')).toHaveLength(names.length)
    const vote = within(scene).getByRole('button', { name: 'Cast sealed vote' })
    expect(vote).toBeDisabled()
    const target = run.seats.find(({ id }) => id === ballot.targetIds[0])!
    fireEvent.click(within(gallery).getByRole('button', { name: target.name }))
    expect(vote).toBeEnabled()
    await clickAndSave(vote)
    const saved = restoreRun(localStorage, 'edition-local')
    if (saved.status !== 'ready') throw new Error('Expected a saved sealed ballot')
    expect(saved.run.private.pendingNight?.sealedBallot?.targetId).toBe(target.id)
    expect(scene).toHaveAttribute('data-stage', 'verdict')
    expect(within(scene).queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument()
  })

  it('keeps the private gallery available with reduced motion', () => {
    startCastleRoleNight('secret-betrayer')
    localStorage.setItem('betrayals.preferences.v1', JSON.stringify({ reducedMotion: true }))
    render(<BetrayalsScreen />)
    const scene = screen.getByRole('dialog', { name: 'The Sealed Ballot' })
    expect(scene).toHaveAttribute('data-stage', 'ballot')
    expect(within(scene).getByRole('region', { name: 'Murder shortlist' })).toBeVisible()
    expect(within(scene).queryByRole('button', { name: 'Skip cinematic' })).not.toBeInTheDocument()
  })

  it('saves the next dawn when a full day is simulated in Castle QA', async () => {
    const run = startRun(
      { id: 'human', name: 'Georgi' },
      BETRAYALS_AI_POOL,
      { publicMode: false, realityMode: 'off' },
      { id: 'qa-next-dawn', roleSeed: 32, publicSeed: 12 }
    )
    saveRun(localStorage, 'edition-local', run)
    render(<BetrayalsScreen />)
    await clickAndSave(screen.getByRole('button', { name: 'Open Castle QA' }))
    const qa = within(await screen.findByRole('dialog', { name: 'Castle QA' }))
    await clickAndSave(qa.getByRole('button', { name: 'Simulate full day' }))
    expect(await qa.findByText(/Day 2/)).toBeVisible()
    expect(qa.getByRole('status')).toHaveTextContent('Simulation saved.')
    const saved = restoreRun(localStorage, 'edition-local')
    expect(saved.status).toBe('ready')
    if (saved.status === 'ready') expect(saved.run.phase).toBe('dawn')
  })

  it('lets the Bad Witch cast the sleep spell from the start of the Round Table', async () => {
    const run = {
      ...startCastleRoleNight('bad-witch'),
      phase: 'round-table' as const,
      tableSway: undefined,
    }
    saveRun(localStorage, 'edition-local', run)
    render(<BetrayalsScreen />)
    const table = within(screen.getByRole('dialog', { name: 'Round Table' }))
    await clickAndSave(table.getByRole('button', { name: 'Cast sleep spell' }))
    const saved = restoreRun(localStorage, 'edition-local')
    expect(saved.status).toBe('ready')
    if (saved.status === 'ready') {
      expect(castleRoleFor(saved.run, run.humanId)?.used?.roleId).toBe('bad-witch')
      expect(saved.run.private.pendingTable).toBeUndefined()
    }
  })

  it('blocks a required breakfast reply until the player declines in the Inbox', async () => {
    const run = startRun(
      { id: 'human', name: 'Georgi' },
      BETRAYALS_AI_POOL,
      { publicMode: false, realityMode: 'off' },
      { id: 'inbox-breakfast', roleSeed: 32, publicSeed: 12 }
    )
    const guest = run.seats[1]
    saveRun(
      localStorage,
      'edition-local',
      openDayFlow({
        ...run,
        phase: 'dawn',
        day: 2,
        dayFlow: { day: 2, delivery: { kind: 'meeting', guestId: guest.id } },
      })
    )
    render(<BetrayalsScreen />)
    expect(screen.getByRole('button', { name: 'Reply in the Inbox to continue' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /^Inbox/ }))
    const inbox = within(screen.getByRole('dialog', { name: 'Incoming interactions' }))
    expect(inbox.getByText('Reply required')).toBeVisible()
    await clickAndSave(inbox.getByRole('button', { name: 'Pass' }))
    expect(inbox.getByText('You let the moment pass.')).toBeVisible()
    fireEvent.click(inbox.getByRole('button', { name: 'Close inbox' }))
    expect(screen.getByRole('button', { name: 'Go to Immunity Challenge' })).toBeEnabled()
  })
  beforeEach(() => {
    localStorage.clear()
    recharge.request.mockReset()
    recharge.dailyLimitReached.mockReset().mockReturnValue(false)
    Object.assign(commerce, {
      vip: true,
      myPulse: true,
      realityMode: true,
      dramaMode: true,
      noAds: true,
      paidLooks: true,
    })
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

  it.each([false, true])('gates the Drama Mode switch by ownership (%s)', async (entitled) => {
    commerce.dramaMode = entitled
    render(<BetrayalsScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    const toggle = screen.queryByRole('switch', { name: 'Drama Mode' })
    if (!entitled) {
      expect(toggle).toBeNull()
      return
    }
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(toggle!)
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }))
    await clickAndSave(screen.getByRole('button', { name: 'Start season' }))
    const saved = restoreRun(localStorage, 'edition-local')
    expect(saved).toMatchObject({ status: 'ready', run: { options: { castleRoles: true } } })
  })

  it.each([false, true])(
    'gates a private Castle Role reveal by entitlement (%s)',
    async (entitled) => {
      commerce.dramaMode = entitled
      commerce.realityMode = false
      const run = startCastleRoleNight('doctor')
      saveRun(localStorage, 'edition-local', { ...run, phase: 'social' })
      const guest = run.seats[1]
      render(<BetrayalsScreen />)
      fireEvent.click(screen.getByRole('button', { name: /^Social/ }))
      const social = within(screen.getByRole('dialog', { name: 'Social' }))
      fireEvent.click(social.getByRole('button', { name: new RegExp('^' + guest.name) }))
      const card = social.queryByRole('button', { name: /Reveal role/ })
      if (!entitled) {
        expect(card).toBeNull()
        return
      }
      expect(card).toBeVisible()
      fireEvent.click(card!)
      await clickAndSave(social.getByRole('button', { name: 'Tell guest' }))
      expect(social.getByText(`You told ${guest.name} your Castle Role is Doctor.`)).toBeVisible()
    }
  )

  it('saves and resumes the same season, then starts at Day 1 after abandonment', async () => {
    const run = startRun(
      { id: 'human', name: 'Georgi' },
      BETRAYALS_AI_POOL,
      { publicMode: false, realityMode: 'off' },
      { id: 'season-to-resume', roleSeed: 32, publicSeed: 12 }
    )
    const saved = { ...run, day: 2, phase: 'social' as const }
    saveRun(localStorage, 'edition-local', saved)
    saveRun(localStorage, 'profile-other', { ...run, id: 'other-season' })
    const visit = render(<BetrayalsScreen />)

    expect(screen.getByText('Season 1')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Home' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Leave the castle?' }))
    expect(dialog.getByRole('button', { name: 'Save for later' })).toHaveFocus()
    fireEvent.click(dialog.getByRole('button', { name: 'Stay in the castle' }))
    expect(screen.queryByRole('dialog', { name: 'Leave the castle?' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Home' }))
    await clickAndSave(screen.getByRole('button', { name: 'Save for later' }))
    expect(restoreRun(localStorage, 'edition-local')).toMatchObject({
      status: 'ready',
      run: { id: saved.id, day: 2 },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Continue season' }))
    expect(screen.getByText('Season 1')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Home' }))
    await clickAndSave(screen.getByRole('button', { name: 'Abandon the castle' }))
    expect(screen.getByRole('button', { name: 'Start season' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Continue season' })).toBeNull()
    expect(restoreRun(localStorage, 'profile-other')).toMatchObject({
      status: 'ready',
      run: { id: 'other-season' },
    })

    visit.unmount()
    render(<BetrayalsScreen />)
    await clickAndSave(screen.getByRole('button', { name: 'Start season' }))
    expect(screen.getByText('Season 2')).toBeVisible()
    const restarted = restoreRun(localStorage, 'edition-local')
    expect(restarted).toMatchObject({
      status: 'ready',
      run: { seasonNumber: 2, day: 1, phase: 'role-reveal' },
    })
    expect(restarted.status === 'ready' && restarted.run.id).not.toBe(saved.id)
  })

  it('keeps the active season open if abandoning cannot be saved', async () => {
    const run = startRun(
      { id: 'human', name: 'Georgi' },
      BETRAYALS_AI_POOL,
      { publicMode: false, realityMode: 'off' },
      { id: 'retry-abandon', roleSeed: 32, publicSeed: 12 }
    )
    saveRun(localStorage, 'edition-local', run)
    render(<BetrayalsScreen />)
    vi.spyOn(durablePersistence, 'setDurableItem').mockReturnValueOnce(false)

    fireEvent.click(screen.getByRole('button', { name: 'Home' }))
    await clickAndSave(screen.getByRole('button', { name: 'Abandon the castle' }))
    expect(screen.getByRole('alert')).toHaveTextContent('could not end this season')
    expect(restoreRun(localStorage, 'edition-local')).toMatchObject({
      status: 'ready',
      run: { id: run.id },
    })
    await clickAndSave(screen.getByRole('button', { name: 'Abandon the castle' }))
    expect(screen.getByRole('button', { name: 'Start season' })).toBeVisible()
  })

  it.each(['rewind', 'set up privacy and rewind', 'leave'] as const)(
    'opens the dawn decision and lets the player %s',
    async (choice) => {
      const run = startRun(
        { id: 'human', name: 'Georgi' },
        BETRAYALS_AI_POOL,
        { publicMode: false, realityMode: 'off' },
        { id: 'rewind-decision', roleSeed: 32, publicSeed: 12 }
      )
      const morning = recordSeasonCheckpoints(null, {
        ...run,
        day: 3,
        seasonNumber: 2,
        phase: 'dawn',
      })
      saveRun(localStorage, 'edition-local', {
        ...morning,
        phase: 'night-resolved',
        private: {
          ...run.private,
          pendingNight: { targetId: run.humanId, blocked: false, filmPlayed: true },
        },
      })
      render(<BetrayalsScreen />)
      const dialog = within(screen.getByRole('dialog', { name: 'A second chance' }))
      expect(dialog.getByRole('button', { name: 'Rewind to dawn' }).parentElement).toHaveClass(
        'betrayals-leave__actions--stacked'
      )
      if (choice !== 'leave') {
        if (choice === 'set up privacy and rewind') {
          await clickAndSave(dialog.getByRole('button', { name: 'Rewind to dawn' }))
          const setup = within(screen.getByRole('dialog', { name: 'Advertising privacy' }))
          expect(recharge.request).not.toHaveBeenCalled()
          fireEvent.change(setup.getByLabelText('Your age'), { target: { value: '28' } })
          fireEvent.click(setup.getByRole('button', { name: 'Save age' }))
          expect(setup.queryByLabelText('Your age')).not.toBeInTheDocument()
          fireEvent.click(setup.getByRole('button', { name: 'Back to rewind' }))
          expect(screen.getByRole('dialog', { name: 'A second chance' })).toBeVisible()
        } else {
          declarePlayerAge(28)
        }
        recharge.request.mockResolvedValueOnce(true)
        await clickAndSave(dialog.getByRole('button', { name: 'Rewind to dawn' }))
        expect(recharge.request).toHaveBeenCalledWith('betrayals_rewind')
        expect(screen.queryByRole('dialog', { name: 'A second chance' })).toBeNull()
        expect(restoreRun(localStorage, 'edition-local')).toMatchObject({
          status: 'ready',
          run: { id: run.id, day: 3, phase: 'dawn', seasonNumber: 2 },
        })
      } else {
        await clickAndSave(dialog.getByRole('button', { name: 'Leave the castle' }))
        expect(recharge.request).not.toHaveBeenCalled()
        expect(screen.getByRole('button', { name: 'Start season' })).toBeVisible()
        expect(restoreRun(localStorage, 'edition-local')).toEqual({
          status: 'empty',
          lastSeasonNumber: 2,
        })
      }
    }
  )

  it('starts a Castle Roles preview with the requested human role', async () => {
    render(<BetrayalsScreen />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Castle Roles playtest' }), {
      target: { value: 'doctor' },
    })
    await clickAndSave(screen.getByRole('button', { name: 'Start season' }))
    const broadcast = within(screen.getByRole('region', { name: 'Faux TV' }))
    expect(broadcast.getByText('You are a Loyal.')).toBeVisible()
    expect(broadcast.getByText('Doctor · Ready')).toBeVisible()
  })

  it('uses Extrasense through the roster, retains its private result, and offers it next night', async () => {
    const run = startCastleRoleNight('extrasense')
    const target = run.seats[1]
    const hasRole = Boolean(castleRoleFor(run, target.id))
    const firstView = render(<BetrayalsScreen />)
    const broadcast = within(screen.getByRole('region', { name: 'Faux TV' }))
    const roster = within(screen.getByRole('list', { name: 'Contestant roster' }))
    expect(broadcast.queryByRole('button')).toBeNull()
    expect(screen.getByRole('button', { name: 'Skip Extrasense and advance' })).toBeEnabled()
    expect(roster.getByRole('button', { name: /^Georgi/ })).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(roster.getByRole('button', { name: new RegExp(`^${target.name}`) }))
    await clickAndSave(screen.getByRole('button', { name: 'Check for a Castle Role' }))
    const result = hasRole ? 'held a Castle Role' : 'held no Castle Role'
    expect(broadcast.getByText(`Night 2. ${target.name} ${result}.`)).toBeVisible()
    firstView.unmount()
    const sameNight = render(<BetrayalsScreen />)
    expect(screen.queryByRole('button', { name: 'Skip Extrasense and advance' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'View your Castle Role' }))
    const card = within(screen.getByRole('dialog', { name: 'Your Castle Role' }))
    expect(card.getByText('Extrasense · Used tonight')).toBeVisible()
    expect(card.getByText(`Night 2. ${target.name} ${result}.`)).toBeVisible()
    sameNight.unmount()

    const saved = restoreRun(localStorage, 'edition-local')
    if (saved.status !== 'ready') throw new Error('Expected the saved Night 2 result')
    saveRun(localStorage, 'edition-local', { ...saved.run, day: 3 })
    render(<BetrayalsScreen />)
    expect(screen.getByRole('button', { name: 'Skip Extrasense and advance' })).toBeEnabled()
  })

  it('arms the Good Witch spell on the TV and casts it with Play', async () => {
    startCastleRoleNight('good-witch')
    render(<BetrayalsScreen />)
    const tv = within(screen.getByRole('region', { name: 'Faux TV' }))
    expect(tv.getByText('Good Witch')).toBeVisible()
    const dock = within(screen.getByRole('navigation', { name: 'Season actions' }))
    expect(dock.queryByRole('button', { name: 'Arm the spell' })).toBeNull()
    const arm = tv.getByRole('button', { name: 'Arm the spell', pressed: false })
    fireEvent.click(arm)
    expect(arm).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(arm)
    expect(dock.getByRole('button', { name: 'Skip power and advance' })).toBeEnabled()
    fireEvent.click(arm)
    await clickAndSave(dock.getByRole('button', { name: 'Cast sleep spell' }))
    expect(tv.getByText('Night 2. You stopped the Conclave.')).toBeVisible()
    expect(screen.queryByRole('dialog', { name: 'The Conclave' })).toBeNull()
    expect(dock.getByRole('button', { name: 'Open Dawn' })).toBeEnabled()
  })

  it('uses Play to skip the Illusionist while keeping the decoy available', async () => {
    const run = startCastleRoleNight('illusionist')
    render(<BetrayalsScreen />)
    const tv = within(screen.getByRole('region', { name: 'Faux TV' }))
    expect(tv.getByText('Illusionist')).toBeVisible()
    const dock = within(screen.getByRole('navigation', { name: 'Season actions' }))
    expect(dock.queryByRole('button', { name: 'Ready the decoy' })).toBeNull()
    const decoy = tv.getByRole('button', { name: 'Ready the decoy' })
    fireEvent.click(decoy)
    expect(dock.getByRole('button', { name: 'Redirect the letter' })).toBeEnabled()
    fireEvent.click(decoy)
    await clickAndSave(dock.getByRole('button', { name: 'Skip power and advance' }))
    const saved = restoreRun(localStorage, 'edition-local')
    if (saved.status !== 'ready') throw new Error('Expected the saved Night result')
    expect(castleRoleFor(saved.run, run.humanId)).toMatchObject({ status: 'ready', passedDay: 2 })
  })

  it('lets Columbus select exactly five portraits and shows the private result', async () => {
    const run = startCastleRoleNight('columbus')
    render(<BetrayalsScreen />)
    const tv = within(screen.getByRole('region', { name: 'Faux TV' }))
    const cast = within(screen.getByRole('region', { name: 'Cast seats' }))
    const group = run.seats.slice(1, 6)
    const first = cast.getByRole('button', { name: new RegExp(`^${group[0].name}`) })
    fireEvent.click(first)
    expect(cast.getByText(group[0].name).closest('button')).toBe(first)
    expect(screen.getByRole('button', { name: 'Check the Columbus group' })).toBeDisabled()
    fireEvent.click(first)
    expect(screen.getByRole('button', { name: 'Skip Columbus and advance' })).toBeEnabled()
    for (const guest of group)
      fireEvent.click(cast.getByRole('button', { name: new RegExp(`^${guest.name}`) }))
    expect(tv.getByText(/5\/5 selected/)).toBeVisible()
    await clickAndSave(screen.getByRole('button', { name: 'Check the Columbus group' }))
    expect(tv.getByText(/Betrayer.*in your group/)).toBeVisible()
    const saved = restoreRun(localStorage, 'edition-local')
    if (saved.status !== 'ready') throw new Error('Expected a saved Columbus reading')
    expect(castleRoleFor(saved.run, run.humanId)?.used).toMatchObject({
      roleId: 'columbus',
      guestIds: group.map(({ id }) => id),
    })
  })

  it('shows Clairvoyant winners in hidden results and offers no Night activation', async () => {
    const run = { ...startCastleRoleNight('clairvoyant'), phase: 'safety' as const }
    const awarded = resolveChallenge(
      run,
      commandToken(run),
      challengeContestantIds(run).map((contestantId, index) => ({
        contestantId,
        score: index,
        potContribution: 0,
      }))
    )
    saveRun(localStorage, 'edition-local', {
      ...awarded,
      presentation: ['safety-results'],
    })
    const first = render(<BetrayalsScreen />)
    const results = within(screen.getByRole('dialog', { name: 'Safety Challenge results' }))
    const winner = run.seats.at(-1)!
    expect(results.getByRole('rowheader', { name: winner.name })).toBeVisible()
    expect(results.getByText(/privately reveals the shield winners/)).toBeVisible()
    first.unmount()
    saveRun(localStorage, 'edition-local', { ...awarded, phase: 'night' })
    render(<BetrayalsScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'View your Castle Role' }))
    expect(screen.getByText(/Keep your power secret/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Close Castle Role' }))
    expect(screen.queryByRole('button', { name: 'Ready the reading' })).toBeNull()
  })

  it.each(['uses', 'skips'] as const)(
    '%s the Mayor power with Play at the Table',
    async (choice) => {
      const run = startRun(
        { id: 'human', name: 'Georgi' },
        BETRAYALS_AI_POOL,
        { publicMode: false, realityMode: 'off', castleRoles: true },
        { id: 'castle-role-mayor', roleSeed: 32, publicSeed: 12, previewCastleRole: 'mayor' }
      )
      saveRun(localStorage, 'edition-local', { ...run, phase: 'round-table', tableSway: null })
      render(<BetrayalsScreen />)
      const broadcast = within(screen.getByRole('region', { name: 'Faux TV' }))
      expect(broadcast.getByText(/Select a guest for a double vote/)).toBeVisible()
      expect(broadcast.queryByRole('button')).toBeNull()
      const target = run.seats[1]
      const portrait = screen.getByRole('button', { name: new RegExp(`^${target.name}`) })
      fireEvent.click(portrait)
      const doubleVote = screen.getByRole('button', { name: 'Lock double vote' })
      if (choice === 'uses') {
        await clickAndSave(doubleVote)
      } else {
        fireEvent.click(portrait)
        await clickAndSave(
          screen.getByRole('button', { name: 'Skip Mayor power and open regular ballot' })
        )
        expect(screen.getByRole('button', { name: 'Lock vote' })).toBeDisabled()
        fireEvent.click(portrait)
        await clickAndSave(screen.getByRole('button', { name: 'Lock vote' }))
      }
      const saved = restoreRun(localStorage, 'edition-local')
      if (saved.status !== 'ready') throw new Error('Expected a saved first ballot')
      const ballot = saved.run.tableCount?.ballots.find(({ voterId }) => voterId === run.humanId)
      expect(ballot).toMatchObject({ targetId: target.id })
      expect(ballot?.weight ?? 1).toBe(choice === 'uses' ? 2 : 1)
    }
  )

  it('directs the Politician’s vote from the faux TV and the roster', async () => {
    const run = {
      ...startCastleRoleNight('politician'),
      phase: 'round-table' as const,
      tableSway: null,
    }
    saveRun(localStorage, 'edition-local', run)
    render(<BetrayalsScreen />)
    const tv = within(screen.getByRole('region', { name: 'Faux TV' }))
    const dock = within(screen.getByRole('navigation', { name: 'Season actions' }))
    const [voter, target] = run.seats.slice(1)
    fireEvent.click(tv.getByRole('button', { name: 'Direct a vote' }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${voter.name}`) }))
    fireEvent.click(dock.getByRole('button', { name: 'Choose the voter' }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${target.name}`) }))
    await clickAndSave(dock.getByRole('button', { name: 'Confirm voting instruction' }))
    const saved = restoreRun(localStorage, 'edition-local')
    if (saved.status !== 'ready') throw new Error('Expected a saved voting instruction')
    expect(castleRoleFor(saved.run, run.humanId)?.used).toMatchObject({
      roleId: 'politician',
      voterId: voter.id,
      targetId: target.id,
    })
  })

  it.each(['pass', 'protect'] as const)(
    'uses Play to %s at Night as the Doctor',
    async (choice) => {
      const run = startCastleRoleNight('doctor')
      render(<BetrayalsScreen />)
      const broadcast = within(screen.getByRole('region', { name: 'Faux TV' }))
      expect(broadcast.queryByRole('button')).toBeNull()
      const target = run.seats[1]
      if (choice === 'protect') {
        const portrait = screen.getByRole('button', { name: new RegExp('^' + target.name) })
        fireEvent.click(portrait)
        expect(screen.getByRole('button', { name: 'Confirm protection and advance' })).toBeEnabled()
        fireEvent.click(portrait)
        expect(screen.getByRole('button', { name: 'Skip protection and advance' })).toBeEnabled()
        fireEvent.click(portrait)
      }
      await clickAndSave(
        screen.getByRole('button', {
          name:
            choice === 'protect' ? 'Confirm protection and advance' : 'Skip protection and advance',
        })
      )
      const saved = restoreRun(localStorage, 'edition-local')
      expect(saved).toMatchObject({ status: 'ready', run: { phase: 'night-resolved' } })
      if (saved.status !== 'ready') throw new Error('Expected the Night result')
      const role = castleRoleFor(saved.run, run.humanId)
      if (choice === 'protect')
        expect(role?.used).toMatchObject({ targetId: target.id, day: run.day })
      else expect(role?.passedDay).toBe(run.day)
    }
  )

  it('puts a private invitation ahead of the spent Doctor card', () => {
    const run = startCastleRoleNight('doctor')
    const warded = resolveNightCastleRole(run, commandToken(run), run.humanId)
    expect(castleRoleFor(warded, run.humanId)?.used?.roleId).toBe('doctor')
    const departed = warded.private.betrayers.slice(1)
    saveRun(localStorage, 'edition-local', {
      ...warded,
      seats: warded.seats.map((seat) =>
        departed.includes(seat.id) ? { ...seat, exit: { cause: 'banished', day: 1 } } : seat
      ),
      private: { ...warded.private, humanRecruitmentOffered: true },
    })

    render(<BetrayalsScreen />)
    const tv = within(screen.getByRole('region', { name: 'Faux TV' }))
    expect(tv.getByText('A sealed invitation')).toBeVisible()
    expect(tv.getByText(/If you decline, you leave the castle/)).toBeVisible()
    expect(tv.queryByText(/You warded/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Decline and leave' })).toBeEnabled()
  })

  it('opens the paired Home Hub destinations from a profile', () => {
    const openDressingRoom = vi.fn()
    const openProfile = vi.fn()
    sessionStorage.setItem('betrayals.observatoryOpening.v1', 'true')
    render(
      <BetrayalsScreen
        profiles={{
          player: { id: 'intro-profile', name: 'Georgi', portrait: '/georgi.webp' },
          openProfile,
          openAccount: vi.fn(),
          openDressingRoom,
        }}
      />
    )

    expect(screen.getByRole('button', { name: 'Start season' })).toBeVisible()
    const profileCompass = screen.getByRole('button', { name: 'Profile' })
    expect(profileCompass).toHaveClass('betrayals-home__compass')
    fireEvent.click(profileCompass)
    expect(openProfile).toHaveBeenCalledOnce()
    const shortcuts = within(screen.getByRole('navigation', { name: 'Game controls' }))
    expect(shortcuts.queryByRole('button', { name: 'Profile' })).toBeNull()
    expect(shortcuts.getAllByRole('button')).toHaveLength(5)
    expect(screen.getByRole('link', { name: 'Report a bug' })).toHaveAttribute(
      'href',
      expect.stringContaining('mailto:kolequant@gmail.com')
    )
    expect(screen.getByRole('button', { name: 'Players' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Share The Big Eye' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Achievements' }))
    const achievements = within(screen.getByRole('dialog', { name: 'Achievements' }))
    expect(achievements.getByRole('heading', { name: 'Hall of Fame' })).toBeVisible()
    expect(achievements.getByText('Enter the castle').parentElement).toHaveTextContent('Locked')
    fireEvent.click(achievements.getByRole('button', { name: 'Eyeros rewards' }))
    expect(achievements.getByText('Win the season').parentElement).toHaveTextContent(
      '10,000 Eyeros'
    )
    fireEvent.click(achievements.getByRole('button', { name: 'Close achievements' }))

    fireEvent.click(screen.getByRole('button', { name: 'Rules' }))
    const rules = within(screen.getByRole('dialog', { name: 'Rules' }))
    expect(rules.getByRole('heading', { name: 'The Castle Handbook' })).toBeVisible()
    const bookmarks = within(rules.getByRole('navigation', { name: 'Handbook chapters' }))
    expect(bookmarks.getByRole('button', { name: 'Loyals', pressed: true })).toBeVisible()
    expect(rules.getByRole('article', { name: 'The Loyal' })).toHaveTextContent(
      'Survive until every Betrayer is out'
    )
    fireEvent.click(bookmarks.getByRole('button', { name: 'Betrayers' }))
    const betrayer = rules.getByRole('article', { name: 'The Betrayer' })
    expect(betrayer).toHaveTextContent('The season starts with at least 3 Betrayers')
    expect(betrayer).toHaveTextContent('meet in the secret Conclave')
    expect(betrayer).toHaveTextContent('recruit an eligible Loyal')
    expect(betrayer).not.toHaveTextContent(/\b4\b|\bfour\b/i)
    fireEvent.click(bookmarks.getByRole('button', { name: 'The Season' }))
    expect(rules.getByRole('article', { name: 'A Day in the Castle' })).toHaveTextContent(
      'Safety Challenge'
    )
    fireEvent.click(bookmarks.getByRole('button', { name: 'Castle Notes' }))
    expect(rules.getByRole('article', { name: 'Notes for Your Stay' })).toHaveTextContent(
      'Public Shield'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Close rules' }))

    fireEvent.click(screen.getByRole('button', { name: 'Store' }))
    const store = within(screen.getByRole('dialog', { name: 'Store' }))
    expect(store.getByRole('button', { name: 'View VIP benefits' })).toBeVisible()
    expect(store.getByRole('button', { name: 'Feature unlocks' })).toBeVisible()
    fireEvent.click(store.getByRole('button', { name: /The changing room/ }))
    expect(openDressingRoom).toHaveBeenCalledWith()
  })

  it('opens the profile Wallet through the Store with real activity and a profile destination', () => {
    const openProfile = vi.fn()
    const openWalletProfile = vi.fn()
    sessionStorage.setItem('betrayals.observatoryOpening.v1', 'true')
    render(
      <BetrayalsScreen
        profiles={{
          player: { id: 'wallet-profile', name: 'Georgi', portrait: '/georgi.webp' },
          wallet: {
            balance: 4250,
            transactions: [
              {
                id: 'social-reward',
                amount: 50,
                label: 'Social action',
                source: 'season_reward',
                createdAt: '2026-11-23T12:00:00Z',
              },
            ],
            claimRewards: vi.fn().mockResolvedValue(true),
            spend: vi.fn().mockResolvedValue('paid'),
          },
          openProfile,
          openWalletProfile,
          openAccount: vi.fn(),
          openDressingRoom: vi.fn(),
        }}
      />
    )

    expect(screen.queryByRole('button', { name: /Open wallet/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Store' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open wallet, 4,250 Eyeros' }))
    const wallet = within(screen.getByRole('dialog', { name: 'Wallet' }))
    expect(wallet.getByLabelText('4,250 Eyeros available')).toBeVisible()
    expect(wallet.getByRole('heading', { name: 'Recent activity' })).toBeVisible()
    expect(wallet.getByText('Social action')).toBeVisible()
    expect(wallet.queryByRole('region', { name: 'Store overview' })).toBeNull()
    fireEvent.click(wallet.getByRole('button', { name: 'Open profile: Georgi' }))
    expect(openWalletProfile).toHaveBeenCalledOnce()
    expect(openProfile).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Store' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open wallet, 4,250 Eyeros' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back to store' }))
    const store = within(screen.getByRole('dialog', { name: 'Store' }))
    expect(store.getByRole('button', { name: 'View VIP benefits' })).toBeVisible()
  })

  it('uses the Wallet return destination when no profile is selected', () => {
    const openProfile = vi.fn()
    const openWalletProfile = vi.fn()
    sessionStorage.setItem('betrayals.observatoryOpening.v1', 'true')
    render(
      <BetrayalsScreen
        profiles={{
          openProfile,
          openWalletProfile,
          openAccount: vi.fn(),
          openDressingRoom: vi.fn(),
        }}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Store' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open wallet, 0 Eyeros' }))
    const wallet = within(screen.getByRole('dialog', { name: 'Wallet' }))
    fireEvent.click(wallet.getByRole('button', { name: 'Choose a profile' }))
    expect(openWalletProfile).toHaveBeenCalledOnce()
    expect(openProfile).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('saves six Social Energy only after a completed ad', async () => {
    const run = startRun(
      { id: 'human', name: 'Georgi' },
      BETRAYALS_AI_POOL,
      { publicMode: false, realityMode: 'off' },
      { id: 'rewarded-energy', roleSeed: 28, publicSeed: 823 }
    )
    const wallet = { day: 1, energy: 0, energySpent: 5, influence: 12, info: 50 }
    saveRun(localStorage, 'edition-local', {
      ...run,
      phase: 'social',
      socialWallets: { ...run.socialWallets, [run.humanId]: wallet },
    })
    recharge.request.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    render(<BetrayalsScreen />)
    fireEvent.click(screen.getByRole('button', { name: /^Social/ }))
    const social = within(screen.getByRole('dialog', { name: 'Social' }))
    const watch = social.getByRole('button', { name: 'Watch ad for +6 Energy' })
    await clickAndSave(watch)
    expect(social.getByLabelText('Energy: 0')).toBeVisible()
    await clickAndSave(watch)
    expect(recharge.request).toHaveBeenLastCalledWith('betrayals_social_energy_recharge')
    expect(social.getByLabelText('Energy: 6')).toBeVisible()
    expect(social.queryByRole('button', { name: 'Watch ad for +6 Energy' })).toBeNull()
    const saved = restoreRun(localStorage, 'edition-local')
    expect(saved.status === 'ready' && saved.run.socialWallets?.human).toEqual({
      ...wallet,
      energy: 6,
    })
  })

  it('routes locked Pulse and full profiles to their store unlocks while keeping basic conversation free', async () => {
    Object.assign(commerce, {
      vip: false,
      myPulse: false,
      realityMode: false,
      noAds: false,
      paidLooks: false,
    })
    const run = startRun(
      { id: 'human', name: 'Georgi' },
      BETRAYALS_AI_POOL,
      { publicMode: false, realityMode: 'off' },
      { id: 'free-access', roleSeed: 28, publicSeed: 823 }
    )
    saveRun(localStorage, 'edition-local', { ...run, phase: 'social' })
    render(<BetrayalsScreen />)
    expect(screen.queryByRole('button', { name: /Open Wallet,/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Open Store' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Open My Pulse' }))
    expect(screen.queryByRole('dialog', { name: 'My Pulse' })).toBeNull()
    const store = within(screen.getByRole('dialog', { name: 'Store' }))
    expect(store.getByRole('heading', { name: 'My Pulse' })).toBeVisible()
    fireEvent.click(store.getByRole('button', { name: 'Close store' }))
    fireEvent.click(screen.getByRole('button', { name: /^Social/ }))
    const social = within(screen.getByRole('dialog', { name: 'Social' }))
    const guest = run.seats[1]
    fireEvent.click(
      within(social.getByRole('region', { name: 'Player roster' })).getByRole('button', {
        name: new RegExp(guest.name),
      })
    )
    const guestProfile = social.getByText('Profile traits', { exact: true }).closest('details')
    expect(guestProfile).not.toHaveAttribute('open')
    fireEvent.click(social.getByRole('button', { name: /Build trust/ }))
    await clickAndSave(social.getByRole('button', { name: 'Execute' }))
    const saved = restoreRun(localStorage, 'edition-local')
    expect(saved.status === 'ready' && saved.run.social?.at(-1)?.kind).toBe('rapport')
    fireEvent.click(social.getByText('Profile traits', { exact: true }))
    const profile = within(social.getByRole('region', { name: `${guest.name} profile traits` }))
    expect(profile.queryByText('Openness')).toBeNull()
    expect(profile.getAllByRole('img', { name: /locked for Reality Mode or VIP/ })).toHaveLength(5)
    expect(profile.queryByRole('meter')).toBeNull()
    expect(profile.getByRole('button', { name: 'Unlock with Reality Mode or VIP' })).toBeVisible()
    expect(social.getByRole('region', { name: 'Social actions' })).toBeVisible()
    expect(social.getByRole('button', { name: /Build trust/ })).toBeVisible()
    fireEvent.click(profile.getByRole('button', { name: 'Unlock with Reality Mode or VIP' }))
    expect(screen.getByRole('dialog', { name: 'Store' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Reality Mode' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Close store' }))

    fireEvent.click(screen.getByRole('button', { name: 'Open Store' }))
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Store' })).getByRole('button', {
        name: /Open wallet, 0 Eyeros/i,
      })
    )
    const wallet = within(screen.getByRole('dialog', { name: 'Wallet' }))
    expect(wallet.getByRole('button', { name: 'Top up Eyeros' })).toBeVisible()
    expect(wallet.queryByRole('heading', { name: 'Reality Mode' })).toBeNull()
    fireEvent.click(wallet.getByRole('button', { name: 'Close wallet' }))

    fireEvent.click(screen.getByRole('button', { name: 'Home' }))
    await clickAndSave(screen.getByRole('button', { name: 'Save for later' }))
    expect(screen.getByRole('button', { name: 'Continue season' })).toBeVisible()
    expect(screen.getByRole('main')).not.toHaveTextContent(/Day\s+1\s*·\s*Social/)
    fireEvent.click(screen.getByRole('button', { name: 'Store' }))
    expect(screen.getByRole('button', { name: 'Explore VIP' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'My Pulse' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Close store' }))

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    fireEvent.click(screen.getByRole('button', { name: /Unlock Reality Mode/ }))
    expect(screen.getByRole('heading', { name: 'Reality Mode' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Explore VIP' })).toBeNull()
  })

  it('recovers a pending shield by saving one wallet debit before granting protection', async () => {
    const original = startRun(
      { id: 'human', name: 'Georgi' },
      BETRAYALS_AI_POOL,
      { publicMode: false, realityMode: 'off' },
      { id: 'recover-shield', roleSeed: 28, publicSeed: 823 }
    )
    const night = {
      ...original,
      phase: 'night' as const,
      private: {
        ...original.private,
        betrayers: original.seats.slice(1, 4).map(({ id }) => id),
        nightShieldIds: [],
      },
    }
    const pending = preparePaidNightShieldPurchase(night, commandToken(night), 4_000)
    expect(pending.economy?.paidNightShields[0].status).toBe('pending')
    saveRun(localStorage, 'profile-shield-profile', pending)
    let finishDebit!: (result: 'paid') => void
    const spend = vi.fn(
      () =>
        new Promise<'paid'>((resolve) => {
          finishDebit = resolve
        })
    )
    render(
      <BetrayalsScreen
        profiles={{
          player: { id: 'shield-profile', name: 'Georgi', portrait: '/georgi.webp' },
          wallet: { balance: 4_000, claimRewards: vi.fn().mockResolvedValue(true), spend },
          openProfile: vi.fn(),
          openAccount: vi.fn(),
          openDressingRoom: vi.fn(),
        }}
      />
    )
    await waitFor(() => expect(spend).toHaveBeenCalledTimes(1))
    const beforeDebit = restoreRun(localStorage, 'profile-shield-profile')
    expect(
      beforeDebit.status === 'ready' && beforeDebit.run.economy?.paidNightShields[0].status
    ).toBe('pending')
    await act(async () => {
      finishDebit('paid')
    })
    await waitFor(() => {
      const after = restoreRun(localStorage, 'profile-shield-profile')
      expect(after.status === 'ready' && after.run.economy?.paidNightShields[0].status).toBe(
        'active'
      )
    })
    expect(spend).toHaveBeenCalledWith(
      'betrayals:recover-shield:night-shield:1',
      3_000,
      'Night Shield'
    )
    expect(spend).toHaveBeenCalledTimes(1)
    expect(screen.getByTitle('Purchased Night Shield')).toBeVisible()
  })

  it('does not let an old shield callback overwrite a profile after leaving the screen', async () => {
    const original = startRun(
      { id: 'human', name: 'Georgi' },
      BETRAYALS_AI_POOL,
      { publicMode: false, realityMode: 'off' },
      { id: 'leave-shield', roleSeed: 28, publicSeed: 823 }
    )
    const night = {
      ...original,
      phase: 'night' as const,
      private: {
        ...original.private,
        betrayers: original.seats.slice(1, 4).map(({ id }) => id),
        nightShieldIds: [],
      },
    }
    const pending = preparePaidNightShieldPurchase(night, commandToken(night), 4_000)
    saveRun(localStorage, 'profile-leaving-profile', pending)
    let finishDebit!: (result: 'paid') => void
    const spend = vi.fn(
      () =>
        new Promise<'paid'>((resolve) => {
          finishDebit = resolve
        })
    )
    const app = render(
      <BetrayalsScreen
        profiles={{
          player: { id: 'leaving-profile', name: 'Georgi', portrait: '/georgi.webp' },
          wallet: { balance: 4_000, claimRewards: vi.fn().mockResolvedValue(true), spend },
          openProfile: vi.fn(),
          openAccount: vi.fn(),
          openDressingRoom: vi.fn(),
        }}
      />
    )
    await waitFor(() => expect(spend).toHaveBeenCalledTimes(1))
    app.unmount()
    const newer = { ...pending, revision: pending.revision + 10, day: 2, phase: 'dawn' as const }
    saveRun(localStorage, 'profile-leaving-profile', newer)
    await act(async () => {
      finishDebit('paid')
    })
    const saved = restoreRun(localStorage, 'profile-leaving-profile')
    expect(saved.status === 'ready' && saved.run.revision).toBe(newer.revision)
    expect(saved.status === 'ready' && saved.run.day).toBe(2)
  })

  it('drains new reward receipts that arrive while an earlier wallet save is pending', async () => {
    const original = startRun(
      { id: 'human', name: 'Georgi' },
      BETRAYALS_AI_POOL,
      { publicMode: false, realityMode: 'off' },
      { id: 'reward-queue', roleSeed: 28, publicSeed: 823 }
    )
    const socialRun = { ...original, phase: 'social' as const }
    const first = recordBetrayalsEconomy(
      socialRun,
      applySocialMove(socialRun, commandToken(socialRun), {
        actorId: socialRun.humanId,
        recipientId: socialRun.seats[1].id,
        kind: 'rapport',
      })
    )
    saveRun(localStorage, 'profile-reward-profile', first)
    let finishClaim!: (result: boolean) => void
    const claimRewards = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            finishClaim = resolve
          })
      )
      .mockResolvedValue(true)
    render(
      <BetrayalsScreen
        profiles={{
          player: { id: 'reward-profile', name: 'Georgi', portrait: '/georgi.webp' },
          wallet: { balance: 0, claimRewards, spend: vi.fn().mockResolvedValue('insufficient') },
          openProfile: vi.fn(),
          openAccount: vi.fn(),
          openDressingRoom: vi.fn(),
        }}
      />
    )
    await waitFor(() => expect(claimRewards).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: /^Social/ }))
    const social = within(screen.getByRole('dialog', { name: 'Social' }))
    fireEvent.click(
      within(social.getByRole('region', { name: 'Player roster' })).getByRole('button', {
        name: new RegExp(first.seats[2].name),
      })
    )
    fireEvent.click(social.getByRole('button', { name: /Build trust/ }))
    await clickAndSave(social.getByRole('button', { name: 'Execute' }))
    expect(claimRewards).toHaveBeenCalledTimes(1)
    await act(async () => {
      finishClaim(true)
    })
    await waitFor(() => expect(claimRewards).toHaveBeenCalledTimes(2))
    expect(claimRewards.mock.calls[1][0]).toHaveLength(2)
  })

  it('keeps traits in the profile and investigates from the Social action grid', async () => {
    const run = startRun(
      { id: 'human', name: 'Georgi' },
      BETRAYALS_AI_POOL,
      { publicMode: false, realityMode: 'off' },
      { id: 'pulse-profile', roleSeed: 28, publicSeed: 823 }
    )
    const [, guest, otherGuest] = run.seats
    saveRun(localStorage, 'edition-local', {
      ...run,
      phase: 'social',
      investigation: {
        ...investigationFor(run),
        notes: {
          [guest.id]: { leaning: 'suspect', text: 'Check their version tomorrow.' },
        },
      },
    })
    const app = render(<BetrayalsScreen />)
    fireEvent.click(screen.getByRole('button', { name: /^Social/ }))
    const social = within(screen.getByRole('dialog', { name: 'Social' }))
    fireEvent.click(
      within(social.getByRole('region', { name: 'Player roster' })).getByRole('button', {
        name: new RegExp(guest.name),
      })
    )
    fireEvent.click(social.getByText('Profile traits', { exact: true }))
    const traits = within(social.getByRole('region', { name: `${guest.name} profile traits` }))
    expect(traits.queryByText('Openness')).toBeNull()
    expect(traits.getAllByText('Too little to tell')).toHaveLength(5)
    expect(traits.queryByRole('button', { name: /Observe|Ask around|Ask to watch/ })).toBeNull()
    expect(social.queryByRole('region', { name: 'Other accounts' })).toBeNull()
    expect(social.queryByRole('combobox')).toBeNull()
    expect(social.queryByRole('textbox', { name: 'Private note' })).toBeNull()
    fireEvent.click(social.getByRole('tab', { name: 'Intel' }))
    const moves = within(social.getByRole('region', { name: 'Social actions' }))
    fireEvent.click(moves.getByRole('button', { name: /^Observe/ }))
    expect(moves.getByRole('group', { name: 'Observation focus' })).toHaveTextContent(
      '3 left today'
    )
    await clickAndSave(moves.getByRole('button', { name: 'Execute' }))
    expect(social.getByText('You observed')).toBeVisible()
    expect(traits.getByRole('meter', { name: 'Strategic play' })).toBeVisible()
    fireEvent.click(moves.getByRole('button', { name: /^Ask around/ }))
    expect(moves.getByRole('button', { name: 'Execute' })).toBeDisabled()
    const partners = within(moves.getByRole('group', { name: 'Speak to a guest' }))
    fireEvent.click(partners.getByRole('button', { name: otherGuest.name }))
    expect(moves.getByRole('button', { name: 'Execute' })).toBeEnabled()
    fireEvent.click(moves.getByRole('button', { name: /^Review accounts/ }))
    expect(moves.getByRole('group', { name: 'Account to use' })).toBeVisible()
    await clickAndSave(social.getByRole('button', { name: 'Save to Intel' }))
    fireEvent.click(social.getByRole('button', { name: 'Open Intel' }))
    const intel = within(screen.getByRole('dialog', { name: 'My Pulse' }))
    expect(intel.getByRole('button', { name: 'Intel' })).toHaveAttribute('aria-pressed', 'true')
    expect(intel.queryByRole('combobox')).toBeNull()
    const guests = within(intel.getByRole('group', { name: 'Filter intel by guest' }))
    expect(guests.getByRole('button', { name: guest.name })).toHaveAttribute('aria-pressed', 'true')
    expect(intel.getByRole('button', { name: 'Saved' })).toBeVisible()
    fireEvent.click(guests.getByRole('button', { name: otherGuest.name }))
    expect(intel.queryByText('You observed')).toBeNull()
    fireEvent.click(guests.getByRole('button', { name: 'All guests' }))
    expect(intel.getByText('You observed')).toBeVisible()
    app.unmount()
    render(<BetrayalsScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Open My Pulse' }))
    const restored = within(screen.getByRole('dialog', { name: 'My Pulse' }))
    expect(restored.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(restored.getByRole('button', { name: 'Intel' }))
    fireEvent.click(restored.getByText('Private notes', { exact: true }))
    expect(restored.getByText(/Check their version tomorrow/)).toBeVisible()
    expect(restored.getByText('You observed')).toBeVisible()
  })

  it('takes over Tilt Labyrinth results once, preserving the time, ranking and shields', async () => {
    const initial = startRun(
      { id: 'human', name: 'Georgi' },
      BETRAYALS_AI_POOL,
      { publicMode: false, realityMode: 'off' },
      { id: 'test-safety-timed-results', roleSeed: 32, publicSeed: 12 }
    )
    const fixture = {
      ...initial,
      phase: 'safety' as const,
      day: 2,
      immunityId: initial.seats[1].id,
      private: { ...initial.private, betrayers: initial.seats.slice(2, 5).map(({ id }) => id) },
    }
    const run = Array.from({ length: 128 }, (_, publicSeed) => ({ ...fixture, publicSeed })).find(
      (entry) => challengeGame(entry)?.key === 'tiltLabyrinth'
    )!
    saveRun(localStorage, 'edition-local', run)
    render(<BetrayalsScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Play Tilt Labyrinth' }))
    vi.useFakeTimers()
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Start competition' }))
      act(() => vi.advanceTimersByTime(3600))
    } finally {
      vi.useRealTimers()
    }
    let finishSave: (result: boolean) => void = () => {}
    vi.spyOn(durablePersistence, 'flushDurablePersistence').mockReturnValueOnce(
      new Promise((resolve) => {
        finishSave = resolve
      })
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Finish maze' }, { timeout: 5000 }))
    expect(screen.getByText('Saving challenge results.')).toBeVisible()
    expect(screen.queryByText('Maze results')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument()
    await act(async () => finishSave(true))
    const scoreboard = within(screen.getByRole('dialog', { name: 'Safety Challenge results' }))
    expect(scoreboard.getByRole('region', { name: 'Standings' })).toHaveAttribute('tabindex', '0')
    expect(scoreboard.getByRole('columnheader', { name: 'Adjusted time' })).toBeVisible()
    expect(scoreboard.getByRole('row', { name: /Georgi/ })).toHaveTextContent('2:40.01')
    expect(scoreboard.getAllByText('Won')).toHaveLength(2)
    expect(scoreboard.getAllByLabelText('Hidden')).toHaveLength(23)
    await clickAndSave(scoreboard.getByRole('button', { name: 'Continue' }))
    expect(
      screen.queryByRole('dialog', { name: 'Safety Challenge results' })
    ).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Shield Deals/ })).toBeVisible()
    await clickAndSave(screen.getByRole('button', { name: 'Continue to Round Table' }))
    expect(screen.getByRole('dialog', { name: 'Round Table' })).toBeVisible()
  }, 10000)

  it('names public Safety winners in the standings and marks their wins on the roster and Faux TV', async () => {
    const initial = startRun(
      { id: 'human', name: 'Georgi' },
      BETRAYALS_AI_POOL,
      { publicMode: false, realityMode: 'off' },
      { id: 'test-safety-public-wall', roleSeed: 32, publicSeed: 12 }
    )
    const [, immune, opponent] = initial.seats
    const run = {
      ...initial,
      phase: 'safety' as const,
      day: 2,
      immunityId: immune.id,
      challengeHistory: [] as string[],
    }
    let game = challengeGame(run)
    while (game && game.key !== 'holdWall' && !run.challengeHistory.includes(game.key)) {
      run.challengeHistory.push(game.key)
      game = challengeGame(run)
    }
    expect(game?.key).toBe('holdWall')
    saveRun(localStorage, 'edition-local', run)
    render(<BetrayalsScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Play Hold the Wall' }))
    vi.useFakeTimers()
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Start competition' }))
      act(() => vi.advanceTimersByTime(3600))
    } finally {
      vi.useRealTimers()
    }
    const finish = await screen.findByRole('button', { name: 'Finish challenge' })
    const wall = within(screen.getByRole('list', { name: 'On the wall' }))
    expect(wall.getByText(opponent.name)).toBeVisible()
    expect(wall.queryByText(immune.name)).not.toBeInTheDocument()
    await clickAndSave(finish)
    const standings = within(screen.getByRole('dialog', { name: 'Safety Challenge results' }))
    expect(standings.getByRole('rowheader', { name: opponent.name })).toBeVisible()
    expect(standings.queryByLabelText('Hidden')).not.toBeInTheDocument()
    await clickAndSave(standings.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('heading', { name: /Shield Deals/ })).toBeVisible()
    const roster = within(screen.getByRole('list', { name: 'Contestant roster' }))
    expect(
      roster.getByRole('button', { name: `${opponent.name}, Won a Night Shield` })
    ).toBeVisible()
    const tv = within(screen.getByRole('region', { name: 'Faux TV' }))
    expect(tv.getByText(/They may have passed their shields on in secret/)).toBeVisible()
  })

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
    expect(
      document.querySelector('.betrayals-broadcast__glass .betrayals-dawn')
    ).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it.each([
    ['immunity', 'Hold the Wall', /Press and HOLD the wall panel/],
    ['safety', 'Quick Tap Race', /Wait for the start signal/],
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
    const rules = () => within(screen.getByRole('dialog', { name: game + ' rules' }))
    expect(rules().getByText(rule)).toBeVisible()
    expect(screen.queryByRole('status', { name: 'Get Ready' })).not.toBeInTheDocument()

    vi.useFakeTimers()
    try {
      fireEvent.click(rules().getByRole('button', { name: 'Start competition' }))
      const ready = () => within(screen.getByRole('status', { name: 'Get Ready' }))
      expect(ready().getByText('3')).toBeVisible()
      act(() => vi.advanceTimersByTime(1000))
      expect(ready().getByText('2')).toBeVisible()
      openEye()
      fireEvent.click(screen.getByRole('menuitem', { name: /View rules/ }))
      act(() => vi.advanceTimersByTime(5000))
      expect(screen.queryByRole('button', { name: 'Finish challenge' })).not.toBeInTheDocument()
      fireEvent.click(rules().getByRole('button', { name: 'Return to countdown' }))
      expect(ready().getByText('3')).toBeVisible()
      act(() => vi.advanceTimersByTime(3000))
      expect(ready().getByText('GO!')).toBeVisible()
      expect(screen.queryByRole('button', { name: 'Finish challenge' })).not.toBeInTheDocument()
      act(() => vi.advanceTimersByTime(600))
    } finally {
      vi.useRealTimers()
    }
    expect(await screen.findByRole('button', { name: 'Finish challenge' })).toBeVisible()
    openEye()
    fireEvent.click(screen.getByRole('menuitem', { name: /View rules/ }))
    fireEvent.click(rules().getByRole('button', { name: 'Return to game' }))
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

  it.each([
    ['lastLight', 'The Last Light'],
    ['rockPaperScissors', 'Rock, Paper, Scissors'],
    ['riskWheelAbyss', 'Risk Wheel: Abyss'],
  ] as const)(
    'launches %s with rules, a ready countdown and a running clock',
    async (key, title) => {
      const initial = startRun(
        { id: 'human', name: 'Georgi' },
        BETRAYALS_AI_POOL,
        { publicMode: false, realityMode: 'off' },
        { id: key, roleSeed: 32, publicSeed: 12 }
      )
      const run = {
        ...initial,
        day: 3,
        phase: 'immunity' as const,
        seats: initial.seats.map((seat, index) =>
          index < 8 ? seat : { ...seat, exit: { day: 2, cause: 'night' as const } }
        ),
        challengeHistory: [] as string[],
      }
      let game = challengeGame(run)
      while (game && game.key !== key && !run.challengeHistory.includes(game.key)) {
        run.challengeHistory.push(game.key)
        game = challengeGame(run)
      }
      expect(game?.key).toBe(key)
      saveRun(localStorage, 'edition-local', run)
      render(<BetrayalsScreen />)
      fireEvent.click(screen.getByRole('button', { name: 'Play ' + title }))
      const rules = within(screen.getByRole('dialog', { name: title + ' rules' }))
      vi.useFakeTimers()
      try {
        fireEvent.click(rules.getByRole('button', { name: 'Start competition' }))
        expect(screen.getByRole('status', { name: 'Get Ready' })).toBeVisible()
        act(() => vi.advanceTimersByTime(3600))
      } finally {
        vi.useRealTimers()
      }
      const stage = within(await screen.findByRole('region', { name: title }, { timeout: 4_000 }))
      expect(await stage.findByRole('timer', { name: 'Seconds remaining' })).toBeVisible()
    }
  )

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
    expect(screen.getByText('The season ended automatically when 2 guests remained.')).toBeVisible()
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

    vi.useFakeTimers()
    try {
      await clickAndSave(screen.getByRole('button', { name: 'Play: open Day 1' }))
      await act(async () => vi.advanceTimersByTime(2850))
    } finally {
      vi.useRealTimers()
    }
    expect(screen.getByRole('heading', { name: 'Breakfast' })).toBeInTheDocument()
    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Season actions' })).getByRole('button', {
        name: /^Social/,
      })
    )
    const conversations = screen.getByRole('dialog', { name: 'Social' })
    expect(conversations).toBeVisible()
    expect(within(conversations).queryByText('At breakfast')).toBeNull()
    fireEvent.click(within(conversations).getByRole('button', { name: 'Close social panel' }))
    expect(screen.queryByRole('dialog', { name: 'Social' })).not.toBeInTheDocument()
    await clickAndSave(screen.getByRole('button', { name: 'Go to Immunity Challenge' }))
    fireEvent.click(screen.getByRole('button', { name: 'Play Hold the Wall' }))
    vi.useFakeTimers()
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Start competition' }))
      act(() => vi.advanceTimersByTime(3600))
    } finally {
      vi.useRealTimers()
    }
    await clickAndSave(await screen.findByRole('button', { name: 'Finish challenge' }))
    await finishCinematic()
    expect(screen.getByRole('heading', { name: 'Lunch' })).toBeVisible()
    await clickAndSave(screen.getByRole('button', { name: 'Enter the castle afternoon' }))
    expect(screen.getByRole('heading', { name: 'Around the Castle' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: /^Inbox/ }))
    const afternoon = within(screen.getByRole('dialog', { name: 'Incoming interactions' }))
    expect(afternoon.getByText('Around the castle')).toBeVisible()
    fireEvent.click(afternoon.getByRole('button', { name: 'Close inbox' }))
    await clickAndSave(screen.getByRole('button', { name: 'Go to Safety Challenge' }))
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
    expect(screen.getByRole('heading', { name: 'Before the Table' })).toBeVisible()
    await clickAndSave(screen.getByRole('button', { name: 'Continue to Round Table' }))
    await finishCinematic()
    const chamber = screen.getByRole('dialog', { name: 'Round Table' })
    expect(within(chamber).getByRole('log', { name: 'Round Table conversation' })).toBeVisible()
    const tv = within(screen.getByRole('region', { name: 'Faux TV' }))
    expect(tv.queryByRole('log')).not.toBeInTheDocument()
    fireEvent.click(within(chamber).getByRole('button', { name: 'Back to castle' }))
    expect(screen.queryByRole('dialog', { name: 'Round Table' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Social/ }))
    const privateTalk = within(screen.getByRole('dialog', { name: 'Social' }))
    const general = within(privateTalk.getByRole('region', { name: 'General actions' }))
    fireEvent.click(general.getByRole('button', { name: /Lay Low/ }))
    await clickAndSave(general.getByRole('button', { name: 'Execute general action' }))
    expect(privateTalk.getByText('You kept to yourself and saved your Energy.')).toBeVisible()
    const guestRoster = within(privateTalk.getByRole('region', { name: 'Player roster' }))
    fireEvent.click(guestRoster.getAllByRole('button')[0])
    expect(privateTalk.getByRole('button', { name: /Speak one-on-one/ })).toBeVisible()
    expect(privateTalk.queryByRole('button', { name: /Plan a vote/ })).toBeNull()
    expect(privateTalk.queryByRole('button', { name: /Propose Personal Pact/ })).toBeNull()
    fireEvent.click(privateTalk.getByRole('button', { name: 'Close social panel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enter Round Table' }))
    await clickAndSave(screen.getByRole('button', { name: 'Voting' }))
    expect(screen.queryByRole('dialog', { name: 'Round Table' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lock vote' })).toBeDisabled()
  })

  it('lets the player verify a lead privately and call the witness before voting', async () => {
    const start = startRun(
      { id: 'human', name: 'Player' },
      BETRAYALS_AI_POOL,
      { publicMode: false, realityMode: 'off' },
      { id: 'witness-ui', roleSeed: 32, publicSeed: 12 }
    )
    const [, suspect, pitch, source, witness, relay] = start.seats
    const run = {
      ...start,
      phase: 'round-table' as const,
      witnessLead: {
        day: start.day,
        suspectId: suspect.id,
        pitchId: pitch.id,
        sourceId: source.id,
        witnessId: witness.id,
        relayId: relay.id,
      },
    }
    saveRun(localStorage, 'edition-local', run)
    render(<BetrayalsScreen />)
    const room = within(screen.getByRole('dialog', { name: 'Round Table' }))
    fireEvent.click(room.getByRole('button', { name: 'Take the floor' }))
    expect(room.queryByRole('button', { name: 'Call ' + witness.name })).not.toBeInTheDocument()
    await clickAndSave(
      room.getByRole('button', { name: 'Ask ' + witness.name + ' privately \u00b7 1 energy' })
    )
    expect(room.getByRole('status')).toHaveTextContent(witness.name + ' will confirm')
    await clickAndSave(room.getByRole('button', { name: 'Call ' + witness.name }))
    expect(screen.queryByRole('dialog', { name: 'Round Table' })).not.toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: 'Faux TV' })).getByRole('status')
    ).toHaveTextContent('I was there.')
  })

  it('honors a shield given through the regular Social action card when the witness takes the floor', async () => {
    const start = startRun(
      { id: 'human', name: 'Georgi' },
      BETRAYALS_AI_POOL,
      { publicMode: false, realityMode: 'off' },
      { id: 'review-shield-social', roleSeed: 32, publicSeed: 12 }
    )
    const [, accused, witness, nominee] = start.seats
    saveRun(localStorage, 'edition-local', {
      ...start,
      phase: 'shield-deals',
      dayFlow: { day: 1 },
      private: { ...start.private, nightShieldIds: ['human'] },
      investigation: {
        ...investigationFor(start),
        reports: [
          {
            id: 'intel:1',
            day: 1,
            guestId: accused.id,
            speakerId: witness.id,
            method: 'ask',
            access: 'firsthand',
            claim: { day: 1, behavior: 'lobbied', topicId: nominee.id, contactId: witness.id },
          },
        ],
        witnesses: [{ day: 1, reportId: 'intel:1', accepted: false, shield: 'pending' }],
      },
    })
    render(<BetrayalsScreen />)
    expect(screen.queryByRole('dialog')).toBeNull()
    const television = within(screen.getByRole('region', { name: 'Faux TV' }))
    expect(television.getByText(`${witness.name} asked for cover to testify.`)).toBeVisible()
    expect(television.queryByRole('button')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Social/ }))
    const social = within(screen.getByRole('dialog', { name: 'Social' }))
    fireEvent.click(
      within(social.getByRole('region', { name: 'Player roster' })).getByRole('button', {
        name: new RegExp(witness.name),
      })
    )
    expect(social.getByRole('heading', { name: witness.name })).toBeVisible()
    expect(social.queryByRole('combobox')).toBeNull()
    fireEvent.click(social.getByRole('button', { name: /Gift a Night Shield/ }))
    await clickAndSave(social.getByRole('button', { name: 'Give shield' }))
    expect(social.getByRole('status')).toHaveTextContent(`You gave ${witness.name} a Night Shield.`)
    fireEvent.click(social.getByRole('button', { name: 'Close social panel' }))
    await clickAndSave(screen.getByRole('button', { name: 'Continue to Round Table' }))
    await finishCinematic()
    const room = within(screen.getByRole('dialog', { name: 'Round Table' }))
    fireEvent.click(room.getByRole('button', { name: 'Take the floor' }))
    await clickAndSave(room.getByRole('button', { name: `Call ${witness.name}` }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('region', { name: 'Faux TV' })).toHaveTextContent('I was there.')
  })

  it('opens the public vote ledger over cocktails and plays the anonymous Conclave before the murder', async () => {
    const start = startRun(
      { id: 'human', name: 'Georgi' },
      BETRAYALS_AI_POOL,
      { publicMode: false, realityMode: 'off' },
      { id: 'cocktail-to-night', roleSeed: 32, publicSeed: 12 }
    )
    const [, banished, voter, ...others] = start.seats
    saveRun(localStorage, 'edition-local', {
      ...start,
      phase: 'cocktail',
      dayFlow: { day: 1, castleDay: true },
      seats: start.seats.map((seat) =>
        seat.id === banished.id
          ? { ...seat, exit: { cause: 'banished', day: 1, revealedRole: 'loyal' } }
          : seat
      ),
      lastTable: {
        banishedId: banished.id,
        blind: false,
        tally: { [banished.id]: 2 },
        tiedByDraw: false,
        revealedBallots: [{ voterId: voter.id, targetId: banished.id }],
      },
      private: { ...start.private, betrayers: others.slice(0, 3).map(({ id }) => id) },
    })
    render(<BetrayalsScreen />)
    const tv = within(screen.getByRole('region', { name: 'Faux TV' }))
    expect(tv.getByRole('heading', { name: 'Cocktails' })).toBeVisible()
    fireEvent.click(tv.getByRole('button', { name: 'All Votes' }))
    const ledger = within(screen.getByRole('dialog', { name: 'All Round Table votes' }))
    expect(ledger.getByRole('list', { name: 'All ballots' })).toHaveTextContent(voter.name)
    expect(ledger.getByText(/They were a Loyal/)).toBeVisible()
    fireEvent.click(ledger.getByRole('button', { name: 'Back to Cocktails' }))
    await clickAndSave(screen.getByRole('button', { name: 'Continue to Night' }))
    expect(screen.getByRole('dialog')).toHaveAttribute('data-scene', 'nightfall')
    expect(document.querySelectorAll('.betrayals-nightfall__windows')).toHaveLength(3)
    await finishCinematic()
    expect(tv.getByText('Everyone is trying to sleep. However, evil never sleeps.')).toBeVisible()
    expect(screen.getAllByRole('button', { name: /Asleep/ }).length).toBeGreaterThan(0)
    await clickAndSave(screen.getByRole('button', { name: 'Go to sleep' }))
    expect(screen.getByRole('dialog')).toHaveAttribute('data-scene', 'conclave-shadow')
    await finishCinematic()
    expect(screen.getByRole('dialog')).toHaveAttribute('data-scene', 'death-letter')
    const pending = restoreRun(localStorage, 'edition-local')
    expect(pending.status).toBe('ready')
    if (pending.status !== 'ready') throw new Error('Expected the night result to be saved')
    const victimId = pending.run.private.pendingNight?.targetId
    const victimSeat = document.querySelector(`[data-seat-id="${victimId}"]`)
    expect(victimSeat).toHaveAttribute('data-asleep', 'true')
    expect(victimSeat?.querySelector('[data-seal="night"]')).toBeNull()
    await finishCinematic()
    expect(victimSeat).not.toHaveAttribute('data-asleep')
    expect(victimSeat?.querySelector('[data-seal="night"]')).toBeInTheDocument()
    await clickAndSave(screen.getByRole('button', { name: 'Open Dawn' }))
    expect(screen.getByRole('dialog')).toHaveAttribute('data-scene', 'castle-wakes')
    await finishCinematic()
    expect(screen.getByRole('heading', { name: 'Breakfast' })).toBeVisible()
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
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Round Table ballot reveal' })).getByRole(
        'button',
        {
          name: 'All Votes',
        }
      )
    )
    fireEvent.click(screen.getByRole('button', { name: 'Return to vote totals' }))
    expect(feed.getByRole('status')).toHaveTextContent('The count is complete.')
    expect(
      within(screen.getByRole('region', { name: 'Faux TV' })).getByRole('button', {
        name: 'All Votes',
      })
    ).toBeVisible()

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
    expect(
      within(screen.getByRole('region', { name: 'Faux TV' })).getByRole('button', {
        name: 'All Votes',
      })
    ).toBeVisible()
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
    expect(screen.getByRole('dialog')).toHaveAttribute('data-scene', 'nightfall')
    await finishCinematic()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(tv.getByText(banished.name + ' was banished. A Loyal.')).toBeVisible()
    const seats = cast.getAllByRole('button')
    expect(seats).toHaveLength(25)
    expect(seats[position]).toHaveAccessibleName(banished.name + ', Banished, Loyal')
    expect(screen.queryByRole('region', { name: 'Private conclave' })).not.toBeInTheDocument()
    await clickAndSave(screen.getByRole('button', { name: 'Play: follow the Night' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(cast.getAllByRole('button', { name: /Asleep/ })).toHaveLength(24)
    expect(
      cast
        .getAllByRole('button', { name: /Asleep/ })
        .map((seat) => seat.querySelector('.betrayals-sleep-mask img'))
        .find(Boolean)
    ).toHaveAttribute('src', expect.stringContaining('assets/betrayals/sleep-mask.webp'))
    expect(seats[position]).not.toHaveAttribute('data-asleep')
    await clickAndSave(screen.getByRole('button', { name: 'Open Dawn' }))
    expect(screen.getByRole('dialog')).toHaveAttribute('data-scene', 'death-letter')
    await finishCinematic()
    expect(screen.getByRole('dialog')).toHaveAttribute('data-scene', 'castle-wakes')
    await finishCinematic()
    expect(screen.getByRole('dialog')).toHaveAttribute('data-scene', 'awakening')
    expect(screen.getByRole('dialog')).toHaveAttribute('data-reduced', 'true')
    await finishCinematic()
    expect(cast.getAllByRole('button', { name: /Eliminated at Night/ })).toHaveLength(1)
    expect(
      cast.getByRole('button', { name: /Eliminated at Night/ }).querySelector('[data-mourning]')
    ).toBeNull()
    expect(
      seats.some((seat) => seat.querySelector('img[data-mourning][src$="_sad_avatar.webp"]'))
    ).toBe(true)
    expect(cast.queryByRole('button', { name: /Asleep/ })).not.toBeInTheDocument()
  })

  it.each([true, false])(
    'keeps the Conclave discussion and ballot connected with animations %s',
    async (animated) => {
      const run = startRun(
        { id: 'human', name: 'Georgi' },
        BETRAYALS_AI_POOL,
        { publicMode: false, realityMode: 'off' },
        { id: 'conclave-presentation', roleSeed: 32, publicSeed: 12 }
      )
      const night = {
        ...run,
        phase: 'night' as const,
        presentation: animated
          ? (['nightfall', 'conclave-arrival'] as const).slice()
          : ['conclave-arrival' as const],
        private: {
          ...run.private,
          betrayers: run.seats.slice(0, 4).map(({ id }) => id),
          hiddenBetrayerIds: [run.seats[3].id],
        },
      }
      const vote = getConclaveView(night, run.humanId)!
      const firstLine = vote.discussion[0]
      const secondLine = vote.discussion[1]
      if (!animated) {
        localStorage.setItem('betrayals.preferences.v1', JSON.stringify({ reducedMotion: true }))
      }
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
      saveRun(localStorage, 'edition-local', night)
      render(<BetrayalsScreen />)

      if (animated) {
        expect(screen.getByRole('dialog')).toHaveAttribute('data-scene', 'nightfall')
        expect(screen.getByRole('main', { hidden: true })).toHaveAttribute(
          'data-conclave-cover',
          'true'
        )
        await finishCinematic()
        const room = screen.getByRole('dialog', { name: 'The Conclave' })
        const conclave = within(room)
        const film = room.querySelector('.conclave-film')
        await clickAndSave(conclave.getByRole('button', { name: 'Skip cinematic' }))
        expect(conclave.getByText(firstLine.argument)).toBeVisible()
        expect(room.querySelector('.conclave-film')).toBe(film)
        fireEvent.click(conclave.getByRole('button', { name: 'Continue' }))
        expect(conclave.getByText(secondLine.argument)).toBeVisible()
        expect(room.querySelector('.conclave-film')).toBe(film)
        fireEvent.click(conclave.getByRole('button', { name: 'Skip to ballot' }))
        const ballot = within(conclave.getByRole('region', { name: 'Night ballot' }))
        expect(conclave.getByRole('button', { name: 'Lock Night choice' })).toBeDisabled()
        fireEvent.click(ballot.getAllByRole('button')[0])
        expect(conclave.getByRole('button', { name: 'Lock Night choice' })).toBeEnabled()
      } else {
        expect(screen.queryByRole('dialog', { name: 'The Conclave' })).not.toBeInTheDocument()
        const tv = within(screen.getByRole('region', { name: 'Faux TV' }))
        expect(tv.getByText(firstLine.argument)).toBeVisible()
        fireEvent.click(screen.getByRole('button', { name: 'Play: next Conclave speaker' }))
        expect(tv.getByText(secondLine.argument)).toBeVisible()
        expect(tv.queryByText(firstLine.argument)).not.toBeInTheDocument()
      }
    }
  )

  it('opens the full recruitment gallery for the sole human Betrayer with animations off', async () => {
    localStorage.setItem('betrayals.preferences.v1', JSON.stringify({ reducedMotion: true }))
    const run = startRun(
      { id: 'human', name: 'Georgi' },
      BETRAYALS_AI_POOL,
      { publicMode: false, realityMode: 'off' },
      { id: 'human-recruits', roleSeed: 32, publicSeed: 12 }
    )
    const betrayers = run.seats.slice(0, 3).map(({ id }) => id)
    const immune = run.seats[3]
    const recruit = run.seats.at(-1)!
    saveRun(localStorage, 'edition-local', {
      ...run,
      phase: 'night',
      day: 4,
      immunityId: immune.id,
      seats: run.seats.map((seat) =>
        seat.id !== run.humanId && betrayers.includes(seat.id)
          ? { ...seat, exit: { cause: 'banished', day: 3 } }
          : seat
      ),
      private: { ...run.private, betrayers },
    })
    render(<BetrayalsScreen />)

    const conclave = within(screen.getByRole('dialog', { name: 'The Conclave' }))
    expect(conclave.getByRole('heading', { name: 'A Quiet Knock' })).toBeVisible()
    const gallery = within(conclave.getByRole('list', { name: 'Eligible contestants' }))
    expect(gallery.getAllByRole('button')).toHaveLength(21)
    expect(gallery.queryByRole('button', { name: immune.name })).not.toBeInTheDocument()
    expect(conclave.getByRole('button', { name: 'Send invitation' })).toBeDisabled()
    fireEvent.click(gallery.getByRole('button', { name: recruit.name }))
    await clickAndSave(conclave.getByRole('button', { name: 'Send invitation' }))

    expect(screen.queryByRole('dialog', { name: 'The Conclave' })).not.toBeInTheDocument()
    const tv = within(screen.getByRole('region', { name: 'Faux TV' }))
    expect(
      tv.getByText(`${recruit.name} accepted your invitation to join the Betrayers.`)
    ).toBeVisible()
  })

  it('lets an invited Loyal answer privately before showing the recruiter', async () => {
    localStorage.setItem('betrayals.preferences.v1', JSON.stringify({ reducedMotion: true }))
    const run = startRun(
      { id: 'human', name: 'Georgi' },
      BETRAYALS_AI_POOL,
      { publicMode: false, realityMode: 'off' },
      { id: 'human-invited', roleSeed: 32, publicSeed: 12 }
    )
    const recruiter = run.seats[1]
    const betrayers = run.seats.slice(1, 4).map(({ id }) => id)
    saveRun(localStorage, 'edition-local', {
      ...run,
      phase: 'night',
      day: 4,
      seats: run.seats.map((seat) =>
        seat.id !== recruiter.id && betrayers.includes(seat.id)
          ? { ...seat, exit: { cause: 'banished', day: 3 } }
          : seat
      ),
      private: { ...run.private, betrayers, humanRecruitmentOffered: true },
    })
    render(<BetrayalsScreen />)

    const tv = within(screen.getByRole('region', { name: 'Faux TV' }))
    expect(tv.getByText('A sealed invitation')).toBeVisible()
    expect(tv.queryByText(recruiter.name, { exact: false })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Decline and leave' })).toBeEnabled()
    await clickAndSave(screen.getByRole('button', { name: 'Join the Betrayers' }))
    expect(
      tv.getByText(`You joined the Betrayers. ${recruiter.name} is your teammate.`)
    ).toBeVisible()
  })

  it('shows an unaffected Loyal only the attendance result after a recruit joins', async () => {
    localStorage.setItem('betrayals.preferences.v1', JSON.stringify({ reducedMotion: true }))
    const run = startRun(
      { id: 'human', name: 'Georgi' },
      BETRAYALS_AI_POOL,
      { publicMode: false, realityMode: 'off' },
      { id: 'recruitment-breakfast', roleSeed: 32, publicSeed: 12 }
    )
    const [recruiter, first, second, recruit] = run.seats.slice(1, 5)
    saveRun(localStorage, 'edition-local', {
      ...run,
      phase: 'night-resolved',
      day: 4,
      seats: run.seats.map((seat) =>
        [first.id, second.id].includes(seat.id)
          ? { ...seat, exit: { cause: 'banished', day: 3 } }
          : seat
      ),
      private: {
        ...run.private,
        betrayers: [recruiter.id, first.id, second.id, recruit.id],
        pendingNight: { targetId: null, blocked: false, recruitedId: recruit.id },
      },
    })
    render(<BetrayalsScreen />)

    const tv = within(screen.getByRole('region', { name: 'Faux TV' }))
    expect(tv.queryByText(/recruit|invitation/i)).not.toBeInTheDocument()
    await clickAndSave(screen.getByRole('button', { name: 'Open Dawn' }))
    expect(tv.getByText('Everyone returned.')).toBeVisible()
    expect(tv.queryByText(/recruit|invitation/i)).not.toBeInTheDocument()
  })

  it('lets a gift recipient bluff in the Inbox and pass the shield on in Social', async () => {
    const run = startRun(
      { id: 'human', name: 'Georgi' },
      BETRAYALS_AI_POOL,
      { publicMode: false, realityMode: 'off' },
      { id: 'night-shield-handoff', roleSeed: 32, publicSeed: 12 }
    )
    const [human, donor, recipient, other] = run.seats
    const table = {
      ...run,
      phase: 'round-table' as const,
      private: { ...run.private, nightShieldIds: [donor.id, other.id] },
    }
    const gifted = applySocialMove(table, commandToken(table), {
      actorId: donor.id,
      recipientId: human.id,
      kind: 'shield-gift',
    })
    saveRun(localStorage, 'edition-local', gifted)
    render(<BetrayalsScreen />)

    const chamber = within(screen.getByRole('dialog', { name: 'Round Table' }))
    fireEvent.click(chamber.getByRole('button', { name: 'Back to castle' }))

    const roster = within(screen.getByRole('list', { name: 'Contestant roster' }))
    expect(roster.getByRole('button', { name: 'Georgi, Night Shield' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: /^Inbox/ }))
    const inbox = within(screen.getByRole('dialog', { name: 'Incoming interactions' }))
    expect(inbox.getByText('Night Shield received')).toBeVisible()
    expect(inbox.getByRole('button', { name: 'Keep it private' })).toBeVisible()
    await clickAndSave(inbox.getByRole('button', { name: 'Say I have none' }))
    expect(inbox.getByText(/you told .* you have no Night Shield/i)).toBeVisible()
    fireEvent.click(inbox.getByRole('button', { name: 'Close inbox' }))

    fireEvent.click(screen.getByRole('button', { name: /^Social/ }))
    const social = within(screen.getByRole('dialog', { name: 'Social' }))
    const guests = within(social.getByRole('region', { name: 'Player roster' }))
    fireEvent.click(guests.getByRole('button', { name: new RegExp(recipient.name) }))
    fireEvent.click(social.getByRole('tab', { name: 'Shields' }))
    fireEvent.click(social.getByRole('button', { name: /Say you have no shield/ }))
    await clickAndSave(social.getByRole('button', { name: 'Execute' }))
    fireEvent.click(social.getByRole('button', { name: /Gift a Night Shield/ }))
    await clickAndSave(social.getByRole('button', { name: 'Give shield' }))
    expect(social.getByText(/You gave .* a Night Shield. .*you didn't have one/)).toBeVisible()
    expect(social.getByRole('button', { name: /Gift a Night Shield/ })).toHaveAttribute(
      'aria-disabled',
      'true'
    )
    const shieldTalk = [/Say you have a shield/, /Say you have no shield/, /Ask about their shield/]
    for (const name of shieldTalk) {
      expect(social.getByRole('button', { name })).toHaveAttribute('aria-disabled', 'true')
    }
    fireEvent.click(
      social.getByRole('button', { name: `Deselect ${recipient.name} and show roster` })
    )
    fireEvent.click(social.getByRole('button', { name: new RegExp(other.name) }))
    for (const name of shieldTalk) {
      expect(social.getByRole('button', { name })).toHaveAttribute('aria-disabled', 'false')
    }
    fireEvent.click(social.getByRole('button', { name: 'Close social panel' }))
    expect(roster.getByRole('button', { name: 'Georgi' })).toBeVisible()
    expect(roster.getByRole('button', { name: recipient.name })).toBeVisible()
    const saved = restoreRun(localStorage, 'edition-local')
    expect(saved.status).toBe('ready')
    expect(saved.status === 'ready' && saved.run.private.nightShieldIds).toEqual([
      recipient.id,
      other.id,
    ])
  })

  it('plays the morning transition and privately tells you when your Night Shield worked', async () => {
    const run = startRun(
      { id: 'human', name: 'Georgi' },
      BETRAYALS_AI_POOL,
      { publicMode: false, realityMode: 'off' },
      { id: 'test-shielded-night', roleSeed: 32, publicSeed: 12 }
    )
    const target = run.seats[0]
    saveRun(localStorage, 'edition-local', {
      ...run,
      phase: 'night-resolved',
      private: {
        ...run.private,
        betrayers: run.seats.slice(1, 4).map(({ id }) => id),
        nightShieldIds: [target.id],
        pendingNight: { targetId: target.id, blocked: true, byDraw: false },
      },
    })
    render(<BetrayalsScreen />)

    await clickAndSave(screen.getByRole('button', { name: 'Open Dawn' }))
    expect(screen.getByRole('dialog')).toHaveAttribute('data-scene', 'castle-wakes')
    await finishCinematic()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Breakfast' })).toBeVisible()
    expect(screen.getByText('Your Night Shield stopped the Conclave’s attempt.')).toBeVisible()
    expect(screen.queryByRole('button', { name: /Eliminated at Night/ })).not.toBeInTheDocument()
  })

  it('uses the roster mark for a night elimination when Animations is off', async () => {
    localStorage.setItem('betrayals.preferences.v1', JSON.stringify({ reducedMotion: true }))
    const run = startRun(
      { id: 'human', name: 'Georgi' },
      BETRAYALS_AI_POOL,
      { publicMode: false, realityMode: 'off' },
      { id: 'quick-night-exit', roleSeed: 32, publicSeed: 12 }
    )
    saveRun(localStorage, 'edition-local', {
      ...run,
      phase: 'night-resolved',
      presentation: ['death-letter'],
      private: {
        ...run.private,
        pendingNight: { targetId: run.humanId, blocked: false, byDraw: false },
      },
    })
    render(<BetrayalsScreen />)
    const quickExit = within(screen.getByRole('dialog', { name: 'Georgi was eliminated at night' }))
    const tile = screen.getByRole('button', { name: 'Georgi, Eliminated at Night' })
    expect(tile.querySelector('[data-brief-exit-mark] img')).toHaveAttribute(
      'src',
      expect.stringContaining('evictionmark/evictionmark.png')
    )
    await clickAndSave(quickExit.getByRole('button', { name: 'Skip elimination' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(tile).toHaveAttribute('data-exit', 'night')
  })

  it.each([false, true])(
    'adds morning roll call only as a fallback for a night film (animations off: %s)',
    async (animationsOff) => {
      localStorage.setItem(
        'betrayals.preferences.v1',
        JSON.stringify({ reducedMotion: animationsOff })
      )
      const run = startRun(
        { id: 'human', name: 'Georgi' },
        BETRAYALS_AI_POOL,
        { publicMode: false, realityMode: 'off' },
        { id: 'resolve-night-film', roleSeed: 32, publicSeed: 12 }
      )
      const victim = run.seats.find(
        ({ id }) => id !== run.humanId && !run.private.betrayers.includes(id)
      )!
      saveRun(localStorage, 'edition-local', {
        ...run,
        phase: 'night-resolved',
        private: {
          ...run.private,
          pendingNight: { targetId: victim.id, blocked: false },
        },
      })
      render(<BetrayalsScreen />)
      vi.useFakeTimers()
      try {
        await clickAndSave(screen.getByRole('button', { name: 'Open Dawn' }))
        if (animationsOff) {
          expect(screen.getByRole('dialog')).toHaveAttribute('data-scene', 'awakening')
          expect(screen.getByText(victim.name + ' is missing.')).toBeVisible()
          await finishCinematic()
        } else {
          expect(screen.getByRole('dialog')).toHaveAttribute('data-scene', 'death-letter')
          for (const duration of [2200, 2450, 2650, 3600, 5000]) {
            act(() => vi.advanceTimersByTime(duration))
          }
          await clickAndSave(screen.getByRole('button', { name: 'Continue' }))
          expect(screen.getByRole('dialog')).toHaveAttribute('data-scene', 'castle-wakes')
          await finishCinematic()
        }
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(
          screen.getByRole('button', { name: victim.name + ', Eliminated at Night' })
        ).toBeVisible()
      } finally {
        vi.useRealTimers()
      }
    }
  )

  it('remembers the completed personal letter when resuming at Dawn', async () => {
    const run = startRun(
      { id: 'human', name: 'Georgi' },
      BETRAYALS_AI_POOL,
      { publicMode: false, realityMode: 'off' },
      { id: 'personal-night-film', roleSeed: 32, publicSeed: 12 }
    )
    saveRun(localStorage, 'edition-local', {
      ...run,
      phase: 'night-resolved',
      presentation: ['death-letter'],
      private: { ...run.private, pendingNight: { targetId: run.humanId, blocked: false } },
    })
    vi.useFakeTimers()
    try {
      const firstVisit = render(<BetrayalsScreen />)
      for (const duration of [2200, 2450, 2650, 3600, 5000]) {
        act(() => vi.advanceTimersByTime(duration))
      }
      await clickAndSave(screen.getByRole('button', { name: 'Continue' }))
      firstVisit.unmount()
      render(<BetrayalsScreen />)

      await clickAndSave(screen.getByRole('button', { name: 'Open Dawn' }))
      expect(screen.getByRole('dialog')).toHaveAttribute('data-scene', 'castle-wakes')
      await finishCinematic()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Georgi, Eliminated at Night' })).toBeVisible()
    } finally {
      vi.useRealTimers()
    }
  })
})

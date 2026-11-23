import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as durablePersistence from '../store/durablePersistence'
import BetrayalsScreen from './BetrayalsScreen'
import { BETRAYALS_AI_POOL } from './cast'
import { challengeGame } from './challengeRotation'
import { investigationFor } from './investigationRecords'
import { restoreRun, saveRun } from './persistence'
import { commandToken, startRun } from './run'
import { settleRun } from './settlement'
import { applySocialMove } from './social'
import { resolveTable } from './table'
import { preparePaidNightShieldPurchase, recordBetrayalsEconomy } from './economy'

const commerce = vi.hoisted(() => ({
  ready: true,
  vip: true,
  myPulse: true,
  realityMode: true,
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

describe('Betrayals season review', () => {
  beforeEach(() => {
    localStorage.clear()
    Object.assign(commerce, {
      vip: true,
      myPulse: true,
      realityMode: true,
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

  it('opens the paired Home Hub destinations from a profile', () => {
    const openDressingRoom = vi.fn()
    sessionStorage.setItem('betrayals.observatoryOpening.v1', 'true')
    render(
      <BetrayalsScreen
        profiles={{
          player: { id: 'intro-profile', name: 'Georgi', portrait: '/georgi.webp' },
          openProfile: vi.fn(),
          openAccount: vi.fn(),
          openDressingRoom,
        }}
      />
    )

    expect(screen.getByRole('button', { name: 'Start season' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Help & Feedback' })).toHaveAttribute(
      'href',
      expect.stringContaining('mailto:kolequant@gmail.com')
    )
    fireEvent.click(screen.getByRole('button', { name: 'Achievements' }))
    const achievements = within(screen.getByRole('dialog', { name: 'Achievements' }))
    expect(achievements.getByText('Enter the castle').parentElement).toHaveTextContent('Locked')
    fireEvent.click(achievements.getByRole('button', { name: 'Close achievements' }))

    fireEvent.click(screen.getByRole('button', { name: 'Store' }))
    const store = within(screen.getByRole('dialog', { name: 'Store' }))
    expect(store.getByRole('button', { name: 'View VIP benefits' })).toBeVisible()
    expect(store.getByRole('button', { name: 'Feature unlocks' })).toBeVisible()
    fireEvent.click(store.getByRole('button', { name: /The changing room/ }))
    expect(openDressingRoom).toHaveBeenCalledWith()
  })

  it('opens the profile Wallet directly from Home with real activity and a profile destination', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Open Wallet, 4,250 Eyeros' }))
    const wallet = within(screen.getByRole('dialog', { name: 'Wallet' }))
    expect(wallet.getByLabelText('4,250 Eyeros available')).toBeVisible()
    expect(wallet.getByRole('heading', { name: 'Recent activity' })).toBeVisible()
    expect(wallet.getByText('Social action')).toBeVisible()
    expect(wallet.queryByRole('region', { name: 'Store overview' })).toBeNull()
    fireEvent.click(wallet.getByRole('button', { name: 'Open profile: Georgi' }))
    expect(openWalletProfile).toHaveBeenCalledOnce()
    expect(openProfile).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Open Wallet, 4,250 Eyeros' }))
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
    fireEvent.click(screen.getByRole('button', { name: 'Open Wallet, 0 Eyeros' }))
    const wallet = within(screen.getByRole('dialog', { name: 'Wallet' }))
    fireEvent.click(wallet.getByRole('button', { name: 'Choose a profile' }))
    expect(openWalletProfile).toHaveBeenCalledOnce()
    expect(openProfile).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
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
    expect(social.queryByRole('region', { name: `${guest.name} profile traits` })).toBeNull()
    fireEvent.click(social.getByRole('button', { name: /Build trust/ }))
    await clickAndSave(social.getByRole('button', { name: 'Execute' }))
    const saved = restoreRun(localStorage, 'edition-local')
    expect(saved.status === 'ready' && saved.run.social?.at(-1)?.kind).toBe('rapport')
    fireEvent.click(social.getByRole('button', { name: /View full profile/ }))
    expect(screen.getByRole('dialog', { name: 'Store' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Reality Mode' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Close store' }))

    fireEvent.click(screen.getByRole('button', { name: 'Open Wallet, 0 Eyeros' }))
    const wallet = within(screen.getByRole('dialog', { name: 'Wallet' }))
    expect(wallet.getByRole('button', { name: 'Top up Eyeros' })).toBeVisible()
    expect(wallet.queryByRole('heading', { name: 'Reality Mode' })).toBeNull()
    fireEvent.click(wallet.getByRole('button', { name: 'Close wallet' }))

    fireEvent.click(screen.getByRole('button', { name: 'Home' }))
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

  it('expands the profile, filters saved Intel with guest chips, and retains old notes after reload', async () => {
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
    fireEvent.click(social.getByText('View full profile', { exact: true }))
    const traits = within(social.getByRole('region', { name: `${guest.name} profile traits` }))
    expect(traits.getAllByText('Too little to tell')).toHaveLength(6)
    expect(social.queryByRole('combobox')).toBeNull()
    expect(social.queryByRole('textbox', { name: 'Private note' })).toBeNull()
    await clickAndSave(social.getByRole('button', { name: 'Observe · 1 Energy' }))
    expect(social.getByText('You observed')).toBeVisible()
    expect(traits.getByRole('meter', { name: 'Strategic play' })).toBeVisible()
    expect(social.getByText('Steady focus · 2 left today')).toBeVisible()
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
    fireEvent.click(screen.getByRole('button', { name: 'Back to castle' }))
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

    vi.useFakeTimers()
    try {
      await clickAndSave(screen.getByRole('button', { name: 'Play: open Day 1' }))
      await act(async () => vi.advanceTimersByTime(2850))
    } finally {
      vi.useRealTimers()
    }
    expect(screen.getByRole('heading', { name: 'Dawn' })).toBeInTheDocument()
    await clickAndSave(screen.getByRole('button', { name: 'Play: enter Social' }))
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
    await clickAndSave(screen.getByRole('button', { name: 'Go to vote' }))
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
    fireEvent.click(screen.getByRole('button', { name: 'View all votes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Return to vote totals' }))
    expect(feed.getByRole('status')).toHaveTextContent('The count is complete.')
    expect(
      within(screen.getByRole('region', { name: 'Faux TV' })).queryByRole('button')
    ).not.toBeInTheDocument()

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
      within(screen.getByRole('region', { name: 'Faux TV' })).queryByRole('button')
    ).not.toBeInTheDocument()
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

  it('goes straight to Dawn and privately tells you when your Night Shield stopped the elimination', async () => {
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
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Dawn' })).toBeVisible()
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
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Georgi, Eliminated at Night' })).toBeVisible()
    } finally {
      vi.useRealTimers()
    }
  })
})

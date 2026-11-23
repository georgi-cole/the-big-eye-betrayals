import { Suspense } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GenericMinigameProps } from '../minigames/reactComponents'
import { getGame } from '../minigames/registryBase'
import BetrayalsChallengeGame from './BetrayalsChallengeGame'
import { BETRAYALS_AI_POOL } from './cast'
import { challengePlayers, challengeSeed, type ChallengeGame } from './challengeRotation'
import { startRun } from './run'

const capture = vi.hoisted(() => ({ premium: vi.fn(), standard: vi.fn(), glass: vi.fn() }))
vi.mock('../minigames/quickTapRace/QuickTapRaceCanvasGame', () => ({
  default: (props: GenericMinigameProps) => {
    capture.standard(props)
    return <p>Standard race</p>
  },
}))
vi.mock('../minigames/quickTapRace/vip/QuickTapRaceVip', () => ({
  default: (props: GenericMinigameProps) => {
    capture.premium(props)
    return (
      <button
        onClick={() =>
          props.onFinish?.(750, undefined, {
            rawResults: Object.fromEntries(
              (props.participantIds ?? []).map((id, i) => [id, 750 - i * 10])
            ),
            authoritativeRankedIds: props.participantIds,
          })
        }
      >
        Finish premium race
      </button>
    )
  },
}))
vi.mock('../components/GlassBridgeComp/GlassBridgeComp', () => ({
  default: (props: { premium?: boolean }) => {
    capture.glass(props)
    return <p>{props.premium ? 'Premium bridge' : 'Standard bridge'}</p>
  },
}))

function season() {
  return {
    ...startRun(
      { id: 'human', name: 'You' },
      BETRAYALS_AI_POOL,
      { publicMode: false, realityMode: 'off' },
      { id: 'premium-race', publicSeed: 23, roleSeed: 35 }
    ),
    phase: 'immunity' as const,
  }
}
function challenge(key: string): ChallengeGame {
  return { ...getGame(key)!, play: 'solo', publicResults: false, potTarget: 300 }
}

describe('Betrayals premium competition host', () => {
  beforeEach(() => vi.clearAllMocks())

  it('launches the actual VIP wrapper with the same field and seed, and preserves its authoritative results', async () => {
    const run = season(),
      game = challenge('quickTap')
    const onFinish = vi.fn().mockResolvedValue(true)
    const hook = render(
      <Suspense>
        <BetrayalsChallengeGame run={run} game={game} premiumGames onFinish={onFinish} />
      </Suspense>
    )
    const finish = await screen.findByRole('button', { name: 'Finish premium race' })
    const props = capture.premium.mock.lastCall![0] as GenericMinigameProps
    expect(props.seed).toBe(challengeSeed(run))
    expect(props.participants).toEqual(challengePlayers(run, game))
    const ids = props.participantIds!
    hook.rerender(
      <Suspense>
        <BetrayalsChallengeGame run={run} game={game} premiumGames={false} onFinish={onFinish} />
      </Suspense>
    )
    expect(screen.getByRole('button', { name: 'Finish premium race' })).toBeVisible()
    await act(async () => {
      fireEvent.click(finish)
    })
    expect(onFinish).toHaveBeenCalledWith(750, undefined, {
      betrayalsQuickTapVariant: 'race',
      authoritativeRankedIds: ids,
      rawResults: Object.fromEntries(ids.map((id, i) => [id, 750 - i * 10])),
    })
  })

  it('keeps an in-progress standard competition standard when ownership arrives', async () => {
    const run = season(),
      game = challenge('quickTap'),
      onFinish = vi.fn()
    const view = render(
      <Suspense>
        <BetrayalsChallengeGame run={run} game={game} onFinish={onFinish} />
      </Suspense>
    )
    expect(await screen.findByText('Standard race')).toBeVisible()
    view.rerender(
      <Suspense>
        <BetrayalsChallengeGame run={run} game={game} premiumGames onFinish={onFinish} />
      </Suspense>
    )
    expect(screen.getByText('Standard race')).toBeVisible()
    expect(capture.premium).not.toHaveBeenCalled()
    expect(capture.standard.mock.lastCall![0].seed).toBe(challengeSeed(run))
  })

  it('passes the Crystal Path premium flag using its actual component contract', async () => {
    const run = season(),
      game = challenge('glass_bridge_brutal')
    render(
      <Suspense>
        <BetrayalsChallengeGame run={run} game={game} premiumGames onFinish={vi.fn()} />
      </Suspense>
    )
    expect(await screen.findByText('Premium bridge')).toBeVisible()
    expect(capture.glass.mock.lastCall![0]).toMatchObject({
      premium: true,
      seed: challengeSeed(run),
    })
  })
})

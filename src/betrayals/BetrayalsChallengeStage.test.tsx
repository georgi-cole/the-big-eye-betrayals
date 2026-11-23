import { useContext } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { getGame } from '../minigames/registryBase'
import { BetrayalsChallengeStage } from './BetrayalsChallengeStage'
import { BetrayalsChallengeAccessContext } from './challengeAccessContext'

vi.mock('../components/MinigameHost/MinigameReadyCountdown', () => ({
  MinigameReadyCountdown: ({ onComplete }: { onComplete: () => void }) => (
    <button onClick={onComplete}>Finish countdown</button>
  ),
}))

function Experience() {
  const access = useContext(BetrayalsChallengeAccessContext)
  return <p>{access ? 'Premium competition' : 'Standard competition'}</p>
}

describe('Betrayals premium challenge briefing', () => {
  it('uses the actual VIP duration/instructions even if standard localization metadata is present', () => {
    const game = {
      ...getGame('quickTapSeasons')!,
      instructionKeys: ['fitMeIn.rules.freshBoard'],
    }
    render(
      <BetrayalsChallengeStage title="Night Shield" game={game} premiumGames onForfeit={vi.fn()}>
        <Experience />
      </BetrayalsChallengeStage>
    )
    expect(screen.getByText(/Play three 28-second rounds/)).toBeVisible()
    expect(screen.getByText(/Winter taps lose points/)).toBeVisible()
    expect(screen.getByText(/1m 24s/)).toBeVisible()
    expect(screen.queryByText(/40-second race/)).not.toBeInTheDocument()
  })

  it('freezes the rules accepted at Start, including reference rules and the mounted game', () => {
    const game = getGame('quickTap')!
    const view = (premiumGames: boolean) => (
      <BetrayalsChallengeStage
        title="Immunity"
        game={game}
        premiumGames={premiumGames}
        onForfeit={vi.fn()}
      >
        <Experience />
      </BetrayalsChallengeStage>
    )
    const rendered = render(view(false))
    expect(screen.queryByText(/three 25-second rounds/)).not.toBeInTheDocument()
    rendered.rerender(view(true))
    expect(screen.getByText(/three 25-second rounds/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Start competition' }))
    rendered.rerender(view(false))
    fireEvent.click(screen.getByRole('button', { name: 'Finish countdown' }))
    expect(screen.getByText('Premium competition')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Open minigame menu' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /rules/i }))
    expect(screen.getByText(/three 25-second rounds/)).toBeVisible()
  })
})

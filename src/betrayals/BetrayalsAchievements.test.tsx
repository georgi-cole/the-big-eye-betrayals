import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { BetrayalsAchievements } from './BetrayalsAchievements'

it('counts recorded Betrayals milestones across seasons without counting the same reward twice', () => {
  const victory = 'betrayals:latest:reward:season-winner'
  render(
    <BetrayalsAchievements
      milestones={{
        runId: 'latest',
        dayReached: 9,
        won: true,
        rewards: [
          {
            id: victory,
            code: 'season-winner',
            day: 9,
            ordinal: 1,
            amount: 10_000,
            label: 'Victory',
          },
        ],
      }}
      wallet={{
        balance: 0,
        claimRewards: vi.fn(),
        spend: vi.fn(),
        recordedTransactionIds: [
          victory,
          'betrayals:earlier:reward:season-winner',
          'betrayals:earlier:reward:day:1:survived-night:1',
          'betrayals:earlier:reward:day:2:immunity-win:1',
          'betrayals:earlier:night-shield:2',
          'original:season-winner',
        ],
      }}
    />
  )
  expect(screen.getByText('Season victories').parentElement?.querySelector('dd')).toHaveTextContent(
    '2'
  )
  expect(screen.getByText('Nights survived').parentElement?.querySelector('dd')).toHaveTextContent(
    '1'
  )
  expect(screen.getByText('Immunity wins').parentElement?.querySelector('dd')).toHaveTextContent(
    '1'
  )
  expect(screen.getByText('Castle champion').closest('li')).toHaveTextContent('Earned')
  expect(screen.getByText('Night Shield').closest('li')).toHaveTextContent('Locked')
})

import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RoundTableFeed } from './RoundTableFeed'
import { startRun } from './run'
import type { Run } from './run'

function createRound(): Run {
  return {
    ...startRun(
      { id: 'human', name: 'Georgi' },
      Array.from({ length: 24 }, (_, i) => ({ id: 'guest-' + i, name: 'Guest ' + i })),
      { publicMode: false, realityMode: 'off' },
      { id: 'test-table', roleSeed: 71, publicSeed: 1142 }
    ),
    phase: 'round-table',
  }
}

describe('Round Table broadcast', () => {
  it('reveals nominations before letting the player make a case', () => {
    const run = createRound()
    const onSway = vi.fn()
    render(<RoundTableFeed run={run} onSway={onSway} />)
    expect(screen.queryByRole('button', { name: 'Make a case' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show all arguments' }))

    const chat = screen.getByRole('log', { name: 'Round Table conversation' })
    expect(within(chat).getAllByRole('article')).toHaveLength(24)
    const candidate = run.seats[1].id
    fireEvent.change(screen.getByRole('combobox'), { target: { value: candidate } })
    fireEvent.click(screen.getByRole('button', { name: 'Make a case' }))
    expect(onSway).toHaveBeenCalledWith({ targetId: candidate, tone: 'careful' })
  })

  it('holds the revote until the count is shown and summarizes a large tie', () => {
    const run = createRound()
    const nominees = run.seats.slice(1, 11)
    const ballots = nominees.map(({ id }, index) => ({
      voterId: run.seats[index + 11].id,
      targetId: id,
    }))
    run.tableCount = { round: 1, ballots, tiedIds: nominees.map(({ id }) => id) }
    const onCountComplete = vi.fn()
    const view = render(<RoundTableFeed run={run} onCountComplete={onCountComplete} />)
    expect(screen.queryByText('10-way tie for the lead')).not.toBeInTheDocument()
    expect(onCountComplete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Show full count' }))

    expect(screen.getByText('10-way tie for the lead')).toBeVisible()
    expect(screen.queryByRole('list', { name: 'Current vote leaders' })).not.toBeInTheDocument()
    expect(
      screen.getByText('Only the 10 tied leaders can receive votes in the next round.')
    ).toBeVisible()
    expect(onCountComplete).toHaveBeenCalledTimes(1)

    view.rerender(<RoundTableFeed run={run} onCountComplete={onCountComplete} />)
    expect(onCountComplete).toHaveBeenCalledTimes(1)
  })
})

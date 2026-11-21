import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RoundTableDiscussion } from './RoundTableDiscussion'
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
  afterEach(() => vi.restoreAllMocks())

  it('lets the player read the transcript or make a case immediately', () => {
    vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (
      this: HTMLDialogElement
    ) {
      this.open = true
    })
    const run = createRound()
    const onSway = vi.fn()
    render(
      <RoundTableDiscussion
        run={run}
        open
        art="/council.jpg"
        onBack={vi.fn()}
        onAskWitness={vi.fn()}
        onSway={onSway}
      />
    )
    expect(screen.getByRole('button', { name: 'Take the floor' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Read all' }))

    const chat = screen.getByRole('log', { name: 'Round Table conversation' })
    expect(within(chat).getAllByRole('article')).toHaveLength(24)
    const candidate = run.seats[1]
    fireEvent.click(screen.getByRole('button', { name: 'Take the floor' }))
    fireEvent.click(screen.getByRole('button', { name: candidate.name }))
    expect(screen.getByRole('button', { name: candidate.name })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Make a case' }))
    expect(onSway).toHaveBeenCalledWith({ targetId: candidate.id, tone: 'careful' })
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
    expect(screen.getByText('Runoff among 10 tied guests')).toBeVisible()
    expect(onCountComplete).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Next vote totals' }))
    const firstPage = within(screen.getByRole('list', { name: 'More vote totals' }))
    expect(firstPage.getAllByLabelText('1 vote')).toHaveLength(5)
    fireEvent.click(screen.getByRole('button', { name: 'Next vote totals' }))
    expect(screen.getByRole('button', { name: 'Next vote totals' })).toBeDisabled()
    expect(
      within(screen.getByRole('list', { name: 'More vote totals' })).getAllByLabelText('1 vote')
    ).toHaveLength(5)
    fireEvent.click(screen.getByRole('button', { name: 'Previous vote totals' }))
    fireEvent.click(screen.getByRole('button', { name: 'Previous vote totals' }))
    expect(screen.getByText('10-way tie for the lead')).toBeVisible()

    view.rerender(<RoundTableFeed run={run} onCountComplete={onCountComplete} />)
    expect(onCountComplete).toHaveBeenCalledTimes(1)
  })
})

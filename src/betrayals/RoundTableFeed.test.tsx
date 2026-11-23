import { act, fireEvent, render, screen, within } from '@testing-library/react'
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
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

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
    expect(within(chat).getAllByRole('article')).toHaveLength(4)
    const candidate = run.seats[1]
    fireEvent.click(screen.getByRole('button', { name: 'Take the floor' }))
    expect(screen.queryByRole('button', { name: 'Ask for a reason' })).not.toBeInTheDocument()
    const painting = screen.getByRole('button', { name: candidate.name })
    expect(painting.querySelector('.betrayals-painting__frame')).toHaveAttribute(
      'src',
      expect.stringContaining('dressing-room/antique-gold-frame.webp')
    )
    fireEvent.click(painting)
    expect(
      document.querySelector('.betrayals-gallery__subject .betrayals-painting__frame')
    ).toHaveAttribute('src', expect.stringContaining('dressing-room/antique-gold-frame.webp'))
    const change = screen.getByRole('button', { name: 'Choose another guest' })
    expect(change).toHaveFocus()
    fireEvent.click(change)
    fireEvent.click(screen.getByRole('button', { name: candidate.name }))
    fireEvent.click(screen.getByRole('button', { name: 'Ask for a reason' }))
    expect(onSway).toHaveBeenLastCalledWith({
      targetId: candidate.id,
      tone: 'careful',
      stance: 'question',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Defend' }))
    expect(onSway).toHaveBeenLastCalledWith({
      targetId: candidate.id,
      tone: 'careful',
      stance: 'defend',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Make a case' }))
    expect(onSway).toHaveBeenCalledWith({ targetId: candidate.id, tone: 'careful' })
  })

  it('holds the revote until the count is shown and summarizes a large tie', () => {
    vi.useFakeTimers()
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
    const reveal = within(screen.getByRole('dialog', { name: 'Round Table ballot reveal' }))
    fireEvent.click(reveal.getByRole('button', { name: 'Reveal first votes' }))
    act(() => vi.advanceTimersByTime(12_000))
    expect(reveal.getByText('3 / 10')).toBeVisible()
    expect(onCountComplete).not.toHaveBeenCalled()
    fireEvent.click(reveal.getByRole('button', { name: 'Next votes' }))
    expect(reveal.getByText('6 / 10')).toBeVisible()
    fireEvent.click(reveal.getByRole('button', { name: 'View all votes' }))
    const review = within(screen.getByRole('dialog', { name: 'All Round Table votes' }))
    expect(
      within(review.getByRole('list', { name: 'All ballots' })).getAllByRole('listitem')
    ).toHaveLength(10)
    fireEvent.click(review.getByRole('button', { name: 'Return to vote totals' }))

    expect(screen.getByText('10-way tie for the lead')).toBeVisible()
    expect(screen.queryByRole('list', { name: 'Current vote leaders' })).not.toBeInTheDocument()
    expect(screen.getByText('Runoff', { exact: true })).toBeVisible()
    expect(onCountComplete).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'View all votes' }))
    const allVotes = within(screen.getByRole('dialog', { name: 'All Round Table votes' }))
    const ranking = within(allVotes.getByRole('list', { name: 'All vote totals' }))
    expect(ranking.getAllByLabelText('1 vote')).toHaveLength(10)
    fireEvent.click(screen.getByRole('button', { name: 'Return to vote totals' }))
    view.rerender(<RoundTableFeed run={run} onCountComplete={onCountComplete} />)
    expect(onCountComplete).toHaveBeenCalledTimes(1)
  })
})

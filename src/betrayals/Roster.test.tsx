import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BETRAYALS_AI_POOL } from './cast'
import { Roster } from './Roster'
import { startRun, viewFor } from './run'
import type { Run } from './run'

describe('Betrayals roster', () => {
  it('fits the canonical cast into 25 seats and displays a Night Shield privately', () => {
    const run = startRun(
      { id: 'human', name: 'Georgi' },
      BETRAYALS_AI_POOL,
      { publicMode: true, realityMode: 'off' },
      { id: 'test', roleSeed: 81, publicSeed: 45 }
    )
    const recipient = run.seats[1]
    const roundTable: Run = {
      ...run,
      phase: 'round-table',
      immunityId: run.seats[2].id,
      publicShield: { id: run.seats[3].id, day: 1 },
      private: { ...run.private, nightShieldIds: [run.humanId, recipient.id] },
    }
    const onSelect = vi.fn()
    const roster = render(
      <Roster view={viewFor(roundTable, run.humanId)} humanId={run.humanId} onSelect={onSelect} />
    )
    const grid = screen.getByRole('list', { name: 'Contestant roster' })
    expect(within(grid).getAllByRole('button')).toHaveLength(25)
    expect(within(grid).getByRole('button', { name: 'Georgi, Night Shield' })).toBeInTheDocument()
    expect(within(grid).getByRole('button', { name: recipient.name })).toBeInTheDocument()
    expect(within(grid).getByRole('button', { name: /Full Immunity/ })).toBeInTheDocument()
    expect(within(grid).getByRole('button', { name: /Public Shield/ })).toBeInTheDocument()
    roster.rerender(
      <Roster view={viewFor(roundTable, null)} humanId={run.humanId} onSelect={onSelect} />
    )
    expect(within(grid).queryByRole('button', { name: /Night Shield/ })).toBeNull()
  })

  it('keeps eliminated seats in place and only names a role once revealed', () => {
    const run = startRun(
      { id: 'human', name: 'Georgi' },
      BETRAYALS_AI_POOL,
      { publicMode: false, realityMode: 'off' },
      { id: 'test', roleSeed: 81, publicSeed: 45 }
    )
    const [, nightExit, blindBanishment, revealedBanishment] = run.seats
    const onSelect = vi.fn()
    const roster = render(
      <Roster view={viewFor(run, run.humanId)} humanId={run.humanId} onSelect={onSelect} />
    )
    const grid = within(screen.getByRole('list', { name: 'Contestant roster' }))
    const original = grid.getAllByRole('button')
    const exits: Record<string, Run['seats'][number]['exit']> = {
      [nightExit.id]: { cause: 'night', day: 1 },
      [blindBanishment.id]: { cause: 'banished', day: 2 },
      [revealedBanishment.id]: { cause: 'banished', day: 3, revealedRole: 'loyal' },
    }
    const after = { ...run, seats: run.seats.map((seat) => ({ ...seat, exit: exits[seat.id] })) }
    roster.rerender(
      <Roster view={viewFor(after, run.humanId)} humanId={run.humanId} onSelect={onSelect} />
    )

    const updated = grid.getAllByRole('button')
    expect(updated).toHaveLength(25)
    updated.forEach((button, index) => expect(button).toBe(original[index]))
    expect(updated[1]).toHaveAccessibleName(`${nightExit.name}, Eliminated at Night`)
    expect(updated[2]).toHaveAccessibleName(`${blindBanishment.name}, Banished`)
    expect(updated[3]).toHaveAccessibleName(`${revealedBanishment.name}, Banished, Loyal`)
    expect(updated[2]).not.toHaveAttribute('data-role')
    expect(updated[3]).toHaveAttribute('data-role', 'loyal')

    fireEvent.click(updated[2])
    expect(onSelect).toHaveBeenCalledWith(blindBanishment.id)
    onSelect.mockClear()
    roster.rerender(
      <Roster
        view={viewFor(after, run.humanId)}
        humanId={run.humanId}
        onSelect={onSelect}
        selectableIds={[run.humanId]}
      />
    )
    expect(updated[2]).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(updated[2])
    expect(onSelect).not.toHaveBeenCalled()
  })
})

import { render, screen, within } from '@testing-library/react'
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
    const grid = screen.getByRole('list', { name: 'Active contestants' })
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
})

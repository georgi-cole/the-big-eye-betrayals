import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BetrayalsSocialPanel } from './BetrayalsSocialPanel'
import type { SocialEntry } from './run'

const prospects = [
  { id: 'human', name: 'Georgi' },
  { id: 'ren', name: 'Ren' },
  { id: 'sable', name: 'Sable' },
  { id: 'opal', name: 'Opal' },
]
const resources = { energy: 5, influence: 20, info: 100 }

describe('Betrayals private conversations', () => {
  beforeEach(() => {
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

  it('chooses a contact independently and sends a vote plan to that contact', () => {
    const onMove = vi.fn()
    render(
      <BetrayalsSocialPanel
        actorId="human"
        prospects={prospects}
        resources={resources}
        day={2}
        onClose={vi.fn()}
        onMove={onMove}
      />
    )

    const roster = screen.getByRole('region', { name: 'Player roster' })
    expect(within(roster).queryByRole('button', { name: /Georgi/ })).toBeNull()
    fireEvent.click(within(roster).getByRole('button', { name: /Ren/ }))
    expect(screen.getByRole('heading', { name: 'Ren' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Deselect Ren and show roster' }))
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Player roster' })).getByRole('button', {
        name: /Sable/,
      })
    )
    expect(screen.queryByRole('group', { name: 'Vote target' })).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'Strategic' }))
    expect(screen.queryByRole('button', { name: /Build trust/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Hear a suspicion/ }))
    expect(onMove).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }))
    expect(onMove).toHaveBeenLastCalledWith('question', undefined, 'sable')

    fireEvent.click(screen.getByRole('button', { name: /Plan a vote/ }))
    const target = screen.getByRole('group', { name: 'Vote target' })
    expect(within(target).queryByRole('button', { name: /Sable/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Execute' })).toBeDisabled()
    fireEvent.click(within(target).getByRole('button', { name: /Opal/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }))
    expect(onMove).toHaveBeenLastCalledWith('vote-plan', 'opal', 'sable')
    expect(screen.queryByRole('group', { name: 'Vote target' })).toBeNull()
  })

  it('lets the player browse guests and their own private notes after the season', () => {
    const onMove = vi.fn()
    const conversation: SocialEntry[] = [
      { actorId: 'human', recipientId: 'ren', day: 2, kind: 'question', suspectId: 'ivy' },
      { actorId: 'opal', recipientId: 'sable', day: 2, kind: 'question', suspectId: 'human' },
    ]
    render(
      <BetrayalsSocialPanel
        actorId="human"
        prospects={prospects}
        cast={[...prospects, { id: 'ivy', name: 'Ivy' }]}
        resources={resources}
        day={2}
        phase="settled"
        conversation={conversation}
        recent={conversation[1]}
        onClose={vi.fn()}
        onMove={onMove}
      />
    )

    const roster = screen.getByRole('region', { name: 'Player roster' })
    expect(within(roster).getAllByRole('button')).toHaveLength(3)
    expect(within(roster).queryByRole('button', { name: /Ivy/ })).toBeNull()
    fireEvent.click(within(roster).getByRole('button', { name: /Ren/ }))
    expect(screen.getByRole('heading', { name: 'Ren' })).toBeInTheDocument()
    expect(
      screen.getByText('The season has ended. You can still browse your relationships.')
    ).toBeVisible()
    expect(screen.queryByRole('region', { name: 'Social actions' })).toBeNull()
    fireEvent.keyDown(
      screen.getByRole('group', { name: 'Browse guests with left and right arrows' }),
      {
        key: 'ArrowRight',
      }
    )
    expect(screen.getByRole('heading', { name: 'Sable' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Deselect Sable and show roster' }))
    expect(screen.getByRole('region', { name: 'Player roster' })).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('Ren suspects Ivy.')
    expect(screen.queryByText('Opal suspects Georgi.')).toBeNull()
    const history = screen.getByRole('region', { name: 'Private notes' })
    fireEvent.click(within(history).getByRole('button', { name: 'Dismiss current result' }))
    expect(within(history).queryByText('Ren suspects Ivy.')).toBeNull()
    fireEvent.click(within(history).getByRole('button', { name: 'History' }))
    expect(within(history).getByText('Ren suspects Ivy.')).toBeInTheDocument()
    expect(within(history).queryByText('Opal suspects Georgi.')).toBeNull()
    expect(onMove).not.toHaveBeenCalled()
  })

  it('keeps Inbox in the dock and closes on Escape or the back control', () => {
    const onClose = vi.fn()
    render(
      <BetrayalsSocialPanel
        actorId="human"
        prospects={prospects}
        resources={resources}
        onClose={onClose}
        onMove={vi.fn()}
      />
    )
    expect(screen.queryByRole('button', { name: /Incoming interactions/ })).not.toBeInTheDocument()
    fireEvent(
      screen.getByRole('dialog', { name: 'Social' }),
      new Event('cancel', { cancelable: true })
    )
    expect(onClose).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Close social panel' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})

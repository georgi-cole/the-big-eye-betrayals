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
        contact={prospects[1]}
        prospects={prospects}
        actionsLeft={3}
        day={2}
        onClose={vi.fn()}
        onMove={onMove}
      />
    )

    expect(screen.getByRole('heading', { name: 'Ren' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Deselect Ren and show roster' }))
    const roster = screen.getByRole('region', { name: 'Player roster' })
    expect(within(roster).queryByRole('button', { name: /Georgi/ })).toBeNull()
    fireEvent.click(within(roster).getByRole('button', { name: /Sable/ }))
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

  it('keeps only the player’s private notes readable after the social window', () => {
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
        actionsLeft={3}
        day={2}
        canAct={false}
        conversation={conversation}
        recent={conversation[1]}
        onClose={vi.fn()}
        onMove={onMove}
      />
    )

    expect(screen.queryByRole('button', { name: /Build trust/ })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Player roster' })).toBeNull()
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

  it('exposes the incoming inbox and closes the same way on Escape and the back control', () => {
    const onClose = vi.fn()
    const onOpenIncoming = vi.fn()
    render(
      <BetrayalsSocialPanel
        actorId="human"
        prospects={prospects}
        actionsLeft={3}
        incomingCount={2}
        onClose={onClose}
        onOpenIncoming={onOpenIncoming}
        onMove={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Incoming interactions, 2 pending' }))
    expect(onOpenIncoming).toHaveBeenCalledOnce()
    fireEvent(
      screen.getByRole('dialog', { name: 'Social' }),
      new Event('cancel', { cancelable: true })
    )
    expect(onClose).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Close social panel' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})

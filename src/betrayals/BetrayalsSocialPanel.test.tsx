import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BetrayalsSocialPanel } from './BetrayalsSocialPanel'
import type { SocialEntry } from './run'

const prospects = [
  { id: 'human', name: 'Georgi' },
  { id: 'ren', name: 'Ren' },
  { id: 'sable', name: 'Sable' },
  { id: 'opal', name: 'Opal' },
]

describe('Betrayals private conversations', () => {
  it('chooses a contact independently and sends a vote plan to that contact', () => {
    const onMove = vi.fn()
    render(
      <BetrayalsSocialPanel
        actorId="human"
        contact={prospects[1]}
        prospects={prospects}
        actionsLeft={3}
        day={2}
        onMove={onMove}
      />
    )

    const contact = screen.getByLabelText('Speak with')
    expect(contact).toHaveValue('ren')
    expect(within(contact).queryByRole('option', { name: 'Georgi' })).toBeNull()
    expect(screen.queryByLabelText('Vote target')).toBeNull()
    fireEvent.change(contact, { target: { value: 'sable' } })
    fireEvent.click(screen.getByRole('button', { name: 'Hear a suspicion' }))
    expect(onMove).toHaveBeenLastCalledWith('question', undefined, 'sable')

    fireEvent.click(screen.getByRole('button', { name: 'Plan a vote' }))
    const target = screen.getByLabelText('Vote target')
    expect(within(target).queryByRole('option', { name: 'Sable' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Send plan' })).toBeDisabled()
    fireEvent.change(target, { target: { value: 'opal' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send plan' }))
    expect(onMove).toHaveBeenLastCalledWith('vote-plan', 'opal', 'sable')
    expect(screen.queryByLabelText('Vote target')).toBeNull()
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
        onMove={onMove}
      />
    )

    expect(screen.queryByRole('button', { name: 'Build trust' })).toBeNull()
    expect(screen.queryByLabelText('Speak with')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('Ren suspects Ivy.')
    expect(screen.queryByText('Opal suspects Georgi.')).toBeNull()
    expect(screen.getByText('Private notes')).toBeInTheDocument()
    expect(onMove).not.toHaveBeenCalled()
  })
})

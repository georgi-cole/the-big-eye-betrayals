import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BetrayalsIncomingInteractions } from './BetrayalsIncomingInteractions'
import type { IncomingInteraction } from './incoming'

const offer: IncomingInteraction = {
  id: 'alliance',
  kind: 'alliance',
  speaker: { id: 'sable', name: 'Sable' },
  text: 'Would you be willing to look out for each other?',
}

const vote: IncomingInteraction = {
  id: 'vote',
  kind: 'vote-plan',
  speaker: { id: 'ren', name: 'Ren' },
  target: { id: 'opal', name: 'Opal' },
  text: 'I want to vote for Opal.',
}

describe('Betrayals incoming inbox', () => {
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

  it('shows separate alliance decisions and messages with the original inbox chrome', () => {
    const onMove = vi.fn()
    function Inbox() {
      const [items, setItems] = useState([offer, vote])
      return (
        <BetrayalsIncomingInteractions
          interactions={items}
          onClose={() => {}}
          onRespond={(id, response) => {
            onMove(id, response)
            if (response === 'request-shield' || response === 'ask-shield-plans') return
            setItems((current) =>
              current.map((item) => (item.id === id ? { ...item, response } : item))
            )
          }}
        />
      )
    }

    render(<Inbox />)
    const inbox = within(screen.getByRole('dialog', { name: 'Incoming interactions' }))
    expect(inbox.getByTestId('incoming-icon-inbox')).toBeInTheDocument()
    expect(inbox.getByText('2 to answer')).toBeVisible()
    const alliances = within(
      inbox.getByRole('region', { name: 'Alliance proposals and decisions' })
    )
    expect(alliances.getByRole('button', { name: 'Work together' })).toBeVisible()
    const messages = within(inbox.getByRole('region', { name: 'Messages' }))
    fireEvent.click(messages.getByRole('button', { name: 'Hear them out' }))
    expect(onMove).toHaveBeenCalledWith(vote.id, 'listen')
    expect(messages.getByText('Ren shared their suspicion of Opal.')).toBeVisible()
    expect(messages.queryByRole('button', { name: 'Agree to the plan' })).toBeNull()
    expect(inbox.getByText('1 to answer')).toBeVisible()
  })

  it('places earlier replies in expandable history and exposes the original back control', () => {
    const onClose = vi.fn()
    const onRespond = vi.fn()
    render(
      <BetrayalsIncomingInteractions
        interactions={[{ ...offer, response: 'dismiss' }]}
        onClose={onClose}
        onRespond={onRespond}
      />
    )
    expect(screen.getByText('All caught up')).toBeVisible()
    fireEvent.click(screen.getByText('History · 1'))
    expect(screen.getByText('You let Sable go.')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Close inbox' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(onRespond).not.toHaveBeenCalled()
  })
})

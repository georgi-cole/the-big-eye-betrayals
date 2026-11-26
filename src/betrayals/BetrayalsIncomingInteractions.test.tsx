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
            if (response !== 'engage' && response !== 'listen' && response !== 'dismiss') return
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

  it('shows numeric costs with matching resource symbols and places Intel by the message heading or outcome', () => {
    const onOpenIntel = vi.fn()
    const moment: IncomingInteraction = {
      id: 'castle',
      kind: 'castle-moment',
      speaker: offer.speaker,
      text: 'Someone was in the library.',
      castleMoment: {
        id: 'castle',
        required: false,
        guestId: offer.speaker.id,
        title: 'Over cocktails',
        opening: 'Someone was in the library.',
        options: [
          {
            action: 'ask-about',
            label: 'Ask who was there',
            cost: { energy: 1, influence: 2, info: 0 },
            reason: undefined,
            shortfall: 'influence',
          },
        ],
        callback: undefined,
        callbackGuestId: undefined,
        reportGuestId: undefined,
        reportText: undefined,
        response: undefined,
      },
    }
    const props = { onClose: vi.fn(), onRespond: vi.fn(), onOpenIntel }
    const pending = {
      ...moment,
      castleMoment: { ...moment.castleMoment!, callbackGuestId: 'sable' },
    }
    const { rerender } = render(
      <BetrayalsIncomingInteractions interactions={[pending]} {...props} />
    )
    const pendingIntel = screen.getByRole('button', { name: /^Open Intel$/ })
    expect(pendingIntel.closest('.betrayals-inbox__card-heading')).toHaveTextContent('Sable')
    expect(screen.queryByRole('button', { name: 'Pass' })).not.toBeInTheDocument()
    fireEvent.click(pendingIntel)
    expect(onOpenIntel).toHaveBeenLastCalledWith('sable')
    const replyButton = screen.getByRole('button', { name: /^Ask who was there/ })
    const reply = within(replyButton)
    expect(reply.getByRole('img', { name: '1 Energy' })).toHaveTextContent('⚡ 1')
    expect(reply.getByRole('img', { name: '2 Influence' })).toHaveTextContent('🗣️ 2')
    expect(reply.queryByText(/Requires/)).not.toBeInTheDocument()
    fireEvent.click(replyButton)
    const shortage = within(screen.getByRole('dialog', { name: 'Not enough Influence' }))
    expect(shortage.getByText('This reply costs 2 Influence.')).toBeVisible()
    expect(shortage.queryByRole('button', { name: /Watch ad/ })).not.toBeInTheDocument()
    expect(props.onRespond).not.toHaveBeenCalled()
    fireEvent.click(shortage.getByRole('button', { name: 'Back to Inbox' }))
    expect(reply.getByTitle('Unlock Reality Mode')).toBeInTheDocument()
    rerender(<BetrayalsIncomingInteractions interactions={[moment]} hasRealityMode {...props} />)
    expect(screen.queryByTitle('Unlock Reality Mode')).not.toBeInTheDocument()
    rerender(
      <BetrayalsIncomingInteractions
        interactions={[
          {
            ...moment,
            response: 'engage',
            castleMoment: {
              ...moment.castleMoment!,
              options: [],
              response: 'observed',
              reportGuestId: 'opal',
              callbackGuestId: 'sable',
            },
          },
        ]}
        {...props}
      />
    )
    fireEvent.click(screen.getByText('History · 1'))
    expect(screen.queryByText(/Resolved/)).not.toBeInTheDocument()
    const intel = screen.getByRole('button', { name: 'Open in Intel' })
    expect(within(intel).getByTitle('Unlock My Pulse')).toBeInTheDocument()
    expect(intel.parentElement?.parentElement).toHaveTextContent('Your sighting is in Intel.')
    fireEvent.click(intel)
    expect(onOpenIntel).toHaveBeenCalledWith('opal')
    const followUp = screen.getByRole('button', { name: 'Continue in Intel' })
    expect(followUp.closest('.inbox-item__feedback')).toBe(intel.closest('.inbox-item__feedback'))
    fireEvent.click(followUp)
    expect(onOpenIntel).toHaveBeenLastCalledWith('sable')
  })
})

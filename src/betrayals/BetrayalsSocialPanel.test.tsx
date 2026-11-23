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

  it('shows general moves and alliance shortcuts without a guest selected', () => {
    const onGeneralMove = vi.fn()
    render(
      <BetrayalsSocialPanel
        hasRealityMode
        hasMyPulse
        actorId="human"
        prospects={prospects}
        resources={resources}
        phase="social"
        onClose={vi.fn()}
        onMove={vi.fn()}
        onGeneralMove={onGeneralMove}
        conversation={[
          { actorId: 'human', recipientId: 'opal', kind: 'alliance', day: 1, accepted: true },
        ]}
      />
    )
    const general = within(screen.getByRole('region', { name: 'General actions' }))
    const roster = screen.getByRole('region', { name: 'Player roster' })
    expect(
      roster.compareDocumentPosition(screen.getByRole('region', { name: 'General actions' })) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(general.getByRole('button', { name: /Lay Low/ })).toBeVisible()
    expect(general.getByRole('button', { name: /Explore the Castle/ })).toBeVisible()
    expect(general.getByRole('button', { name: /Eavesdrop/ })).toBeVisible()
    expect(general.getByRole('button', { name: /Found an alliance/ })).toBeVisible()
    fireEvent.click(general.getByRole('button', { name: /Group Chat/ }))
    const picker = within(general.getByRole('group', { name: 'Group Chat guests' }))
    const execute = general.getByRole('button', { name: 'Execute general action' })
    fireEvent.click(picker.getByRole('button', { name: /Ren/ }))
    expect(execute).toBeDisabled()
    fireEvent.click(picker.getByRole('button', { name: /Sable/ }))
    fireEvent.click(execute)
    expect(onGeneralMove).toHaveBeenCalledWith('group-chat', ['ren', 'sable'])
    const alliances = within(screen.getByRole('region', { name: 'Your alliances' }))
    fireEvent.click(alliances.getByRole('button', { name: /Opal/ }))
    expect(screen.queryByRole('region', { name: 'General actions' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Opal' })).toBeVisible()
    expect(screen.getByRole('button', { name: /Propose Personal Pact/ })).toHaveAttribute(
      'aria-disabled',
      'true'
    )
  })

  it('chooses a contact independently and sends a vote plan to that contact', () => {
    const onMove = vi.fn()
    render(
      <BetrayalsSocialPanel
        hasRealityMode
        hasMyPulse
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
        hasRealityMode
        hasMyPulse
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
    expect(screen.getByRole('status')).toHaveTextContent('Ren wanted to compare notes about Ivy.')
    expect(screen.queryByText('Opal wanted to compare notes about Georgi.')).toBeNull()
    const history = screen.getByRole('region', { name: 'Private notes' })
    fireEvent.click(within(history).getByRole('button', { name: 'Dismiss current result' }))
    expect(within(history).queryByText('Ren wanted to compare notes about Ivy.')).toBeNull()
    fireEvent.click(within(history).getByRole('button', { name: /^History/ }))
    expect(within(history).getByText('Ren wanted to compare notes about Ivy.')).toBeInTheDocument()
    expect(within(history).queryByText('Opal wanted to compare notes about Georgi.')).toBeNull()
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

  it('offers locked advanced moves while a free player can still have a basic conversation', () => {
    const onMove = vi.fn()
    const onUpgrade = vi.fn()
    const onGeneralMove = vi.fn()
    render(
      <BetrayalsSocialPanel
        actorId="human"
        prospects={prospects}
        resources={resources}
        onClose={vi.fn()}
        onMove={onMove}
        onGeneralMove={onGeneralMove}
        onUpgrade={onUpgrade}
      />
    )
    const general = within(screen.getByRole('region', { name: 'General actions' }))
    fireEvent.click(general.getByRole('button', { name: /Group Chat/ }))
    expect(onUpgrade).toHaveBeenLastCalledWith('realityMode')
    expect(onGeneralMove).not.toHaveBeenCalled()
    expect(general.queryByRole('group', { name: 'Group Chat guests' })).not.toBeInTheDocument()
    fireEvent.click(general.getByRole('button', { name: /Lay Low/ }))
    fireEvent.click(general.getByRole('button', { name: 'Execute general action' }))
    expect(onGeneralMove).toHaveBeenCalledWith('lay-low', [])

    fireEvent.click(
      within(screen.getByRole('region', { name: 'Player roster' })).getByRole('button', {
        name: /Ren/,
      })
    )
    fireEvent.click(screen.getByRole('button', { name: /Build trust/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }))
    expect(onMove).toHaveBeenCalledWith('rapport', undefined, 'ren')
    onMove.mockClear()
    fireEvent.click(screen.getByRole('tab', { name: 'Strategic' }))
    fireEvent.click(screen.getByRole('button', { name: /Plan a vote/ }))
    expect(onUpgrade).toHaveBeenLastCalledWith('realityMode')
    expect(screen.getByRole('button', { name: 'Execute' })).toBeDisabled()
    expect(onMove).not.toHaveBeenCalled()
  })
})

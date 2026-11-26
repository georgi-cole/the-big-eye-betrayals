import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RoundTableDiscussion } from './RoundTableDiscussion'
import { startRun, type Run } from './run'

function discussionRun(): Run {
  const run = startRun(
    { id: 'human', name: 'Georgi' },
    Array.from({ length: 24 }, (_, index) => ({ id: `guest-${index}`, name: `Guest ${index}` })),
    { publicMode: false, realityMode: 'off' },
    { id: 'table-access', roleSeed: 42, publicSeed: 28 }
  )
  const [, suspect, pitch, source, witness, relay] = run.seats
  return {
    ...run,
    phase: 'round-table',
    witnessLead: {
      day: 1,
      suspectId: suspect.id,
      pitchId: pitch.id,
      sourceId: source.id,
      witnessId: witness.id,
      relayId: relay.id,
      promised: true,
    },
    investigation: {
      incidents: [],
      notes: {},
      reports: [
        {
          id: 'intel:1',
          day: 1,
          guestId: suspect.id,
          method: 'ask',
          access: 'firsthand',
          speakerId: source.id,
          claim: { day: 1, behavior: 'lobbied', topicId: pitch.id },
        },
      ],
      watches: [],
      witnesses: [{ day: 1, reportId: 'intel:1', accepted: true }],
      shares: [],
      saved: [],
      votes: [],
    },
  }
}

describe('Round Table premium interactions', () => {
  beforeEach(() => {
    vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (
      this: HTMLDialogElement
    ) {
      this.setAttribute('open', '')
    })
    vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (
      this: HTMLDialogElement
    ) {
      this.removeAttribute('open')
    })
  })

  it('keeps the discussion, careful contributions and voting free while advanced buttons open the offer', () => {
    const run = discussionRun()
    const onSway = vi.fn()
    const onUpgrade = vi.fn()
    render(
      <RoundTableDiscussion
        run={run}
        open
        art="/table.webp"
        reducedMotion
        onBack={vi.fn()}
        onAskWitness={vi.fn()}
        onSway={onSway}
        onUpgrade={onUpgrade}
      />
    )
    expect(screen.getByRole('log', { name: 'Round Table conversation' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Take the floor' }))
    expect(screen.getByRole('button', { name: /Reality Mode/ })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Voting intel' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Present an account/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: run.seats[1].name }))
    fireEvent.click(screen.getByRole('button', { name: 'Ask for a reason' }))
    expect(onSway).toHaveBeenLastCalledWith({
      targetId: run.seats[1].id,
      tone: 'careful',
      stance: 'question',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Make a case' }))
    expect(onSway).toHaveBeenLastCalledWith({ targetId: run.seats[1].id, tone: 'careful' })
    onSway.mockClear()
    fireEvent.click(screen.getByRole('button', { name: /Defend/ }))
    fireEvent.click(screen.getByRole('button', { name: /Press hard/ }))
    expect(onUpgrade).toHaveBeenCalledTimes(2)
    expect(onSway).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Voting' }))
    expect(onSway).toHaveBeenCalledWith(null)
  })

  it('unlocks evidence and advanced tactics for Reality owners and removes them if access changes', () => {
    const run = discussionRun()
    const props = {
      run,
      open: true,
      art: '/table.webp',
      reducedMotion: true,
      onBack: vi.fn(),
      onAskWitness: vi.fn(),
      onSway: vi.fn(),
      onUpgrade: vi.fn(),
    }
    const view = render(<RoundTableDiscussion {...props} hasRealityMode />)
    fireEvent.click(screen.getByRole('button', { name: 'Take the floor' }))
    expect(screen.getByRole('region', { name: 'Voting intel' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Defend' }))
    expect(props.onSway).toHaveBeenLastCalledWith({
      targetId: run.seats[1].id,
      tone: 'careful',
      stance: 'defend',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Press hard' }))
    expect(props.onSway).toHaveBeenLastCalledWith({ targetId: run.seats[1].id, tone: 'forceful' })
    fireEvent.click(screen.getByText('Present an account (1)'))
    fireEvent.click(screen.getByRole('button', { name: 'Cite account' }))
    expect(props.onSway).toHaveBeenLastCalledWith({
      targetId: run.seats[1].id,
      tone: 'careful',
      investigation: { reportId: 'intel:1' },
    })
    fireEvent.click(screen.getByRole('button', { name: `Call ${run.seats[4].name}` }))
    expect(props.onSway).toHaveBeenLastCalledWith({
      targetId: run.seats[1].id,
      tone: 'careful',
      evidence: 'call-witness',
    })
    expect(props.onUpgrade).not.toHaveBeenCalled()

    view.rerender(<RoundTableDiscussion {...props} hasRealityMode={false} />)
    props.onSway.mockClear()
    expect(screen.queryByRole('region', { name: 'Voting intel' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cite account' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Defend/ }))
    expect(props.onUpgrade).toHaveBeenCalledTimes(1)
    expect(props.onSway).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Voting' }))
    expect(props.onSway).toHaveBeenCalledWith(null)
  })
})

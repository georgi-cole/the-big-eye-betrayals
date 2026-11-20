import { useState } from 'react'
import type { Contestant, SocialEntry } from './run'
import { askedToday, DAILY_ACTIONS, hasAlliance, latestPact, rapport } from './social'
import './betrayals-social.css'

const actions: { kind: SocialEntry['kind']; label: string; mark: string }[] = [
  { kind: 'rapport', label: 'Build trust', mark: '◇' },
  { kind: 'question', label: 'Hear a suspicion', mark: '?' },
  { kind: 'alliance', label: 'Propose an alliance', mark: '∞' },
  { kind: 'vote-plan', label: 'Plan a vote', mark: '✦' },
]

type Props = {
  actorId: string
  contact?: Contestant
  prospects: readonly Contestant[]
  cast?: readonly Contestant[]
  actionsLeft: number
  day?: number
  canAct?: boolean
  conversation?: readonly SocialEntry[]
  recent?: SocialEntry
  onContactChange?: (id: string) => void
  onMove: (kind: SocialEntry['kind'], suspectId: string | undefined, contactId: string) => void
}

function exchangeText(
  entry: SocialEntry,
  actorId: string,
  label: (id: string | undefined) => string
) {
  const outgoing = entry.actorId === actorId
  const person = label(outgoing ? entry.recipientId : entry.actorId)
  switch (entry.kind) {
    case 'rapport':
      return 'You built trust with ' + person + '.'
    case 'question':
      return person + ' suspects ' + label(entry.suspectId) + '.'
    case 'alliance':
      if (entry.accepted) return 'You formed an alliance with ' + person + '.'
      return outgoing
        ? person + ' needs more trust to form an alliance.'
        : 'You declined an alliance with ' + person + '.'
    case 'vote-plan':
      if (entry.accepted)
        return 'You and ' + person + ' pledged to vote for ' + label(entry.suspectId) + '.'
      return outgoing
        ? person + ' declined your plan. Build trust to make a pact.'
        : 'You declined a vote plan from ' + person + '.'
  }
}

export function BetrayalsSocialPanel({
  actorId,
  contact,
  prospects,
  cast = prospects,
  actionsLeft,
  day = 1,
  canAct = true,
  conversation = [],
  recent,
  onContactChange,
  onMove,
}: Props) {
  const [contactId, setContactId] = useState<string>()
  const [planning, setPlanning] = useState(false)
  const [target, setTarget] = useState('')
  const contacts = prospects.filter(({ id }) => id !== actorId)
  const peer = contacts.find(({ id }) => id === (contactId ?? contact?.id)) ?? contacts[0]
  const eligible = contacts.filter(({ id }) => id !== peer?.id)
  const availableTarget = eligible.some(({ id }) => id === target)
  const isPrivate = (entry: SocialEntry) =>
    entry.actorId === actorId || entry.recipientId === actorId
  const notes = conversation.filter(isPrivate)
  const latest = recent && isPrivate(recent) ? recent : notes.at(-1)
  const allied = peer && hasAlliance(notes, actorId, peer.id)
  const hasTrust = peer && rapport(notes, actorId, peer.id) > 0
  const alreadyAsked = peer && askedToday(notes, actorId, peer.id, day)
  const pact = peer && latestPact(notes, actorId, peer.id, day)
  const names = new Map(cast.map(({ id, name }) => [id, name]))
  const label = (id: string | undefined) => (id ? names.get(id) : undefined) ?? 'another contestant'

  function changeContact(id: string) {
    setContactId(id)
    setPlanning(false)
    setTarget('')
    onContactChange?.(id)
  }

  function act(kind: SocialEntry['kind']) {
    if (!peer || !canAct || actionsLeft <= 0) return
    if (kind === 'vote-plan') {
      setPlanning((value) => !value)
      setTarget('')
      return
    }
    setPlanning(false)
    onMove(kind, undefined, peer.id)
  }

  function confirmPact() {
    if (!peer || !canAct || actionsLeft <= 0 || !availableTarget || pact?.suspectId === target)
      return
    onMove('vote-plan', target, peer.id)
    setPlanning(false)
    setTarget('')
  }

  return (
    <section className="betrayals-social" aria-label="Private conversations">
      {canAct && peer ? (
        <>
          <div className="betrayals-social__contact">
            {peer.portrait && <img src={peer.portrait} alt="" />}
            <label className="betrayals-social__field">
              Speak with
              <select value={peer.id} onChange={(event) => changeContact(event.target.value)}>
                {contacts.map(({ id, name }) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <div className="betrayals-social__budget">
              <div className="betrayals-social__pips" aria-hidden="true">
                {Array.from({ length: DAILY_ACTIONS }, (_, index) => (
                  <span key={index} data-available={index < actionsLeft} />
                ))}
              </div>
              <span>
                {actionsLeft} of {DAILY_ACTIONS} moves left
              </span>
            </div>
          </div>
          {(allied || hasTrust || pact) && (
            <div className="betrayals-social__ties">
              {allied ? <span>Alliance</span> : hasTrust && <span>Trust earned</span>}
              {pact && <span>Vote pact · {label(pact.suspectId)}</span>}
            </div>
          )}
          <div className="betrayals-social__moves">
            {actions.map(({ kind, label: title, mark }) => {
              const used = (kind === 'alliance' && allied) || (kind === 'question' && alreadyAsked)
              const needsTarget = kind === 'vote-plan' || kind === 'question'
              const disabled = actionsLeft <= 0 || used || (needsTarget && !eligible.length)
              const expanded = kind === 'vote-plan' ? planning && actionsLeft > 0 : undefined
              return (
                <button
                  key={kind}
                  type="button"
                  className="betrayals-social__move"
                  disabled={disabled}
                  aria-expanded={expanded}
                  onClick={() => act(kind)}
                >
                  <span aria-hidden="true">{mark}</span>
                  {used ? (kind === 'alliance' ? 'Allied' : 'Heard today') : title}
                </button>
              )
            })}
          </div>
          {planning && actionsLeft > 0 && (
            <div className="betrayals-social__pact">
              <label className="betrayals-social__field">
                Vote target
                <select
                  value={availableTarget ? target : ''}
                  onChange={(event) => setTarget(event.target.value)}
                >
                  <option value="">Choose a contestant</option>
                  {eligible.map(({ id, name }) => (
                    <option key={id} value={id} disabled={pact?.suspectId === id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="betrayals-social__confirm"
                type="button"
                disabled={!availableTarget || pact?.suspectId === target}
                onClick={confirmPact}
              >
                Send plan
              </button>
            </div>
          )}
        </>
      ) : (
        <p className="betrayals-social__idle">
          {canAct
            ? 'No contestants are available to speak.'
            : 'Private notes are read-only in this phase.'}
        </p>
      )}
      <div className="betrayals-social__reply" role="status">
        {latest && <p>{exchangeText(latest, actorId, label)}</p>}
      </div>
      {notes.length > 0 && (
        <details className="betrayals-social__ledger">
          <summary>
            Private notes <span>{notes.length}</span>
          </summary>
          <ul>
            {notes
              .slice()
              .reverse()
              .map((entry, index) => (
                <li key={notes.length - index}>
                  <span>Day {entry.day}</span>
                  <p>{exchangeText(entry, actorId, label)}</p>
                </li>
              ))}
          </ul>
        </details>
      )}
    </section>
  )
}

import { useState } from 'react'
import type { Player } from '../types'
import ActionCard from '../components/SocialPanelV2/ActionCard'
import HubmateChoiceChip from '../components/SocialPanelV2/HubmateChoiceChip'
import { ALLIANCE_LIMITS } from '../social/reality/allianceIdentity'
import { consultableAlliances, MAX_CHAT_GUESTS, MIN_CHAT_GUESTS } from './generalSocial'
import type { AllianceMoveDetails, GeneralSocialMove } from './generalSocial'
import { castleAlliances } from './allianceRecords'
import { generalActionCards } from './generalSocialCards'
import type { RealityPreset, SocialEntry } from './run'
import { socialMoveCost } from './socialResources'
import { canUseBetrayalsAction, isPremiumBetrayalsAction } from './premiumAccess'

export function BetrayalsGeneralActions({
  contacts,
  energy,
  realityMode,
  day,
  actorId,
  notes,
  planningOpen,
  hasRealityMode = false,
  onUpgrade,
  onMove,
}: {
  contacts: readonly Player[]
  energy: number
  realityMode: RealityPreset
  day: number
  actorId: string
  notes: readonly SocialEntry[]
  planningOpen: boolean
  hasRealityMode?: boolean
  onUpgrade?: () => void
  onMove: (
    kind: GeneralSocialMove,
    guestIds: readonly string[],
    details?: AllianceMoveDetails
  ) => void
}) {
  const [selected, setSelected] = useState<GeneralSocialMove>()
  const [invited, setInvited] = useState<string[]>([])
  const [allianceId, setAllianceId] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [filter, setFilter] = useState('all')
  const guests = contacts.filter(({ id }) => invited.includes(id))
  const multiselect = selected === 'group-chat' || selected === 'found-alliance'
  const maximum = selected === 'found-alliance' ? ALLIANCE_LIMITS.groupMembers - 1 : MAX_CHAT_GUESTS
  const groups = consultableAlliances(notes, actorId, [actorId, ...contacts.map(({ id }) => id)])
  const council = groups.find(({ id }) => id === allianceId)
  const subjects = council ? contacts.filter(({ id }) => !council.memberIds.includes(id)) : []
  const costFor = (kind: GeneralSocialMove) =>
    socialMoveCost(kind, realityMode, Math.max(MIN_CHAT_GUESTS, guests.length))
  function unavailable(kind: GeneralSocialMove) {
    if (notes.some((note) => note.day === day && note.actorId === actorId && note.kind === kind))
      return 'Already used today.'
    if ((kind === 'group-chat' || kind === 'found-alliance') && contacts.length < MIN_CHAT_GUESTS)
      return 'You need at least two guests.'
    if (
      kind === 'found-alliance' &&
      castleAlliances(notes).filter(({ memberIds }) => memberIds.includes(actorId)).length >=
        ALLIANCE_LIMITS.groupsPerMember
    )
      return 'You already belong to two alliances.'
    if (kind === 'consult-alliance' && !groups.length)
      return 'You need an active alliance or personal pact.'
    if (energy < costFor(kind).energy) return `Requires ${costFor(kind).energy} Energy.`
  }
  const ready =
    selected &&
    canUseBetrayalsAction(selected, hasRealityMode) &&
    (selected === 'lay-low' || planningOpen) &&
    !unavailable(selected) &&
    (!multiselect || guests.length >= MIN_CHAT_GUESTS) &&
    (selected !== 'consult-alliance' || subjects.some(({ id }) => id === subjectId))

  return (
    <section className="sp2-moves betrayals-general-actions" aria-label="General actions">
      <div className="sp2-moves__heading">
        <span className="sp2-section-heading__title">Around the castle</span>
        <button
          className="sp2-execute"
          type="button"
          aria-label="Execute general action"
          disabled={!ready}
          onClick={() => {
            if (!ready || !selected) return
            if (selected === 'consult-alliance') onMove(selected, [], { allianceId, subjectId })
            else onMove(selected, multiselect ? guests.map(({ id }) => id) : [])
            setSelected(undefined)
            setInvited([])
          }}
        >
          Execute
        </button>
      </div>
      {planningOpen && (
        <div className="sp2-move-filters" role="tablist" aria-label="General action categories">
          {Object.entries({
            all: 'All',
            friendly: 'Friendly',
            strategic: 'Strategic',
            alliance: 'Alliances',
          }).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              className={filter === id ? 'is-active' : undefined}
              aria-selected={filter === id}
              onClick={() => {
                setFilter(id)
                setSelected(undefined)
                setInvited([])
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="sp2-action-grid">
        {generalActionCards
          .filter((action) =>
            planningOpen ? filter === 'all' || filter === action.category : action.id === 'lay-low'
          )
          .map((action) => {
            const reason = unavailable(action.id)
            const cost = costFor(action.id)
            return (
              <ActionCard
                key={action.id}
                action={{ ...action, baseCost: cost.energy }}
                costs={cost}
                selected={selected === action.id}
                premiumLocked={!hasRealityMode && isPremiumBetrayalsAction(action.id)}
                onPremiumLockedClick={onUpgrade}
                disabled={Boolean(reason)}
                disabledMessage={reason}
                onClick={() => {
                  setSelected(selected === action.id ? undefined : action.id)
                  setInvited([])
                }}
              />
            )
          })}
      </div>
      {multiselect && planningOpen && (
        <div
          className="sp2-consult-alliance-picker"
          role="group"
          aria-label={selected === 'group-chat' ? 'Group Chat guests' : 'Alliance invitees'}
        >
          <p>
            Invite 2-{maximum} guests · {guests.length} selected
          </p>
          <div className="sp2-consult-alliance-picker__chips">
            {contacts.map((contact) => (
              <HubmateChoiceChip
                key={contact.id}
                player={contact}
                selected={invited.includes(contact.id)}
                onClick={() =>
                  setInvited((ids) =>
                    ids.includes(contact.id)
                      ? ids.filter((id) => id !== contact.id)
                      : ids.length < maximum
                        ? [...ids, contact.id]
                        : ids
                  )
                }
              />
            ))}
          </div>
        </div>
      )}
      {selected === 'consult-alliance' && planningOpen && (
        <div className="sp2-consult-alliance-picker">
          <label>
            Alliance{' '}
            <select
              value={allianceId}
              onChange={(event) => {
                setAllianceId(event.target.value)
                setSubjectId('')
              }}
            >
              <option value="">Choose an alliance</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name ||
                    `Pact with ${contacts.find(({ id }) => id === group.memberIds[1])?.name}`}
                </option>
              ))}
            </select>
          </label>
          {council && (
            <label>
              Guest to discuss{' '}
              <select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
                <option value="">Choose a guest</option>
                {subjects.map((guest) => (
                  <option key={guest.id} value={guest.id}>
                    {guest.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
    </section>
  )
}

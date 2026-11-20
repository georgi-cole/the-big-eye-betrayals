import { useEffect, useRef, useState } from 'react'
import type { Player } from '../types'
import type { SocialActionDefinition } from '../social/socialActions'
import type { RelationshipsMap } from '../social/types'
import { useHorizontalSwipe } from '../hooks/useHorizontalSwipe'
import PlayerAvatar from '../components/PlayerAvatar/PlayerAvatar'
import ActionCard from '../components/SocialPanelV2/ActionCard'
import HubmateChoiceChip from '../components/SocialPanelV2/HubmateChoiceChip'
import PlayerList from '../components/SocialPanelV2/PlayerList'
import GameBackButton from '../components/ui/GameBackButton/GameBackButton'
import type { Contestant, Phase, RealityPreset, SocialEntry } from './run'
import {
  choosesSocialSubject,
  discussedToday,
  hasAlliance,
  hasSocialStrain,
  latestPact,
  rapport,
  socialMoveKinds,
} from './social'
import { missingSocialResource, socialMoveCost } from './socialResources'
import type { SocialResources } from './socialResources'
import '../components/SocialPanelV2/SocialPanelV2.css'
import '../components/SocialPanelV2/RecentActivity.css'
import './betrayals-social.css'

const actions = [
  {
    id: 'rapport',
    title: 'Build trust',
    category: 'friendly',
    description: 'Get closer to this guest and earn Influence.',
    icon: '🤝',
  },
  {
    id: 'ask-about',
    title: 'Ask about a player',
    category: 'strategic',
    description: 'Pick a guest and ask what your contact makes of them.',
    icon: '🔎',
  },
  {
    id: 'share-suspicion',
    title: 'Share a suspicion',
    category: 'strategic',
    description: 'Put a name in someone’s mind. Accusing their ally can turn them against you.',
    icon: '🗣️',
  },
  {
    id: 'question',
    title: 'Hear a suspicion',
    category: 'strategic',
    description: 'Find out whom this guest suspects and earn Info.',
    icon: '💬',
  },
  {
    id: 'defend-guest',
    title: 'Defend a player',
    category: 'strategic',
    description: 'Ask your contact to give someone a second look. Your credibility matters.',
    icon: '🛡️',
  },
  {
    id: 'mend-fences',
    title: 'Mend fences',
    category: 'friendly',
    description: 'Rebuild some trust with a guest after a private conversation went badly.',
    icon: '🤝',
  },
  {
    id: 'debrief',
    title: 'Debrief the vote',
    category: 'strategic',
    description: 'Get a private reaction to the last public banishment.',
    icon: '🕯️',
  },
  {
    id: 'ask-end',
    title: 'Ask about ending the game',
    category: 'strategic',
    description: 'Find out if they want to end the game or banish again.',
    icon: '🔥',
  },
  {
    id: 'alliance',
    title: 'Propose an alliance',
    category: 'alliance',
    description: 'Ask this guest to work with you.',
    icon: '🛡️',
  },
  {
    id: 'vote-plan',
    title: 'Plan a vote',
    category: 'strategic',
    description: 'Propose voting together at the Round Table.',
    icon: '🗳️',
  },
] satisfies (Omit<SocialActionDefinition, 'baseCost'> & { id: SocialEntry['kind'] })[]

const filters = [
  { id: 'all', label: 'All' },
  { id: 'friendly', label: 'Friendly' },
  { id: 'strategic', label: 'Strategic' },
  { id: 'alliance', label: 'Alliances' },
] as const
type Filter = (typeof filters)[number]['id']
const seasonEndedHint = 'The season has ended. You can still browse your relationships.'
const resourceNames: Record<keyof SocialResources, string> = {
  energy: 'Energy',
  influence: 'Influence',
  info: 'Info',
}
const checkInCopy: Partial<Record<Phase, { title: string; description: string }>> = {
  'role-reveal': {
    title: 'Introduce yourself',
    description: 'Break the ice with a guest as you arrive at the castle.',
  },
  dawn: {
    title: 'Check in at dawn',
    description: 'Ask how a guest is holding up after the night.',
  },
  immunity: {
    title: 'Talk about the challenge',
    description: 'Share how you feel about the Immunity Challenge.',
  },
  safety: {
    title: 'Talk about the challenge',
    description: 'Share how you feel about the Safety Challenge.',
  },
  'round-table': {
    title: 'Speak one-on-one',
    description: 'Give a guest a moment away from the pressure of the table.',
  },
  'table-reveal': {
    title: 'Check in after the vote',
    description: 'Give a guest a moment to catch their breath.',
  },
  night: {
    title: 'Talk after dark',
    description: 'Catch a guest for a quiet word before the castle turns in.',
  },
  'night-resolved': {
    title: 'Leave a note',
    description: 'Leave a private message for a guest before morning.',
  },
  'final-challenge': {
    title: 'Talk about the final challenge',
    description: 'Share a quiet moment as the finalists prepare.',
  },
  'final-banishment': {
    title: 'Clear the air',
    description: 'Speak honestly with a guest under the pressure of the final vote.',
  },
  'end-vote': {
    title: 'Clear the air',
    description: 'Speak honestly with a guest about how far you have come.',
  },
}

type Props = {
  actorId: string
  prospects: readonly Contestant[]
  cast?: readonly Contestant[]
  resources: SocialResources
  realityMode?: RealityPreset
  day?: number
  phase?: Phase
  moveKinds?: readonly SocialEntry['kind'][]
  voteTargetIds?: readonly string[]
  canAct?: boolean
  conversation?: readonly SocialEntry[]
  recent?: SocialEntry
  onClose: () => void
  onMove: (kind: SocialEntry['kind'], suspectId: string | undefined, contactId: string) => void
}

type NameLookup = (id: string | undefined) => string

function exchangeText(entry: SocialEntry, actorId: string, label: NameLookup) {
  const outgoing = entry.actorId === actorId
  const person = label(outgoing ? entry.recipientId : entry.actorId)
  const subject = label(entry.suspectId)
  switch (entry.kind) {
    case 'rapport':
      return `You built trust with ${person}.`
    case 'question':
      return `${person} suspects ${subject}.`
    case 'alliance':
      if (entry.accepted) return `You formed an alliance with ${person}.`
      return outgoing
        ? `${person} needs more trust to form an alliance.`
        : `You declined an alliance with ${person}.`
    case 'vote-plan':
      if (entry.accepted) return `You and ${person} pledged to vote for ${subject}.`
      return outgoing
        ? `${person} declined your plan. Build trust to make a pact.`
        : `You declined a vote plan from ${person}.`
    case 'ask-about':
      if (entry.reaction === 'trusts') return `${person} says they trust ${subject}.`
      if (entry.reaction === 'wary') return `${person} admits they’re wary of ${subject}.`
      if (entry.reaction === 'held-back')
        return `${person} kept their opinion of ${subject} private.`
      return `${person} says they haven’t made up their mind about ${subject}.`
    case 'share-suspicion':
      if (entry.reaction === 'landed') return `${person} will take a closer look at ${subject}.`
      if (entry.reaction === 'backfired')
        return `${person} pushed back on your suspicions about ${subject}. They’re wary of you now.`
      return `${person} heard you out and kept their doubts about ${subject} to themselves.`
    case 'defend-guest':
      if (entry.reaction === 'landed')
        return `${person} is reconsidering their doubts about ${subject}.`
      if (entry.reaction === 'backfired')
        return `${person} thought you were covering for ${subject}. They questioned your motives.`
      return `${person} still has the same read on ${subject}.`
    case 'mend-fences':
      return entry.reaction === 'repaired'
        ? `You cleared the air with ${person} and earned back some trust.`
        : `${person} needs more time before they’re ready to clear the air.`
    case 'debrief':
      if (entry.reaction === 'held-back')
        return `${person} kept their thoughts on the vote private.`
      if (entry.reaction === 'wary')
        return `${person} says the tie showed how divided the castle is.`
      return `${person} opened up about how the banishment changed the mood in the castle.`
    case 'ask-end':
      if (entry.reaction === 'end') return `${person} says they’re leaning toward ending the game.`
      if (entry.reaction === 'banish') return `${person} says they want another banishment.`
      return `${person} kept their plans for the final vote to themselves.`
  }
}

function CastleWire({
  notes,
  latest,
  actorId,
  label,
}: {
  notes: readonly SocialEntry[]
  latest?: SocialEntry
  actorId: string
  label: NameLookup
}) {
  const [showHistory, setShowHistory] = useState(false)
  const [dismissedResult, setDismissedResult] = useState<string>()
  const resultKey =
    latest &&
    [
      notes.length,
      latest.day,
      latest.actorId,
      latest.recipientId,
      latest.kind,
      latest.suspectId,
      latest.accepted,
    ].join(':')
  const entries = showHistory
    ? notes.slice().reverse()
    : latest && resultKey !== dismissedResult
      ? [latest]
      : []

  return (
    <section
      className={'ra-container' + (showHistory ? ' ra-container--expanded' : '')}
      aria-label="Private notes"
    >
      <div className="ra-header">
        <span className="ra-title">Castle wire</span>
        <span className="ra-header__actions">
          {notes.length > 0 && (
            <button
              type="button"
              className="ra-history-btn"
              aria-expanded={showHistory}
              onClick={() => setShowHistory(!showHistory)}
            >
              {showHistory ? 'Close history' : 'History'}
              <span className="ra-history-btn__count" aria-hidden="true">
                {notes.length}
              </span>
            </button>
          )}
        </span>
      </div>
      <div className="ra-content" role={showHistory ? undefined : 'status'}>
        {entries.length > 0 ? (
          <ul className="ra-list">
            {entries.map((entry, index) => {
              const action = actions.find(({ id }) => id === entry.kind)
              return (
                <li className="ra-entry" key={entries.length - index}>
                  <span
                    className={
                      'ra-entry__icon ' +
                      (entry.accepted === false
                        ? 'ra-entry__icon--negative'
                        : 'ra-entry__icon--positive')
                    }
                    aria-hidden="true"
                  >
                    {action?.icon}
                  </span>
                  <span className="ra-entry__body">
                    <span className="ra-entry__action-tag">{action?.title}</span>
                    <span className="ra-entry__narrative">
                      {exchangeText(entry, actorId, label)}
                    </span>
                  </span>
                  <span className="ra-entry__time">Day {entry.day}</span>
                  {!showHistory && (
                    <button
                      className="ra-entry__dismiss"
                      type="button"
                      aria-label="Dismiss current result"
                      onClick={() => setDismissedResult(resultKey)}
                    >
                      ×
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        ) : (
          <span className="ra-empty">
            {notes.length ? 'No current result.' : 'No private conversations yet.'}
          </span>
        )}
      </div>
    </section>
  )
}

export function BetrayalsSocialPanel({
  actorId,
  prospects,
  cast = prospects,
  resources,
  realityMode = 'off',
  day = 1,
  phase = 'social',
  moveKinds = socialMoveKinds({ phase }),
  voteTargetIds,
  canAct = moveKinds.length > 0,
  conversation = [],
  recent,
  onClose,
  onMove,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [contactId, setContactId] = useState<string>()
  const [selectedAction, setSelectedAction] = useState<SocialEntry['kind']>()
  const [target, setTarget] = useState<string>()
  const [filter, setFilter] = useState<Filter>('all')
  const contacts: Player[] = prospects
    .filter(({ id }) => id !== actorId)
    .map(({ id, name, portrait }) => ({
      id,
      name,
      avatar: portrait ?? '',
      status: 'active',
    }))
  const peer = contacts.find(({ id }) => id === contactId)
  const eligible = contacts.filter(({ id }) => id !== peer?.id)
  const isPrivate = (entry: SocialEntry) =>
    entry.actorId === actorId || entry.recipientId === actorId
  const notes = conversation.filter(isPrivate)
  const latest = recent && isPrivate(recent) ? recent : notes.at(-1)
  const pact = peer && latestPact(notes, actorId, peer.id, day)
  const names = new Map(cast.map(({ id, name }) => [id, name]))
  const label: NameLookup = (id) => (id ? names.get(id) : undefined) ?? 'another contestant'
  const relationships: RelationshipsMap = {
    [actorId]: Object.fromEntries(
      contacts.map(({ id }) => {
        const trust = Math.round(rapport(notes, actorId, id) * 100)
        return [id, { affinity: trust, tags: hasAlliance(notes, actorId, id) ? ['alliance'] : [] }]
      })
    ),
  }
  const affinity = peer && relationships[actorId][peer.id].affinity
  const allied = peer && hasAlliance(notes, actorId, peer.id)
  const phaseActions = actions
    .filter(({ id }) => moveKinds.includes(id))
    .map((action) => (action.id === 'rapport' ? { ...action, ...checkInCopy[phase] } : action))
  const phaseFilters = filters.filter(({ id }) =>
    id === 'all' ? phaseActions.length > 1 : phaseActions.some(({ category }) => category === id)
  )
  const activeFilter = phaseFilters.some(({ id }) => id === filter) ? filter : 'all'

  function chooseContact(id: string | undefined) {
    setContactId(id)
    setSelectedAction(undefined)
    setTarget(undefined)
  }

  function browse(direction: -1 | 1) {
    const index = contacts.findIndex(({ id }) => id === peer?.id)
    const next = contacts[index + direction]
    if (next) chooseContact(next.id)
  }
  const swipe = useHorizontalSwipe(browse)

  useEffect(() => {
    const element = dialog.current
    if (!element || element.open) return
    if (typeof element.showModal === 'function') {
      element.showModal()
      return () => element.close()
    }
    element.setAttribute('open', '')
    return () => element.removeAttribute('open')
  }, [])

  function discussed(kind: SocialEntry['kind'], suspectId?: string) {
    return peer && discussedToday(notes, { actorId, recipientId: peer.id, kind, suspectId }, day)
  }

  function subjectsFor(kind: SocialEntry['kind']) {
    return eligible.filter(({ id }) =>
      kind === 'vote-plan'
        ? id !== pact?.suspectId && (!voteTargetIds || voteTargetIds.includes(id))
        : !discussed(kind, id)
    )
  }

  function unavailable(kind: SocialEntry['kind']) {
    if (!peer) return 'Choose a guest first.'
    if (kind === 'alliance' && allied) return 'You already have an alliance.'
    if (kind === 'mend-fences' && !hasSocialStrain(notes, actorId, peer.id))
      return 'There’s no tension to resolve.'
    if (!choosesSocialSubject(kind) && discussed(kind)) return 'You’ve already asked today.'
    if (kind === 'question' && eligible.length === 0) return 'There is nobody else to discuss.'
    if (choosesSocialSubject(kind) && subjectsFor(kind).length === 0)
      return 'No new guests to discuss.'
    const cost = socialMoveCost(kind, realityMode)
    const missing = missingSocialResource(resources, cost)
    if (missing) return `Requires ${cost[missing]} ${resourceNames[missing]}.`
  }

  const targetKind =
    selectedAction && choosesSocialSubject(selectedAction) ? selectedAction : undefined
  const availableTargets = targetKind ? subjectsFor(targetKind) : []
  const canExecute =
    canAct &&
    Boolean(
      peer &&
      selectedAction &&
      moveKinds.includes(selectedAction) &&
      !unavailable(selectedAction) &&
      (!targetKind || availableTargets.some(({ id }) => id === target))
    )

  function execute() {
    if (!canExecute || !peer || !selectedAction) return
    onMove(selectedAction, targetKind ? target : undefined, peer.id)
    setSelectedAction(undefined)
    setTarget(undefined)
  }

  return (
    <dialog
      ref={dialog}
      className="sp2-backdrop betrayals-social-dialog"
      aria-label="Social"
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <a className="sp2-skip-link" href="#betrayals-social-body">
        {canAct ? 'Skip to actions' : 'Skip to relationships'}
      </a>
      <div className="sp2-modal sp2-modal--normal">
        <header className="sp2-header">
          <span className="sp2-header__identity">
            <span className="sp2-header__title">
              {phase === 'social' ? 'Social Phase' : 'Social'}
            </span>
            <span className="sp2-header__subtitle">Castle relationships</span>
          </span>
          <div className="sp2-header__resources sp2-header__resources--normal">
            {canAct && (
              <>
                <span
                  className="sp2-energy-chip"
                  aria-live="polite"
                  aria-label={`Energy: ${resources.energy}`}
                  title="Energy"
                >
                  ⚡ {resources.energy}
                </span>
                <span
                  className="sp2-resource-chip sp2-resource-chip--influence"
                  aria-live="polite"
                  aria-label={`Influence: ${resources.influence}`}
                  title="Influence"
                >
                  🗣️ {resources.influence}
                </span>
                <span
                  className="sp2-resource-chip sp2-resource-chip--info"
                  aria-live="polite"
                  aria-label={`Info: ${resources.info}`}
                  title="Info"
                >
                  🔎 {resources.info}
                </span>
              </>
            )}
          </div>
          <GameBackButton
            className="sp2-header__close"
            label="Close social panel"
            onClick={onClose}
          />
        </header>

        <div
          id="betrayals-social-body"
          className={'sp2-body' + (peer && canAct ? ' sp2-body--focused-target' : '')}
        >
          {!peer && contacts.length > 0 && (
            <section className="sp2-hubmates" aria-label="Player roster">
              <div className="sp2-section-heading">
                <span className="sp2-section-heading__title">Choose a guest</span>
              </div>
              <PlayerList
                players={contacts}
                humanPlayerId={actorId}
                relationships={relationships}
                selectedIds={new Set()}
                playerLimitedRead
                currentDay={day}
                onSelectionChange={(_, { primaryTargetId }) =>
                  chooseContact(primaryTargetId ?? undefined)
                }
              />
            </section>
          )}
          <section className={'sp2-focus' + (peer ? ' sp2-focus--active' : '')}>
            {peer ? (
              <>
                <button
                  className="sp2-focus__clear"
                  type="button"
                  aria-label={`Deselect ${peer.name} and show roster`}
                  onClick={() => chooseContact(undefined)}
                >
                  ×
                </button>
                <div
                  className="sp2-focus__portrait"
                  {...swipe}
                  style={{ touchAction: 'pan-y' }}
                  tabIndex={0}
                  role="group"
                  aria-label="Browse guests with left and right arrows"
                  onKeyDown={(event) => {
                    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
                    event.preventDefault()
                    browse(event.key === 'ArrowLeft' ? -1 : 1)
                  }}
                >
                  <PlayerAvatar
                    player={peer}
                    size="lg"
                    affinity={affinity}
                    relationshipScale="signed"
                  />
                </div>
                <div className="sp2-focus__copy sp2-focus__copy--clearable">
                  <span className="sp2-focus__eyebrow">Your read on</span>
                  <h2>{peer.name}</h2>
                  <div className="sp2-focus__status-line">
                    <span className="sp2-focus__relationship">
                      {allied ? 'Alliance' : affinity ? 'Trust earned' : 'Uncertain'}
                    </span>
                    <span className="sp2-focus__status">In the castle</span>
                  </div>
                  {pact && (
                    <div className="sp2-focus__commitments" aria-label="Shared commitments">
                      <span>Vote pact · {label(pact.suspectId)}</span>
                    </div>
                  )}
                  <div
                    className="sp2-focus__meter"
                    aria-label="Trust"
                    role="meter"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={affinity ?? 0}
                  >
                    <span style={{ width: `${Math.max(6, affinity ?? 0)}%` }} />
                  </div>
                  {!canAct && <p>{seasonEndedHint}</p>}
                </div>
              </>
            ) : (
              <>
                <span className="sp2-focus__empty-mark" aria-hidden="true" />
                <div className="sp2-focus__copy">
                  <span className="sp2-focus__eyebrow">The castle is listening</span>
                  <h2>
                    {canAct && contacts.length
                      ? 'Who do you want to approach?'
                      : 'Private conversations'}
                  </h2>
                  <p>
                    {!canAct
                      ? seasonEndedHint
                      : contacts.length
                        ? 'Choose a guest to see your relationship and make a move.'
                        : 'No guests are available to speak.'}
                  </p>
                </div>
              </>
            )}
          </section>

          {canAct && contacts.length > 0 && (
            <section className="sp2-moves" aria-label="Social actions">
              <div className="sp2-moves__top">
                <div className="sp2-moves__heading">
                  <div>
                    <span className="sp2-section-heading__eyebrow">Your move</span>
                    <span className="sp2-section-heading__title">Set the tone</span>
                  </div>
                  <button
                    className="sp2-execute sp2-moves__execute"
                    type="button"
                    disabled={!canExecute}
                    onClick={execute}
                  >
                    Execute
                  </button>
                </div>
                {phaseFilters.length > 1 && (
                  <div className="sp2-move-filters" role="tablist" aria-label="Action categories">
                    {phaseFilters.map(({ id, label: title }) => (
                      <button
                        key={id}
                        type="button"
                        role="tab"
                        aria-selected={id === activeFilter}
                        className={id === activeFilter ? 'is-active' : ''}
                        onClick={() => {
                          setFilter(id)
                          setSelectedAction(undefined)
                          setTarget(undefined)
                        }}
                      >
                        {title}
                      </button>
                    ))}
                  </div>
                )}
                {peer && targetKind && (
                  <div
                    className="sp2-consult-alliance-picker"
                    role="group"
                    aria-label={selectedAction === 'vote-plan' ? 'Vote target' : 'Guest to discuss'}
                  >
                    <div className="sp2-consult-alliance-picker__chips">
                      {availableTargets.map((player) => (
                        <HubmateChoiceChip
                          key={player.id}
                          player={player}
                          selected={player.id === target}
                          onClick={() => setTarget(player.id)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="sp2-action-grid" role="tabpanel" aria-label="Available actions">
                {phaseActions
                  .filter(({ category }) => activeFilter === 'all' || category === activeFilter)
                  .map((action) => {
                    const cost = socialMoveCost(action.id, realityMode)
                    const reason = unavailable(action.id)
                    return (
                      <ActionCard
                        key={action.id}
                        action={{ ...action, baseCost: cost.energy }}
                        costs={cost}
                        selected={action.id === selectedAction}
                        disabled={Boolean(reason)}
                        disabledMessage={reason}
                        onClick={() => {
                          setSelectedAction(action.id === selectedAction ? undefined : action.id)
                          setTarget(undefined)
                        }}
                      />
                    )
                  })}
              </div>
            </section>
          )}
        </div>

        <footer className="sp2-footer sp2-footer--unified">
          <div className="sp2-recent sp2-recent--unified">
            <CastleWire notes={notes} latest={latest} actorId={actorId} label={label} />
          </div>
        </footer>
      </div>
    </dialog>
  )
}

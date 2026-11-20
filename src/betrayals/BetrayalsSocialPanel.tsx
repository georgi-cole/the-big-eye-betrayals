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
import IncomingInteractionIcon from '../components/IncomingInteractionsInbox/IncomingInteractionIcon'
import type { Contestant, SocialEntry } from './run'
import { askedToday, DAILY_ACTIONS, hasAlliance, latestPact, rapport } from './social'
import '../components/SocialPanelV2/SocialPanelV2.css'
import '../components/SocialPanelV2/RecentActivity.css'
import './betrayals-social.css'

const actions = [
  {
    id: 'rapport',
    title: 'Build trust',
    category: 'friendly',
    description: 'Get closer to this guest in private.',
    icon: '🤝',
    baseCost: 1,
  },
  {
    id: 'question',
    title: 'Hear a suspicion',
    category: 'strategic',
    description: 'Find out whom this guest suspects.',
    icon: '💬',
    baseCost: 1,
  },
  {
    id: 'alliance',
    title: 'Propose an alliance',
    category: 'alliance',
    description: 'Ask this guest to work with you.',
    icon: '🛡️',
    baseCost: 1,
  },
  {
    id: 'vote-plan',
    title: 'Plan a vote',
    category: 'strategic',
    description: 'Propose voting together at the Round Table.',
    icon: '🗳️',
    baseCost: 1,
  },
] satisfies (SocialActionDefinition & { id: SocialEntry['kind'] })[]

const filters = [
  { id: 'all', label: 'All' },
  { id: 'friendly', label: 'Friendly' },
  { id: 'strategic', label: 'Strategic' },
  { id: 'alliance', label: 'Alliances' },
] as const
type Filter = (typeof filters)[number]['id']

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
  incomingCount?: number
  onOpenIncoming?: () => void
  onClose: () => void
  onContactChange?: (id: string) => void
  onMove: (kind: SocialEntry['kind'], suspectId: string | undefined, contactId: string) => void
}

type NameLookup = (id: string | undefined) => string

function exchangeText(entry: SocialEntry, actorId: string, label: NameLookup) {
  const outgoing = entry.actorId === actorId
  const person = label(outgoing ? entry.recipientId : entry.actorId)
  switch (entry.kind) {
    case 'rapport':
      return `You built trust with ${person}.`
    case 'question':
      return `${person} suspects ${label(entry.suspectId)}.`
    case 'alliance':
      if (entry.accepted) return `You formed an alliance with ${person}.`
      return outgoing
        ? `${person} needs more trust to form an alliance.`
        : `You declined an alliance with ${person}.`
    case 'vote-plan':
      if (entry.accepted) return `You and ${person} pledged to vote for ${label(entry.suspectId)}.`
      return outgoing
        ? `${person} declined your plan. Build trust to make a pact.`
        : `You declined a vote plan from ${person}.`
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
  contact,
  prospects,
  cast = prospects,
  actionsLeft,
  day = 1,
  canAct = true,
  conversation = [],
  recent,
  incomingCount = 0,
  onOpenIncoming,
  onClose,
  onContactChange,
  onMove,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [contactId, setContactId] = useState(contact?.id)
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
  const availableTargets = eligible.filter(({ id }) => id !== pact?.suspectId)

  function chooseContact(id: string | undefined) {
    setContactId(id)
    setSelectedAction(undefined)
    setTarget(undefined)
    if (id) onContactChange?.(id)
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

  function unavailable(kind: SocialEntry['kind']) {
    if (!peer) return 'Choose a guest first.'
    if (actionsLeft === 0) return 'No moves left today.'
    if (kind === 'alliance' && allied) return 'You already have an alliance.'
    if (kind === 'question' && askedToday(notes, actorId, peer.id, day)) return 'You asked today.'
    if (kind === 'question' && eligible.length === 0) return 'There is nobody else to discuss.'
    if (kind === 'vote-plan' && availableTargets.length === 0)
      return 'No new vote targets available.'
  }

  const choosingTarget = selectedAction === 'vote-plan'
  const canExecute =
    canAct &&
    Boolean(
      peer &&
      selectedAction &&
      !unavailable(selectedAction) &&
      (!choosingTarget || availableTargets.some(({ id }) => id === target))
    )

  function execute() {
    if (!canExecute || !peer || !selectedAction) return
    onMove(selectedAction, choosingTarget ? target : undefined, peer.id)
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
        Skip to actions
      </a>
      <div className="sp2-modal sp2-modal--normal">
        <header className="sp2-header">
          <span className="sp2-header__identity">
            <span className="sp2-header__title">Social Phase</span>
            <span className="sp2-header__subtitle">Castle relationships</span>
          </span>
          <div className="sp2-header__resources sp2-header__resources--normal">
            {canAct && (
              <span
                className="sp2-energy-chip"
                aria-live="polite"
                aria-label={`${actionsLeft} of ${DAILY_ACTIONS} moves left`}
              >
                ⚡ {actionsLeft}/{DAILY_ACTIONS}
              </span>
            )}
            {onOpenIncoming && (
              <button
                className="sp2-resource-chip betrayals-social-inbox"
                type="button"
                onClick={onOpenIncoming}
                aria-label={
                  incomingCount > 0
                    ? `Incoming interactions, ${incomingCount} pending`
                    : 'Incoming interactions'
                }
              >
                <IncomingInteractionIcon name="inbox" />
                {incomingCount > 0 && <span aria-hidden="true">{incomingCount}</span>}
              </button>
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
          {canAct && !peer && contacts.length > 0 && (
            <section className="sp2-hubmates" aria-label="Player roster">
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
          <section className={'sp2-focus' + (peer && canAct ? ' sp2-focus--active' : '')}>
            {peer && canAct ? (
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
                      ? 'Private notes are read-only in this phase.'
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
                <div className="sp2-move-filters" role="tablist" aria-label="Action categories">
                  {filters.map(({ id, label: title }) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={id === filter}
                      className={id === filter ? 'is-active' : ''}
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
                {peer && choosingTarget && (
                  <div
                    className="sp2-consult-alliance-picker"
                    role="group"
                    aria-label="Vote target"
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
                {actions
                  .filter(({ category }) => filter === 'all' || category === filter)
                  .map((action) => {
                    const reason = unavailable(action.id)
                    return (
                      <ActionCard
                        key={action.id}
                        action={action}
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

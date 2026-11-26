import { useCallback, useEffect, useRef, useState } from 'react'
import {
  IncomingInboxCardHeader,
  IncomingInboxHeader,
} from '../components/IncomingInteractionsInbox/IncomingInboxChrome'
import type { IncomingInteractionIconName } from '../components/IncomingInteractionsInbox/IncomingInteractionIcon'
import PlayerAvatar from '../components/PlayerAvatar/PlayerAvatar'
import StoreProductIcon from '../components/StoreProductModal/StoreProductIcon'
import { BetrayalsResourceCosts } from './BetrayalsResourceCosts'
import type { IncomingAction, IncomingInteraction } from './incoming'
import { isPremiumCastleChoice } from './premiumAccess'
import type { IncomingAnswer } from './run'
import '../components/SocialPanelV2/ActionCard.css'
import './betrayals-incoming.css'
import './ceremonyActions.css'

type Props = {
  interactions: readonly IncomingInteraction[]
  onRespond: (id: string, answer: IncomingAction) => void
  onClose: () => void
  hasRealityMode?: boolean
  hasMyPulse?: boolean
  readIds?: ReadonlySet<string>
  onRead?: (id: string) => void
  onDiscussVote?: (speakerId: string) => void
  onOpenIntel?: (guestId: string) => void
}

type ConversationCard = {
  icon: IncomingInteractionIconName
  label: string
  priority: 'low' | 'medium'
  choices: Partial<Record<IncomingAnswer, string>> & Record<'engage' | 'dismiss', string>
}

const cards: Record<IncomingInteraction['kind'], ConversationCard> = {
  'castle-moment': {
    icon: 'check_in',
    label: 'Castle conversation',
    priority: 'low',
    choices: { engage: 'Replied', dismiss: 'Pass' },
  },
  confidence: {
    icon: 'check_in',
    label: 'Private check-in',
    priority: 'low',
    choices: { engage: 'Take a walk', dismiss: 'Pass' },
  },
  alliance: {
    icon: 'alliance_proposal',
    label: 'Alliance proposal',
    priority: 'medium',
    choices: { engage: 'Work together', listen: 'Stay friendly', dismiss: 'Pass' },
  },
  'vote-plan': {
    icon: 'deal_offer',
    label: 'Vote plan',
    priority: 'medium',
    choices: { engage: 'Agree to the plan', listen: 'Hear them out', dismiss: 'Pass' },
  },
  'shield-question': {
    icon: 'other',
    label: 'Night Shield question',
    priority: 'medium',
    choices: { engage: 'Say I have one', listen: 'Say I have none', dismiss: 'Keep it private' },
  },
  'shield-message': {
    icon: 'gossip',
    label: 'Night Shield talk',
    priority: 'low',
    choices: { engage: 'Acknowledge', dismiss: 'Pass' },
  },
  'shield-gift': {
    icon: 'other',
    label: 'Night Shield received',
    priority: 'medium',
    choices: { engage: 'Acknowledge', dismiss: 'Dismiss message' },
  },
  'shield-request': {
    icon: 'deal_offer',
    label: 'An ally needs a shield',
    priority: 'medium',
    choices: { engage: 'Give a Night Shield', dismiss: 'Keep my shield' },
  },
}

const answerStyles = { engage: 'positive', listen: 'neutral', dismiss: 'dismiss' } as const
const shieldPlanReplies = {
  keep: "I'm holding on to it for tonight.",
  'open-to-gift': 'I might pass it on if someone I trust needs it.',
  private: "I'm keeping my plans to myself.",
}

function hasOpenFollowUp({ response, shieldFollowUp }: IncomingInteraction) {
  return response !== 'dismiss' && (shieldFollowUp?.canRequest || shieldFollowUp?.canAskPlans)
}

function InboxVipEye({ feature }: { feature: 'Reality Mode' | 'My Pulse' }) {
  return (
    <span className="ac-card__premium-badge" aria-hidden="true" title={`Unlock ${feature}`}>
      <StoreProductIcon name="vip" />
    </span>
  )
}

function outcome({ response, kind, speaker, target, castleMoment }: IncomingInteraction) {
  if (castleMoment?.response) {
    return {
      shared: 'You had a moment to talk.',
      guarded: 'They held back. There may be another side to hear.',
      firsthand: 'Their firsthand account is in Intel.',
      hearsay: 'Their secondhand account is in Intel.',
      observed: 'Your sighting is in Intel.',
      passed: 'You let the moment pass.',
    }[castleMoment.response]
  }
  if (kind === 'shield-request') {
    return response === 'engage'
      ? `You passed a Night Shield to ${speaker.name} in private.`
      : `You kept your Night Shield.`
  }
  if (kind === 'shield-question') {
    if (response === 'engage') return `You told ${speaker.name} you have a Night Shield.`
    if (response === 'listen') return `You told ${speaker.name} you have no Night Shield.`
    return `You kept your Night Shield status private with ${speaker.name}.`
  }
  if (kind === 'shield-gift')
    return `The handoff from ${speaker.name} was recorded in your private notes.`
  if (kind === 'shield-message') return `You heard what ${speaker.name} had to say.`
  if (response === 'dismiss') return `You let ${speaker.name} go.`
  if (response === 'listen') {
    return target
      ? `${speaker.name} shared their suspicion of ${target.name}.`
      : `You heard ${speaker.name} out and left the offer open.`
  }
  if (target) return `You and ${speaker.name} agreed to back a vote for ${target.name}.`
  return kind === 'alliance'
    ? `You and ${speaker.name} agreed to look out for each other.`
    : `Your quiet conversation with ${speaker.name} earned some trust.`
}

function InboxMessage({
  interaction,
  read,
  onRead,
  onRespond,
  onDiscussVote,
  onOpenIntel,
  hasRealityMode,
  hasMyPulse,
}: {
  interaction: IncomingInteraction
  read: boolean
  onRead: (id: string) => void
  onRespond: Props['onRespond']
  onDiscussVote?: Props['onDiscussVote']
  onOpenIntel?: Props['onOpenIntel']
  hasRealityMode: boolean
  hasMyPulse: boolean
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const { id, kind, speaker, response, text, shieldFollowUp } = interaction
  const moment = interaction.castleMoment
  const { icon, label, choices, priority } = cards[kind]
  const unread = !read && !response
  const replies = []
  if (shieldFollowUp?.requestAccepted !== undefined) {
    replies.push(
      shieldFollowUp.requestAccepted
        ? "Here. Take it. You're covered tonight."
        : "I'm not handing it over."
    )
  }
  if (shieldFollowUp?.plan) replies.push(shieldPlanReplies[shieldFollowUp.plan])
  const intelLinks = moment && onOpenIntel && (
    <div className="betrayals-inbox__intel-links">
      {moment.reportGuestId && (
        <button
          type="button"
          className="betrayals-ceremony-action--secondary betrayals-inbox__intel"
          aria-description={hasMyPulse ? undefined : 'My Pulse feature'}
          onClick={() => onOpenIntel(moment.reportGuestId!)}
        >
          Open in Intel
          {!hasMyPulse && <InboxVipEye feature="My Pulse" />}
        </button>
      )}
    </div>
  )
  const hasIntel = moment?.reportGuestId && onOpenIntel
  const showFeedback = response || replies.length > 0

  useEffect(() => {
    const element = cardRef.current
    if (!unread || !element) return
    if (typeof IntersectionObserver === 'undefined') {
      onRead(id)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.55)) {
          onRead(id)
          observer.disconnect()
        }
      },
      { threshold: 0.55 }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [id, onRead, unread])

  return (
    <div
      ref={cardRef}
      className={[
        'inbox-item',
        `inbox-item--priority-${priority}`,
        'inbox-item--policy-required',
        kind === 'alliance' && 'inbox-item--alliance',
        unread && 'inbox-item--unread',
        response && 'inbox-item--resolved',
      ]
        .filter(Boolean)
        .join(' ')}
      role="listitem"
    >
      <div className="betrayals-inbox__card-head">
        <IncomingInboxCardHeader
          avatar={
            <PlayerAvatar
              size="sm"
              player={{
                id: speaker.id,
                name: speaker.name,
                avatar: speaker.portrait ?? '',
                status: 'active',
              }}
              showRelationshipOutline={false}
              showEvictedStyle={false}
            />
          }
          sender={speaker.name}
          icon={icon}
          typeLabel={interaction.title ?? label}
          status={
            response
              ? `Resolved · ${choices[response] ?? 'Heard'}`
              : interaction.required
                ? 'Reply required'
                : unread
                  ? 'New'
                  : null
          }
          unread={unread}
        />
        {moment?.callbackGuestId &&
          onOpenIntel &&
          moment.callbackGuestId !== moment.reportGuestId && (
            <button
              type="button"
              className="betrayals-ceremony-action--secondary betrayals-inbox__intel"
              aria-description={hasMyPulse ? undefined : 'My Pulse feature'}
              onClick={() => onOpenIntel(moment.callbackGuestId!)}
            >
              Follow up in Intel
              {!hasMyPulse && <InboxVipEye feature="My Pulse" />}
            </button>
          )}
      </div>
      {moment?.callback && <p className="inbox-item__outcome">{moment.callback}</p>}
      <p className="inbox-item__text">{text}</p>
      {showFeedback && (
        <div className="inbox-item__feedback betrayals-inbox__result">
          <div className="betrayals-inbox__response" aria-label="Response" aria-live="polite">
            {replies.length > 0 ? (
              replies.map((reply) => (
                <p className="inbox-item__outcome" key={reply}>
                  {reply}
                </p>
              ))
            ) : (
              <p className="inbox-item__outcome">{moment?.reportText ?? outcome(interaction)}</p>
            )}
          </div>
          {hasIntel && intelLinks}
        </div>
      )}
      {(!response || hasOpenFollowUp(interaction)) && (
        <div className="inbox-item__actions">
          {response !== 'dismiss' && shieldFollowUp?.canRequest && (
            <button
              type="button"
              className="inbox-action inbox-action--positive"
              onClick={() => onRespond(id, 'request-shield')}
            >
              Request the shield
            </button>
          )}
          {response !== 'dismiss' && shieldFollowUp?.canAskPlans && (
            <button
              type="button"
              className="inbox-action inbox-action--neutral"
              onClick={() => onRespond(id, 'ask-shield-plans')}
            >
              Ask about shield plans
            </button>
          )}
          {!response &&
            moment?.options.map(({ action, label, cost, reason }) => {
              const locked = !hasRealityMode && isPremiumCastleChoice(action)
              return (
                <button
                  key={action}
                  type="button"
                  className="inbox-action inbox-action--neutral betrayals-inbox__reply"
                  aria-description={locked ? 'Reality Mode feature' : undefined}
                  disabled={!!reason}
                  title={reason}
                  onClick={() => onRespond(id, action)}
                >
                  <span>{label}</span>
                  <BetrayalsResourceCosts cost={cost} />
                  {locked && <InboxVipEye feature="Reality Mode" />}
                </button>
              )
            })}
          {!response &&
            (moment ? (['dismiss'] as const) : (['engage', 'listen', 'dismiss'] as const)).map(
              (answer) =>
                choices[answer] ? (
                  <button
                    key={answer}
                    type="button"
                    className={`inbox-action inbox-action--${answerStyles[answer]}`}
                    onClick={() => onRespond(id, answer)}
                  >
                    {choices[answer]}
                  </button>
                ) : null
            )}
          {!response && kind === 'vote-plan' && onDiscussVote && (
            <button
              type="button"
              className="inbox-action inbox-action--neutral"
              onClick={() => onDiscussVote(speaker.id)}
            >
              Counter in Social
            </button>
          )}
        </div>
      )}
      {!showFeedback && hasIntel && intelLinks}
    </div>
  )
}

export function BetrayalsIncomingInteractions({
  interactions,
  onRespond,
  onClose,
  readIds,
  onRead,
  onDiscussVote,
  onOpenIntel,
  hasRealityMode = false,
  hasMyPulse = false,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [localReadIds, setLocalReadIds] = useState<ReadonlySet<string>>(() => new Set())
  const [recentIds, setRecentIds] = useState<ReadonlySet<string>>(() => new Set())
  const markRead = useCallback(
    (id: string) => {
      if (onRead) onRead(id)
      else setLocalReadIds((current) => (current.has(id) ? current : new Set([...current, id])))
    },
    [onRead]
  )

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (typeof dialog.showModal === 'function') {
      dialog.showModal()
      return () => dialog.close()
    }
    dialog.setAttribute('open', '')
    return () => dialog.removeAttribute('open')
  }, [])

  function respond(id: string, answer: IncomingAction) {
    setRecentIds((current) => new Set([...current, id]))
    onRespond(id, answer)
  }

  const pendingCount = interactions.filter(({ response }) => !response).length
  const current = interactions.filter(
    (entry) => !entry.response || recentIds.has(entry.id) || hasOpenFollowUp(entry)
  )
  const alliances = current.filter(({ kind }) => kind === 'alliance')
  const messages = current.filter(({ kind }) => kind !== 'alliance')
  const history = interactions.filter((entry) => !current.includes(entry))
  const renderMessage = (interaction: IncomingInteraction) => (
    <InboxMessage
      key={interaction.id}
      interaction={interaction}
      read={(readIds ?? localReadIds).has(interaction.id)}
      onRead={markRead}
      onRespond={respond}
      onDiscussVote={onDiscussVote}
      onOpenIntel={onOpenIntel}
      hasRealityMode={hasRealityMode}
      hasMyPulse={hasMyPulse}
    />
  )

  return (
    <dialog
      ref={dialogRef}
      className="inbox-backdrop betrayals-incoming-dialog"
      aria-label="Incoming interactions"
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <div className="inbox-panel">
        <IncomingInboxHeader
          summary={pendingCount ? `${pendingCount} to answer` : 'All caught up'}
          onClose={onClose}
        />
        <div className="inbox-list">
          {interactions.length ? (
            <div className="inbox-sections">
              {alliances.length > 0 && (
                <section className="inbox-section" aria-label="Alliance proposals and decisions">
                  <h3 className="inbox-section__title">
                    Alliance proposals and votes · {alliances.length}
                  </h3>
                  <div className="inbox-section__list" role="list">
                    {alliances.map(renderMessage)}
                  </div>
                </section>
              )}
              {messages.length > 0 && (
                <section className="inbox-section" aria-label="Messages">
                  <h3 className="inbox-section__title">Messages</h3>
                  <div className="inbox-section__list" role="list">
                    {messages.map(renderMessage)}
                  </div>
                </section>
              )}
              {history.length > 0 && (
                <details className="inbox-section inbox-section--history">
                  <summary className="inbox-section__title inbox-section__title--resolved">
                    History · {history.length}
                  </summary>
                  <div className="inbox-section__list" role="list">
                    {history.map(renderMessage)}
                  </div>
                </details>
              )}
            </div>
          ) : (
            <p className="inbox-empty">No incoming interactions.</p>
          )}
        </div>
      </div>
    </dialog>
  )
}

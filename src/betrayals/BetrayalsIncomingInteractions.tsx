import { useCallback, useEffect, useRef, useState } from 'react'
import {
  IncomingInboxCardHeader,
  IncomingInboxHeader,
} from '../components/IncomingInteractionsInbox/IncomingInboxChrome'
import type { IncomingInteractionIconName } from '../components/IncomingInteractionsInbox/IncomingInteractionIcon'
import PlayerAvatar from '../components/PlayerAvatar/PlayerAvatar'
import type { IncomingInteraction } from './incoming'
import type { IncomingAnswer } from './run'
import './betrayals-incoming.css'

type Props = {
  interactions: readonly IncomingInteraction[]
  onRespond: (id: string, answer: IncomingAnswer) => void
  onClose: () => void
}

type ConversationCard = {
  icon: IncomingInteractionIconName
  label: string
  priority: 'low' | 'medium'
  choices: Partial<Record<IncomingAnswer, string>> & Record<'engage' | 'dismiss', string>
}

const cards: Record<IncomingInteraction['kind'], ConversationCard> = {
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
}

const answerStyles = { engage: 'positive', listen: 'neutral', dismiss: 'dismiss' } as const

function outcome({ response, kind, speaker, target }: IncomingInteraction) {
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
}: {
  interaction: IncomingInteraction
  read: boolean
  onRead: (id: string) => void
  onRespond: Props['onRespond']
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const { id, kind, speaker, response, text } = interaction
  const { icon, label, choices, priority } = cards[kind]
  const unread = !read && !response

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
        typeLabel={label}
        status={response ? `Resolved · ${choices[response] ?? 'Heard'}` : unread ? 'New' : null}
        unread={unread}
      />
      <p className="inbox-item__text">{text}</p>
      {response ? (
        <div className="inbox-item__feedback" aria-label="Response" aria-live="polite">
          <p className="inbox-item__outcome">{outcome(interaction)}</p>
        </div>
      ) : (
        <div className="inbox-item__actions">
          {(['engage', 'listen', 'dismiss'] as const).map((answer) =>
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
        </div>
      )}
    </div>
  )
}

export function BetrayalsIncomingInteractions({ interactions, onRespond, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(() => new Set())
  const [recentIds, setRecentIds] = useState<ReadonlySet<string>>(() => new Set())
  const markRead = useCallback((id: string) => {
    setReadIds((current) => (current.has(id) ? current : new Set([...current, id])))
  }, [])

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

  function respond(id: string, answer: IncomingAnswer) {
    setRecentIds((current) => new Set([...current, id]))
    onRespond(id, answer)
  }

  const pendingCount = interactions.filter(({ response }) => !response).length
  const current = interactions.filter(({ id, response }) => !response || recentIds.has(id))
  const alliances = current.filter(({ kind }) => kind === 'alliance')
  const messages = current.filter(({ kind }) => kind !== 'alliance')
  const history = interactions.filter(({ id, response }) => response && !recentIds.has(id))
  const renderMessage = (interaction: IncomingInteraction) => (
    <InboxMessage
      key={interaction.id}
      interaction={interaction}
      read={readIds.has(interaction.id)}
      onRead={markRead}
      onRespond={respond}
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

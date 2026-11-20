import type { ReactNode } from 'react'
import GameBackButton from '../ui/GameBackButton/GameBackButton'
import IncomingInteractionIcon, {
  type IncomingInteractionIconName,
} from './IncomingInteractionIcon'
import './IncomingInteractionsInbox.css'

type InboxHeaderProps = {
  summary: string
  mode?: string
  reputation?: ReactNode
  onClose: () => void
}

export function IncomingInboxHeader({ summary, mode, reputation, onClose }: InboxHeaderProps) {
  return (
    <header className="inbox-header">
      <div className="inbox-header__top">
        <div className="inbox-header__title">
          <IncomingInteractionIcon name="inbox" className="inbox-header__title-icon" />
          <span className="inbox-header__title-text">Incoming Interactions</span>
          {mode && <span className="inbox-header__mode">{mode}</span>}
        </div>
        <GameBackButton className="inbox-header__close" label="Close inbox" onClick={onClose} />
      </div>
      <div className="inbox-header__meta">
        {reputation}
        <span className="inbox-header__summary">{summary}</span>
      </div>
    </header>
  )
}

type InboxCardHeaderProps = {
  avatar: ReactNode
  sender: string
  typeLabel: string
  icon: IncomingInteractionIconName
  context?: ReactNode
  status?: string | null
  unread?: boolean
  important?: boolean
}

export function IncomingInboxCardHeader({
  avatar,
  sender,
  typeLabel,
  icon,
  context,
  status,
  unread,
  important,
}: InboxCardHeaderProps) {
  return (
    <div className="inbox-item__header">
      {avatar}
      <div className="inbox-item__title">
        <div className="inbox-item__from-row">
          <span className="inbox-item__from">{sender}</span>
          {important && (
            <span className="inbox-item__priority inbox-item__priority--high">Important</span>
          )}
        </div>
        <div className="inbox-item__type-row">
          <span className="inbox-item__type-icon">
            <IncomingInteractionIcon name={icon} />
          </span>
          <span className="inbox-item__type">{typeLabel}</span>
          {context}
        </div>
      </div>
      {status && (
        <span className={`inbox-item__status${unread ? ' inbox-item__status--new' : ''}`}>
          {status}
        </span>
      )}
    </div>
  )
}

import type { ReactNode } from 'react'
import { accountLabel, accountText } from './pulseView'
import type { PlayerAccount } from './pulseView'

export function InvestigationAccountCard({
  account,
  name,
  children,
  inPulse = false,
}: {
  account: PlayerAccount
  name: (id: string) => string
  children?: ReactNode
  inPulse?: boolean
}) {
  return (
    <article
      className={
        inPulse
          ? 'investigation-account house-pulse__card house-pulse__card--intel'
          : 'investigation-account'
      }
      data-access={account.access}
    >
      <header className={inPulse ? 'house-pulse__card-top' : undefined}>
        <span>{accountLabel(account)}</span>
        <span>Day {account.claim?.day ?? account.day}</span>
      </header>
      <p>{accountText(account, name)}</p>
      {(account.speakerId || account.nearbyId) && (
        <small>
          {account.speakerId && (
            <span>
              {name(account.speakerId)}
              {account.sourceId ? `, via ${name(account.sourceId)}` : ''}
            </span>
          )}
          {account.nearbyId && <span>{name(account.nearbyId)} was nearby.</span>}
        </small>
      )}
      {children && <div className="investigation-account__actions">{children}</div>}
    </article>
  )
}

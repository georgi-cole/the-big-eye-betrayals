import type { ReactNode } from 'react'
import { accountLabel, accountText } from './pulseView'
import type { PlayerAccount } from './pulseView'

export function InvestigationAccountCard({
  account,
  name,
  children,
}: {
  account: PlayerAccount
  name: (id: string) => string
  children?: ReactNode
}) {
  return (
    <article className="investigation-account" data-access={account.access}>
      <header>
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

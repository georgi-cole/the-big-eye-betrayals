import { useState } from 'react'
import HubmateChoiceChip from '../components/SocialPanelV2/HubmateChoiceChip'
import type { Player } from '../types'
import '../components/RealityLedger/RealityLedger.css'
import { InvestigationAccountCard } from './InvestigationAccountCard'
import type { InvestigationAction } from './investigation'
import { isVoteClaim } from './investigationRecords'
import type { ObservationFocus } from './investigationRecords'
import { accountText } from './pulseView'
import type { GuestProfile, PlayerAccount } from './pulseView'
import './betrayals-pulse.css'

export type InvestigationControls = {
  profile: (id: string) => GuestProfile
  remaining: number
  open: boolean
  reason: (action: InvestigationAction) => string | undefined
  act: (action: InvestigationAction) => void
  openPulse: (guestId?: string) => void
}

export function InvestigationButton({
  investigation,
  action,
  children,
}: {
  investigation: Pick<InvestigationControls, 'reason' | 'act'>
  action: InvestigationAction
  children: string
}) {
  const reason = investigation.reason(action)
  return (
    <button
      type="button"
      title={reason}
      disabled={Boolean(reason)}
      onClick={() => investigation.act(action)}
    >
      {children}
    </button>
  )
}

const observationChoices = [
  ['actions', 'Actions'],
  ['contacts', 'Contacts'],
  ['demeanor', 'Demeanor'],
] as const satisfies ReadonlyArray<readonly [ObservationFocus, string]>

export function BetrayalsGuestProfile({
  profile,
  investigation,
  contacts,
  name,
}: {
  profile: GuestProfile
  investigation: InvestigationControls
  contacts: readonly Player[]
  name: (id: string) => string
}) {
  const [focus, setFocus] = useState<ObservationFocus>('actions')
  const [partner, setPartner] = useState('')
  const [referenceId, setReferenceId] = useState('')
  const { guestId, accounts, metrics, saved } = profile
  const partners = contacts.filter(({ id }) => id !== guestId)
  const recent = accounts.filter(({ claim }) => Boolean(claim)).slice(0, 6)
  const selected = recent.find(({ id }) => id === referenceId)
  const lastReports = accounts.filter(({ access }) => access !== 'observed').slice(0, 3)
  const lastObservation = accounts.find(({ method }) => method === 'observe')
  const latestWatch = profile.watches.at(-1)
  const observe: InvestigationAction = { kind: 'observe', guestId, focus }
  const reason = investigation.reason(observe)
  const attention = ['Spent', 'Brief', 'Steady', 'Sharp'][investigation.remaining] ?? 'Spent'

  function actionsFor(account: PlayerAccount) {
    const { id, speakerId, nearbyId } = account
    const specific = isVoteClaim(account.claim) && !account.claim.denies
    const witness = profile.witnessRequests.find(({ reportId }) => id === reportId)
    return (
      <>
        <button
          type="button"
          aria-pressed={saved.includes(id)}
          onClick={() => investigation.act({ kind: 'save', reportId: id })}
        >
          {saved.includes(id) ? 'Saved to Intel' : 'Save to Intel'}
        </button>
        {investigation.open && (
          <>
            {nearbyId && partners.some(({ id }) => id === nearbyId) && (
              <InvestigationButton
                investigation={investigation}
                action={{ kind: 'ask', guestId, speakerId: nearbyId, referenceId: id }}
              >{`Ask ${name(nearbyId)} · 1 Energy`}</InvestigationButton>
            )}
            {account.access === 'hearsay' && !account.sourceId && (
              <InvestigationButton
                investigation={investigation}
                action={{ kind: 'source', reportId: id }}
              >
                Trace source · 1 Energy
              </InvestigationButton>
            )}
            {account.sourceId && partners.some(({ id }) => id === account.sourceId) && (
              <InvestigationButton
                investigation={investigation}
                action={{ kind: 'ask', guestId, speakerId: account.sourceId, referenceId: id }}
              >{`Check with ${name(account.sourceId)} · 1 Energy`}</InvestigationButton>
            )}
            {specific && account.access !== 'statement' && (
              <InvestigationButton
                investigation={investigation}
                action={{ kind: 'confront', reportId: id }}
              >
                Ask them privately · 1 Energy
              </InvestigationButton>
            )}
            {specific &&
              speakerId &&
              account.access === 'firsthand' &&
              (witness ? (
                <small>
                  {witness.accepted
                    ? `${name(speakerId)} agreed to speak.`
                    : `${name(speakerId)} declined to speak.`}
                </small>
              ) : (
                <InvestigationButton
                  investigation={investigation}
                  action={{ kind: 'witness', reportId: id }}
                >
                  Ask to testify · 1 Energy
                </InvestigationButton>
              ))}
          </>
        )}
      </>
    )
  }

  return (
    <details className="sp2-focus__full-read guest-profile">
      <summary>View full profile</summary>
      <div className="guest-profile__body">
        <section
          className="reality-ledger__relationship guest-profile__metrics"
          aria-label={`${profile.name} profile traits`}
        >
          {metrics.map(({ label, value, level, detail, reported }) => (
            <div className="guest-profile__metric" key={label}>
              <div className="guest-profile__metric-row">
                <span>{label}</span>
                <span
                  className="reality-ledger__relationship-meter"
                  role={level === undefined ? undefined : 'meter'}
                  aria-hidden={level === undefined || undefined}
                  aria-label={label}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={level}
                  aria-valuetext={value}
                >
                  {level !== undefined && (
                    <span
                      className="reality-ledger__relationship-meter-fill"
                      style={{ width: `${level}%` }}
                    />
                  )}
                </span>
                <small>{value ?? 'Too little to tell'}</small>
              </div>
              {detail && <small>{detail}</small>}
              {reported && (
                <details className="guest-profile__metric-account">
                  <summary>
                    {reported.speakerId ? `${name(reported.speakerId)}'s account` : 'Reported'}
                  </summary>
                  <small>{accountText(reported, name)}</small>
                </details>
              )}
            </div>
          ))}
          <small>Based on what you’ve seen so far.</small>
        </section>

        {(investigation.open || lastObservation) && (
          <section
            className="guest-profile__section guest-profile__observe"
            aria-label="Observation"
          >
            <header>
              <h3>Observe</h3>
              {investigation.open && (
                <span>
                  {attention} focus · {investigation.remaining} left today
                </span>
              )}
            </header>
            {investigation.open && (
              <>
                <div className="investigation-choices" role="group" aria-label="Observation focus">
                  {observationChoices.map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      className="hubmate-choice-chip"
                      aria-pressed={focus === id}
                      onClick={() => setFocus(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="guest-profile__actions">
                  <InvestigationButton investigation={investigation} action={observe}>
                    Observe · 1 Energy
                  </InvestigationButton>
                </div>
                {reason && <small>{reason}</small>}
              </>
            )}
            {lastObservation && (
              <InvestigationAccountCard account={lastObservation} name={name}>
                {actionsFor(lastObservation)}
              </InvestigationAccountCard>
            )}
          </section>
        )}

        <section className="guest-profile__section" aria-label="Other accounts">
          <header>
            <h3>Other accounts</h3>
            <button type="button" onClick={() => investigation.openPulse(guestId)}>
              Open Intel
            </button>
          </header>
          {investigation.open && partners.length > 0 && (
            <>
              <div className="guest-profile__choices">
                <span>Speak to{partner ? ` · ${name(partner)}` : ''}</span>
                <div
                  className="investigation-choices investigation-choices--scroll"
                  role="group"
                  aria-label="Speak to a guest"
                >
                  {partners.map((guest) => (
                    <HubmateChoiceChip
                      key={guest.id}
                      player={guest}
                      label={guest.name}
                      selected={partner === guest.id}
                      onClick={() => setPartner(guest.id)}
                    />
                  ))}
                </div>
                {recent.length > 0 && (
                  <>
                    <span>Ask about</span>
                    <div
                      className="investigation-choices investigation-choices--scroll"
                      role="group"
                      aria-label="What to ask about"
                    >
                      <button
                        type="button"
                        className="hubmate-choice-chip"
                        aria-pressed={!selected}
                        onClick={() => setReferenceId('')}
                      >
                        General impression
                      </button>
                      {recent.map((account) => (
                        <button
                          key={account.id}
                          type="button"
                          className="hubmate-choice-chip"
                          aria-pressed={selected?.id === account.id}
                          onClick={() => setReferenceId(account.id)}
                        >
                          Day {account.claim?.day} ·{' '}
                          {account.speakerId ? name(account.speakerId) : 'Your observation'}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div className="guest-profile__actions">
                <InvestigationButton
                  investigation={investigation}
                  action={{ kind: 'ask', guestId, speakerId: partner, referenceId: selected?.id }}
                >
                  Ask Around · 1 Energy
                </InvestigationButton>
                <InvestigationButton
                  investigation={investigation}
                  action={{ kind: 'watch', guestId, speakerId: partner }}
                >
                  Ask to Watch · 1 Energy
                </InvestigationButton>
              </div>
              {partner && selected?.claim?.behavior && (
                <details className="guest-profile__share">
                  <summary>Discuss this account</summary>
                  <div className="guest-profile__actions">
                    <InvestigationButton
                      investigation={investigation}
                      action={{
                        kind: 'share',
                        reportId: selected.id,
                        speakerId: partner,
                        mode: 'attribute',
                      }}
                    >
                      Credit the source · 1 Energy
                    </InvestigationButton>
                    <InvestigationButton
                      investigation={investigation}
                      action={{
                        kind: 'share',
                        reportId: selected.id,
                        speakerId: partner,
                        mode: 'private-source',
                      }}
                    >
                      Keep the source private · 1 Energy
                    </InvestigationButton>
                    {isVoteClaim(selected.claim) && !selected.claim.denies && (
                      <InvestigationButton
                        investigation={investigation}
                        action={{
                          kind: 'share',
                          reportId: selected.id,
                          speakerId: partner,
                          mode: 'challenge',
                        }}
                      >
                        Dispute the account · 1 Energy
                      </InvestigationButton>
                    )}
                  </div>
                  {profile.shares.some(
                    ({ reportId, listenerId }) => reportId === selected.id && listenerId === partner
                  ) && <small>You discussed this with {name(partner)}.</small>}
                </details>
              )}
            </>
          )}
          {latestWatch && (
            <small>
              {name(latestWatch.watcherId)} ·{' '}
              {
                {
                  waiting: 'Will look tomorrow',
                  declined: 'Declined to watch',
                  reported: 'Sent an account',
                  missed: 'Could not see enough',
                }[latestWatch.status]
              }
            </small>
          )}
          <div className="guest-profile__accounts" aria-live="polite">
            {lastReports.map((account) => (
              <InvestigationAccountCard account={account} name={name} key={account.id}>
                {actionsFor(account)}
              </InvestigationAccountCard>
            ))}
          </div>
          {!lastReports.length && (
            <p className="pulse-empty">You have no accounts about this guest yet.</p>
          )}
        </section>
      </div>
    </details>
  )
}

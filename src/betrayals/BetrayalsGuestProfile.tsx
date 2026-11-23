import { useState } from 'react'
import { InvestigationAccountCard } from './InvestigationAccountCard'
import type { InvestigationAction } from './investigation'
import { isVoteClaim, PERSONAL_NOTE_LIMIT, TRAIT_READS } from './investigationRecords'
import type { ObservationFocus, PersonalRead, ProfileTrait } from './investigationRecords'
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

function ReadEditor({
  profile,
  onSave,
}: {
  profile: GuestProfile
  onSave: (note: PersonalRead) => void
}) {
  const [leaning, setLeaning] = useState<PersonalRead['leaning']>(profile.note?.leaning ?? 'open')
  const [text, setText] = useState(profile.note?.text ?? '')
  const [traits, setTraits] = useState<NonNullable<PersonalRead['traits']>>(
    profile.note?.traits ?? {}
  )
  const dirty =
    leaning !== (profile.note?.leaning ?? 'open') ||
    text.trim() !== (profile.note?.text ?? '') ||
    profile.metrics.some(({ id }) => traits[id] !== profile.note?.traits?.[id])
  function setTrait(id: ProfileTrait, value: string) {
    setTraits((current) => {
      const next = { ...current }
      if (value) next[id] = value as (typeof TRAIT_READS)[number]
      else delete next[id]
      return next
    })
  }
  return (
    <form
      className="guest-profile__read"
      onSubmit={(event) => {
        event.preventDefault()
        onSave({ leaning, text, traits })
      }}
    >
      <label>
        My read
        <select
          value={leaning}
          onChange={(event) => setLeaning(event.target.value as PersonalRead['leaning'])}
        >
          <option value="open">Undecided</option>
          <option value="trust">Trust</option>
          <option value="suspect">Suspect</option>
        </select>
      </label>
      <label>
        Private note
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={PERSONAL_NOTE_LIMIT}
          rows={2}
        />
      </label>
      <details className="guest-profile__trait-read">
        <summary>Rate specific traits</summary>
        <div>
          {profile.metrics.map(({ id, label }) => (
            <label key={id}>
              {label}
              <select
                value={traits[id] ?? ''}
                onChange={(event) => setTrait(id, event.target.value)}
              >
                <option value="">Undecided</option>
                {TRAIT_READS.map((level) => (
                  <option key={level} value={level}>
                    {level.charAt(0).toUpperCase() + level.slice(1)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </details>
      <button type="submit" disabled={!dirty}>
        Save my read
      </button>
    </form>
  )
}

export function BetrayalsGuestProfile({
  profile,
  investigation,
  contacts,
  name,
}: {
  profile: GuestProfile
  investigation: InvestigationControls
  contacts: readonly { id: string; name: string }[]
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
    <details className="guest-profile">
      <summary>
        View Profile<span>{profile.name}</span>
      </summary>
      <div className="guest-profile__body">
        {investigation.open && (
          <section
            className="guest-profile__section guest-profile__observe"
            aria-label="Observation"
          >
            <header>
              <h3>Observe</h3>
              <span>
                {attention} focus · {investigation.remaining} left today
              </span>
            </header>
            <div className="guest-profile__fields">
              <label>
                Watch for
                <select
                  value={focus}
                  onChange={(event) => setFocus(event.target.value as ObservationFocus)}
                >
                  <option value="actions">Actions</option>
                  <option value="contacts">Contacts</option>
                  <option value="demeanor">Demeanor</option>
                </select>
              </label>
              <InvestigationButton investigation={investigation} action={observe}>
                Observe · 1 Energy
              </InvestigationButton>
            </div>
            {reason && <small>{reason}</small>}
          </section>
        )}

        <section className="guest-profile__section" aria-label="Observed behavior">
          <header>
            <h3>Observed behavior</h3>
            <button type="button" onClick={() => investigation.openPulse(guestId)}>
              Open Intel
            </button>
          </header>
          {lastObservation && (
            <InvestigationAccountCard account={lastObservation} name={name}>
              {actionsFor(lastObservation)}
            </InvestigationAccountCard>
          )}
          <dl className="guest-profile__metrics">
            {metrics.map(({ label, value, detail, reported, personal }) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  {value ?? 'Too little to tell'}
                  {detail && <small>{detail}</small>}
                  {reported && (
                    <details className="guest-profile__metric-account">
                      <summary>
                        {reported.speakerId ? `${name(reported.speakerId)}’s account` : 'Reported'}
                      </summary>
                      <small>{accountText(reported, name)}</small>
                    </details>
                  )}
                  {personal && (
                    <small className="guest-profile__personal">My read · {personal}</small>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="guest-profile__section" aria-label="Other accounts">
          <header>
            <h3>Other accounts</h3>
          </header>
          {investigation.open && partners.length > 0 && (
            <>
              <div className="guest-profile__fields">
                <label>
                  Speak to
                  <select value={partner} onChange={(event) => setPartner(event.target.value)}>
                    <option value="">Choose a guest</option>
                    {partners.map(({ id, name }) => (
                      <option value={id} key={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                {recent.length > 0 && (
                  <label>
                    About
                    <select
                      value={selected?.id ?? ''}
                      onChange={(event) => setReferenceId(event.target.value)}
                    >
                      <option value="">General impression</option>
                      {recent.map((account) => (
                        <option value={account.id} key={account.id}>
                          Day {account.claim?.day} ·{' '}
                          {account.speakerId ? name(account.speakerId) : 'Your observation'}
                        </option>
                      ))}
                    </select>
                  </label>
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

        <ReadEditor
          profile={profile}
          onSave={(note) => investigation.act({ kind: 'note', guestId, note })}
        />
      </div>
    </details>
  )
}

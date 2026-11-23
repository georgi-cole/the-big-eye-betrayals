import { useEffect, useRef, useState } from 'react'
import HubmateChoiceChip from '../components/SocialPanelV2/HubmateChoiceChip'
import GameBackButton from '../components/ui/GameBackButton/GameBackButton'
import '../components/HousePulse/HousePulse.css'
import { compareReportAccounts } from './investigationEvidence'
import type { InvestigationAction } from './investigation'
import type { GameLogEntry } from './gameLog'
import { InvestigationAccountCard } from './InvestigationAccountCard'
import type { pulseView } from './pulseView'
import './betrayals-pulse.css'

const tabs = ['Today', 'Intel', 'Commitments'] as const
export type PulseLocation = { tab: (typeof tabs)[number]; guestId?: string }
type View = ReturnType<typeof pulseView>

function Timelines({ entries, day }: { entries: readonly GameLogEntry[]; day: number }) {
  const byDay = new Map<number, GameLogEntry[]>()
  for (const entry of entries) {
    const events = byDay.get(entry.day) ?? []
    events.push(entry)
    byDay.set(entry.day, events)
  }
  return (
    <div className="pulse-timeline">
      {Array.from(byDay.entries())
        .sort(([first], [second]) => second - first)
        .map(([entryDay, events]) => (
          <details key={entryDay} open={entryDay === day || undefined}>
            <summary>
              Day {entryDay}
              <span>
                {events.length} {events.length === 1 ? 'event' : 'events'}
              </span>
            </summary>
            <ol>
              {events.map(({ text, kind }, index) => (
                <li key={index} data-kind={kind}>
                  {text}
                </li>
              ))}
            </ol>
          </details>
        ))}
      {!byDay.size && <p className="pulse-empty">Your season journal is ready.</p>}
    </div>
  )
}

function Commitments({
  view,
  day,
  humanId,
  name,
}: {
  view: View
  day: number
  humanId: string
  name: (id: string) => string
}) {
  const { activePacts, alliances, commitments, watches, witnesses, accounts } = view
  return (
    <ul className="pulse-commitments">
      {activePacts.map(({ id, name }) => (
        <li key={id}>
          <strong>{name}</strong>
          <span>Personal pact</span>
        </li>
      ))}
      {alliances.map(({ id, name, memberIds }) => (
        <li key={id}>
          <strong>{name}</strong>
          <span>
            {memberIds
              .map((member) =>
                member === humanId
                  ? 'You'
                  : (view.guests.find(({ id }) => id === member)?.name ?? 'Guest')
              )
              .join(', ')}
          </span>
        </li>
      ))}
      {witnesses.map(({ reportId, accepted, day: askedDay }) => {
        const account = accounts.find(({ id }) => id === reportId)
        if (!account?.speakerId) return null
        return (
          <li key={`${askedDay}:${reportId}`}>
            <strong>{name(account.speakerId)} · witness</strong>
            <span>
              Day {askedDay} · {accepted ? 'Agreed to speak' : 'Declined to speak'}
            </span>
          </li>
        )
      })}
      {watches.map(({ guestId, watcherId, day: askedDay, status }) => (
        <li key={askedDay}>
          <strong>
            {name(watcherId)} · watch {name(guestId)}
          </strong>
          <span>
            Day {askedDay} ·{' '}
            {
              {
                waiting: 'Waiting for the next Social phase',
                declined: 'Declined',
                reported: 'Account added to Intel',
                missed: 'Could not see enough',
              }[status]
            }
          </span>
        </li>
      ))}
      {commitments.map(({ actorId, recipientId, suspectId, day: agreed, pledgeResult }, index) => {
        const own = actorId === humanId
        const guestId = own ? recipientId : actorId
        const status =
          pledgeResult === 'void'
            ? 'No longer applicable'
            : pledgeResult
              ? (own ? pledgeResult.recipient : pledgeResult.actor)
                ? 'They kept the agreement'
                : 'They changed their vote'
              : agreed === day
                ? 'Awaiting the vote'
                : 'Outcome unclear'
        return (
          <li key={`${agreed}:${guestId}:${index}`}>
            <strong>
              {name(guestId)} · vote {suspectId ? `for ${name(suspectId)}` : 'agreement'}
            </strong>
            <span>
              Day {agreed} · {status}
            </span>
          </li>
        )
      })}
      {!activePacts.length &&
        !alliances.length &&
        !commitments.length &&
        !watches.length &&
        !witnesses.length && (
          <li className="pulse-empty">
            Your vote agreements, pacts and witness arrangements will appear here.
          </li>
        )}
    </ul>
  )
}

export function BetrayalsPulse({
  day,
  humanId,
  entries,
  view,
  initial,
  onClose,
  onAction,
}: {
  day: number
  humanId: string
  entries: readonly GameLogEntry[]
  view: View
  initial: PulseLocation
  onClose: () => void
  onAction: (action: InvestigationAction) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [tab, setTab] = useState(initial.tab)
  const [guestId, setGuestId] = useState(initial.guestId ?? '')
  const [savedOnly, setSavedOnly] = useState(false)
  const [compareIds, setCompareIds] = useState<string[]>([])
  const name = (id: string) =>
    id === humanId ? 'You' : (view.guests.find((guest) => guest.id === id)?.name ?? 'Guest')
  const accounts = view.accounts.filter(
    (account) =>
      (!guestId || account.guestId === guestId) && (!savedOnly || view.saved.includes(account.id))
  )
  const selected = compareIds.flatMap((id) => {
    const account = view.accounts.find((item) => item.id === id)
    return account ? [account] : []
  })
  const recent = view.accounts.filter((report) => report.day === day && report.claim).slice(0, 2)
  const notes = Object.entries(view.notes).filter(
    ([id, note]) => (!guestId || id === guestId) && note.text
  )

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (typeof element.showModal === 'function') {
      element.showModal()
      return () => element.close()
    }
    element.setAttribute('open', '')
    return () => element.removeAttribute('open')
  }, [])

  function chooseForComparison(id: string) {
    setCompareIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current.slice(-1), id]
    )
  }

  return (
    <dialog
      ref={dialog}
      className="house-pulse__sheet betrayals-pulse"
      aria-labelledby="betrayals-pulse-title"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <header className="house-pulse__header">
        <div>
          <span className="house-pulse__eyebrow">Day {day}</span>
          <h2 id="betrayals-pulse-title">My Pulse</h2>
          <p>Your latest developments, learned intel and commitments.</p>
        </div>
        <GameBackButton className="house-pulse__back" label="Close My Pulse" onClick={onClose} />
      </header>
      <nav className="house-pulse__tabs" aria-label="My Pulse sections">
        {tabs.map((item) => (
          <button
            type="button"
            key={item}
            className={tab === item ? 'is-active' : undefined}
            aria-pressed={tab === item}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </nav>
      <div className="house-pulse__content" key={tab}>
        {tab === 'Today' && (
          <>
            {recent.length > 0 && (
              <section className="pulse-new" aria-label="New intel today">
                <header>
                  <h3>New intel</h3>
                  <button type="button" onClick={() => setTab('Intel')}>
                    Open Intel
                  </button>
                </header>
                {recent.map((account) => (
                  <InvestigationAccountCard
                    key={account.id}
                    account={account}
                    name={name}
                    inPulse
                  />
                ))}
              </section>
            )}
            <Timelines entries={entries} day={day} />
          </>
        )}
        {tab === 'Intel' && (
          <>
            <div className="pulse-tools">
              <div className="pulse-tools__top">
                <span>{guestId ? name(guestId) : 'All guests'}</span>
                <button
                  type="button"
                  className="house-pulse__link"
                  aria-pressed={savedOnly}
                  onClick={() => setSavedOnly(!savedOnly)}
                >
                  Saved only
                </button>
              </div>
              <div
                className="investigation-choices investigation-choices--scroll"
                role="group"
                aria-label="Filter intel by guest"
              >
                <button
                  type="button"
                  className="hubmate-choice-chip"
                  aria-pressed={!guestId}
                  onClick={() => setGuestId('')}
                >
                  All guests
                </button>
                {view.guests.map(({ id, name, portrait }) => (
                  <HubmateChoiceChip
                    key={id}
                    player={{ id, name, avatar: portrait ?? '', status: 'active' }}
                    label={name}
                    selected={guestId === id}
                    onClick={() => setGuestId(id)}
                  />
                ))}
              </div>
            </div>
            {selected.length > 0 && (
              <section className="pulse-comparison" aria-label="Compare accounts">
                <header>
                  <h3>Compare accounts</h3>
                  <button type="button" onClick={() => setCompareIds([])}>
                    Clear
                  </button>
                </header>
                <div>
                  {selected.map((account) => (
                    <InvestigationAccountCard
                      key={account.id}
                      account={account}
                      name={name}
                      inPulse
                    />
                  ))}
                </div>
                <p role="status">
                  {selected.length === 2
                    ? compareReportAccounts(selected[0], selected[1])
                    : 'Choose another account.'}
                </p>
              </section>
            )}
            {notes.length > 0 && (
              <details className="pulse-ballots">
                <summary>Private notes</summary>
                <ul>
                  {notes.map(([id, note]) => (
                    <li key={id}>
                      <strong>{name(id)}</strong> {'\u00b7'} {note.text}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {view.votes.length > 0 && (
              <details className="pulse-ballots">
                <summary>Public ballots</summary>
                {view.votes.map(({ day, ballots }) => (
                  <section key={day}>
                    <h3>Day {day}</h3>
                    <ul>
                      {ballots
                        .filter(
                          ({ voterId, targetId }) =>
                            !guestId || guestId === voterId || guestId === targetId
                        )
                        .map(({ voterId, targetId }) => (
                          <li key={voterId}>
                            {name(voterId)} voted for {name(targetId)}.
                          </li>
                        ))}
                    </ul>
                  </section>
                ))}
              </details>
            )}
            <div className="pulse-accounts">
              {accounts.map((account) => (
                <InvestigationAccountCard key={account.id} account={account} name={name} inPulse>
                  <button
                    type="button"
                    aria-pressed={view.saved.includes(account.id)}
                    onClick={() => onAction({ kind: 'save', reportId: account.id })}
                  >
                    {view.saved.includes(account.id) ? 'Saved' : 'Save'}
                  </button>
                  {account.claim && (
                    <button
                      type="button"
                      aria-pressed={compareIds.includes(account.id)}
                      onClick={() => chooseForComparison(account.id)}
                    >
                      Compare
                    </button>
                  )}
                </InvestigationAccountCard>
              ))}
              {!accounts.length && (
                <p className="pulse-empty">
                  {savedOnly
                    ? 'No saved accounts match this guest.'
                    : 'Observe a guest or ask what someone saw to start a case.'}
                </p>
              )}
            </div>
          </>
        )}
        {tab === 'Commitments' && (
          <Commitments view={view} day={day} humanId={humanId} name={name} />
        )}
      </div>
    </dialog>
  )
}

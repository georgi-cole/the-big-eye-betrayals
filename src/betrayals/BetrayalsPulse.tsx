import { useEffect, useRef, useState } from 'react'
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
  const reads = guestId
    ? [[guestId, view.notes[guestId]] as const].filter(([, note]) => note)
    : Object.entries(view.notes)

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
      className="betrayals-pulse"
      aria-labelledby="betrayals-pulse-title"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="betrayals-pulse__sheet">
        <header className="betrayals-pulse__header">
          <div>
            <span>Day {day}</span>
            <h2 id="betrayals-pulse-title">My Pulse</h2>
          </div>
          <button
            type="button"
            className="pulse-close"
            aria-label="Close My Pulse"
            onClick={onClose}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </header>
        <nav className="betrayals-pulse__tabs" aria-label="My Pulse sections">
          {tabs.map((item) => (
            <button
              type="button"
              key={item}
              aria-pressed={tab === item}
              onClick={() => setTab(item)}
            >
              {item}
            </button>
          ))}
        </nav>
        <div className="betrayals-pulse__body" key={tab}>
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
                    <InvestigationAccountCard key={account.id} account={account} name={name} />
                  ))}
                </section>
              )}
              <Timelines entries={entries} day={day} />
            </>
          )}
          {tab === 'Intel' && (
            <>
              <div className="pulse-tools">
                <label>
                  Guest
                  <select value={guestId} onChange={(event) => setGuestId(event.target.value)}>
                    <option value="">All guests</option>
                    {view.guests.map(({ id, name }) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  aria-pressed={savedOnly}
                  onClick={() => setSavedOnly(!savedOnly)}
                >
                  Saved only
                </button>
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
                      <InvestigationAccountCard key={account.id} account={account} name={name} />
                    ))}
                  </div>
                  <p role="status">
                    {selected.length === 2
                      ? compareReportAccounts(selected[0], selected[1])
                      : 'Choose another account.'}
                  </p>
                </section>
              )}
              {reads.length > 0 && (
                <details className="pulse-ballots">
                  <summary>My reads</summary>
                  <ul>
                    {reads.map(([id, note]) => (
                      <li key={id}>
                        <strong>{name(id)}</strong> ·{' '}
                        {note.leaning === 'open'
                          ? 'Undecided'
                          : note.leaning === 'trust'
                            ? 'Trust'
                            : 'Suspect'}
                        {note.text ? ` — ${note.text}` : ''}
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
                  <InvestigationAccountCard key={account.id} account={account} name={name}>
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
      </div>
    </dialog>
  )
}

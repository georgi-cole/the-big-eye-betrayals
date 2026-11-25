import HubmateChoiceChip from '../components/SocialPanelV2/HubmateChoiceChip'
import type { Player } from '../types'
import { BetrayalsResourceCosts } from './BetrayalsResourceCosts'
import type { InvestigationAction } from './investigation'
import { isVoteClaim, witnessReply } from './investigationRecords'
import { accountLabel, accountText } from './pulseView'
import type { GuestProfile, PlayerAccount } from './pulseView'
import { investigationCost } from './socialInvestigation'
import type {
  InvestigationControls,
  InvestigationInput,
  InvestigationMove,
} from './socialInvestigation'

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
      {children} <BetrayalsResourceCosts cost={investigationCost} />
    </button>
  )
}

const focusChoices = [
  ['actions', 'Actions'],
  ['contacts', 'Contacts'],
  ['demeanor', 'Demeanor'],
] as const

const shareModes = [
  ['attribute', 'Credit the source'],
  ['private-source', 'Keep the source private'],
  ['challenge', 'Dispute the account'],
] as const

export function BetrayalsInvestigationOptions({
  move,
  choices,
  account,
  contacts,
  remaining,
  input,
  onChange,
  name,
}: {
  move: InvestigationMove
  choices: readonly PlayerAccount[]
  account?: PlayerAccount
  contacts: readonly Player[]
  remaining: number
  input: InvestigationInput
  onChange: (input: InvestigationInput) => void
  name: (id: string) => string
}) {
  const needsSpeaker = move === 'ask' || move === 'watch' || move === 'share'
  const specific = move === 'share' && isVoteClaim(account?.claim) && !account.claim.denies
  const speakers =
    move === 'share' ? contacts.filter(({ id }) => id !== account?.speakerId) : contacts
  return (
    <>
      {move === 'observe' && (
        <div className="sp2-consult-alliance-picker" role="group" aria-label="Observation focus">
          <span>What to watch · {remaining} left today</span>
          <div className="sp2-consult-alliance-picker__chips">
            {focusChoices.map(([focus, label]) => (
              <button
                key={focus}
                type="button"
                className="hubmate-choice-chip"
                aria-pressed={(input.focus ?? 'actions') === focus}
                onClick={() => onChange({ ...input, focus })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      {choices.length > 0 && (
        <div className="sp2-consult-alliance-picker" role="group" aria-label="Account to use">
          <span>{move === 'ask' ? 'What to ask about' : 'Choose an account'}</span>
          <div className="sp2-consult-alliance-picker__chips">
            {move === 'ask' && (
              <button
                type="button"
                className="hubmate-choice-chip"
                aria-pressed={!account}
                onClick={() => onChange({ ...input, referenceId: undefined })}
              >
                General impression
              </button>
            )}
            {choices.map((report) => (
              <button
                key={report.id}
                type="button"
                className="hubmate-choice-chip"
                aria-pressed={report.id === account?.id}
                onClick={() =>
                  onChange({
                    ...input,
                    referenceId: report.id,
                    ...(move === 'share' ? { speakerId: undefined, mode: undefined } : {}),
                  })
                }
              >
                Day {report.claim?.day ?? report.day} ·{' '}
                {report.speakerId ? name(report.speakerId) : accountLabel(report)}
              </button>
            ))}
          </div>
        </div>
      )}
      {needsSpeaker && (move !== 'share' || account) && (
        <div className="sp2-consult-alliance-picker" role="group" aria-label="Speak to a guest">
          <span>Speak to</span>
          <div className="sp2-consult-alliance-picker__chips">
            {speakers.map((guest) => (
              <HubmateChoiceChip
                key={guest.id}
                player={guest}
                selected={input.speakerId === guest.id}
                onClick={() => onChange({ ...input, speakerId: guest.id })}
              />
            ))}
          </div>
        </div>
      )}
      {move === 'share' && account && input.speakerId && (
        <div className="sp2-consult-alliance-picker" role="group" aria-label="How to share">
          <div className="sp2-consult-alliance-picker__chips">
            {shareModes
              .filter(([mode]) => mode !== 'challenge' || specific)
              .map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  className="hubmate-choice-chip"
                  aria-pressed={input.mode === mode}
                  onClick={() => onChange({ ...input, mode })}
                >
                  {label}
                </button>
              ))}
          </div>
        </div>
      )}
    </>
  )
}

const watchLabels = {
  waiting: 'will look tomorrow',
  declined: 'declined to watch',
  reported: 'sent an account',
  missed: 'could not see enough',
}

export function BetrayalsInvestigationResult({
  profile,
  account,
  investigation,
  name,
  day,
}: {
  profile: GuestProfile
  account?: PlayerAccount
  investigation: InvestigationControls
  name: (id: string) => string
  day: number
}) {
  const watch = profile.watches.at(-1)
  const witness = profile.witnessRequests.find(({ reportId }) => reportId === account?.id)
  const sharing = profile.shares.filter((share) => share.day === day).at(-1)
  if (!account && !watch) return null
  const saved = account && profile.saved.includes(account.id)
  return (
    <div className="betrayals-investigation-result">
      <div aria-live="polite">
        {account && (
          <p>
            <strong>{accountLabel(account)}</strong> · {accountText(account, name)}
          </p>
        )}
        {account?.nearbyId && <small>{name(account.nearbyId)} was nearby.</small>}
        {account?.sourceId && <small>Source · {name(account.sourceId)}</small>}
        {watch && (
          <small>
            {name(watch.watcherId)} {watchLabels[watch.status]}.
          </small>
        )}
        {account && witness && <small>{witnessReply(witness)}</small>}
        {sharing && <small>You discussed an account with {name(sharing.listenerId)}.</small>}
      </div>
      {account && (
        <div className="betrayals-investigation-result__actions">
          <button
            type="button"
            className="hubmate-choice-chip"
            aria-pressed={saved}
            onClick={() => investigation.act({ kind: 'save', reportId: account.id })}
          >
            {saved ? 'Saved to Intel' : 'Save to Intel'}
          </button>
          <button
            type="button"
            className="hubmate-choice-chip"
            onClick={() => investigation.openPulse(profile.guestId)}
          >
            Open Intel
          </button>
        </div>
      )}
    </div>
  )
}

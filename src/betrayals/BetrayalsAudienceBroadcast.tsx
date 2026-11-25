import { useId } from 'react'
import type { ReactNode } from 'react'
import {
  audienceSaveCandidates,
  eligibleToAppeal,
  predictedHotSeatAnswer,
  WAGER_BONUS,
} from './audienceSeason'
import type { AudienceEvent, AudienceMove } from './audienceSeason'
import { answerText, audienceResult } from './dayFlowView'
import { guestName } from './investigationRecords'
import { eligibleBanishmentTargets } from './run'
import type { Run } from './run'

function AudienceAction({
  children,
  effect,
  onClick,
}: {
  children: ReactNode
  effect: string
  onClick: () => void
}) {
  const labelId = useId()
  const effectId = useId()
  return (
    <button
      type="button"
      className="betrayals-on-air__action"
      aria-labelledby={labelId}
      aria-describedby={effectId}
      onClick={onClick}
    >
      <strong id={labelId}>{children}</strong>
      <small id={effectId}>{effect}</small>
    </button>
  )
}

export function BetrayalsAudienceActions({
  run,
  participating,
  selected,
  onMove,
}: {
  run: Run
  participating: boolean
  selected?: string
  onMove: (move: AudienceMove) => void
}) {
  const episode = run.audience?.episode
  if (episode?.day !== run.day || episode.decision) return null
  const name = (id: string) => guestName(run.seats, id)

  if (episode.kind === 'hot-seat' && episode.hotSeat) {
    const { speakerId, influenceId } = episode.hotSeat
    const inChair = speakerId === run.humanId && participating
    return (
      <section className="betrayals-on-air-controls" aria-label="Hot Seat actions">
        {!inChair && (
          <p>
            {name(speakerId)}: “
            {answerText(predictedHotSeatAnswer(run), influenceId ? name(influenceId) : undefined)}”
          </p>
        )}
        <div className="betrayals-on-air__actions">
          {inChair ? (
            <>
              <AudienceAction
                effect="Own the decision publicly"
                onClick={() => onMove({ kind: 'hot-seat', answer: 'own' })}
              >
                Own the switch
              </AudienceAction>
              <AudienceAction
                effect="Give viewers your reasoning"
                onClick={() => onMove({ kind: 'hot-seat', answer: 'explain' })}
              >
                Explain the switch
              </AudienceAction>
              {influenceId && (
                <AudienceAction
                  effect="They can challenge your account"
                  onClick={() => onMove({ kind: 'hot-seat', answer: 'name' })}
                >
                  Credit {name(influenceId)}
                </AudienceAction>
              )}
            </>
          ) : (
            <>
              {participating && (
                <>
                  <AudienceAction
                    effect="Build trust. Defend them at the Table."
                    onClick={() => onMove({ kind: 'hot-seat', reply: 'back' })}
                  >
                    Back them
                  </AudienceAction>
                  <AudienceAction
                    effect="Strain trust. Question them at the Table."
                    onClick={() => onMove({ kind: 'hot-seat', reply: 'challenge' })}
                  >
                    Challenge them
                  </AudienceAction>
                </>
              )}
              <AudienceAction
                effect="Leave the answer on record"
                onClick={() => onMove({ kind: 'hot-seat' })}
              >
                Let the answer stand
              </AudienceAction>
            </>
          )}
        </div>
      </section>
    )
  }

  if (episode.kind === 'save') {
    const endorsement =
      participating &&
      selected &&
      selected !== run.humanId &&
      audienceSaveCandidates(run).includes(selected)
        ? selected
        : undefined
    return (
      <section className="betrayals-on-air__actions" aria-label="Audience Save actions">
        {participating && eligibleToAppeal(run) && (
          <AudienceAction
            effect="Boost your chance of a Save"
            onClick={() => onMove({ kind: 'save', guestId: run.humanId })}
          >
            Appeal for yourself
          </AudienceAction>
        )}
        {endorsement && (
          <AudienceAction
            effect="Boost their chance and build trust"
            onClick={() => onMove({ kind: 'save', guestId: endorsement })}
          >
            Endorse {name(endorsement)}
          </AudienceAction>
        )}
        <AudienceAction
          effect={participating ? 'Let viewers weigh the public record' : 'See who viewers protect'}
          onClick={() => onMove({ kind: 'save' })}
        >
          {participating ? 'Stay off camera' : 'Reveal the audience vote'}
        </AudienceAction>
      </section>
    )
  }

  const target =
    participating && selected && eligibleBanishmentTargets(run, run.humanId).includes(selected)
      ? selected
      : undefined
  return (
    <section className="betrayals-on-air__actions" aria-label="Vote Promise actions">
      {target && (
        <AudienceAction
          effect={`Add ${WAGER_BONUS} to the pot if kept`}
          onClick={() => onMove({ kind: 'wager', targetId: target })}
        >
          Pledge to vote for {name(target)}
        </AudienceAction>
      )}
      <AudienceAction
        effect="Hear another guest's promise if they volunteer"
        onClick={() => onMove({ kind: 'wager' })}
      >
        Let another guest volunteer
      </AudienceAction>
    </section>
  )
}

function airedMoment(run: Run, event: AudienceEvent) {
  const guest = event.targetId ? guestName(run.seats, event.targetId) : 'another guest'
  const lines: Record<AudienceEvent['kind'], string> = {
    immunity: 'won Immunity',
    safety: 'won a Night Shield in a public Safety result',
    defend: `spoke up for ${guest}`,
    case: `made a public case about ${guest}`,
    witness: `gave firsthand testimony about ${guest}`,
    ballot: `voted for ${guest}`,
    'under-fire': 'survived pressure on the ballot',
    appeal: 'appealed directly to viewers',
    endorse: `endorsed ${guest} on air`,
    backed: `was endorsed by ${guest}`,
    own: 'owned a vote switch in the Hot Seat',
    explain: 'answered a challenge in the Hot Seat',
    name: `credited ${guest}'s case on air`,
    reply: `answered ${guest} on air`,
    wager: `risked a public vote pledge about ${guest}`,
    kept: 'kept a public pledge and earned a pot bonus',
    switched: 'changed their mind after a public pledge',
  }
  return `Day ${event.day} · ${guestName(run.seats, event.actorId)} ${lines[event.kind]}.`
}

export function BetrayalsAudienceResults({ run }: { run: Run }) {
  const result = audienceResult(run)
  const decision = run.audience?.episode.decision
  if (!result || !decision) return null
  return (
    <details className="betrayals-on-air__results" aria-label="Audience result">
      <summary>Audience result</summary>
      <p>{result}</p>
      {decision.kind === 'save' && decision.shares.length > 0 && (
        <>
          <ol aria-label="Audience vote shares">
            {decision.shares.map(({ guestId, percent }) => (
              <li key={guestId}>
                <span>{guestName(run.seats, guestId)}</span> <strong>{percent}%</strong>
              </li>
            ))}
          </ol>
          {decision.reasons.map((event, index) => (
            <p key={index}>{airedMoment(run, event)}</p>
          ))}
          <p>
            The Save lasts through this Round Table. The Immunity winner and the previous Save
            winner sit out.
          </p>
        </>
      )}
    </details>
  )
}

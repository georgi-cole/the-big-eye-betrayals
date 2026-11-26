import { mulberry32 } from '../store/rng.ts'
import { resolveDeparturePower } from './castleRoleEvents.ts'
import { challengeContestantIds, resolveChallenge } from './challenges.ts'
import { advanceDayAftermath } from './dayAftermath.ts'
import { openDayFlow } from './dayFlow.ts'
import { advanceDayBeat } from './daySocial.ts'
import { recordGameActivity } from './gameLog.ts'
import { getIncomingInteractions, respondToIncomingInteraction } from './incoming.ts'
import {
  getConclaveView,
  nightCastleRoleFor,
  resolveConclave,
  resolveNightCastleRole,
  revealDawn,
} from './night.ts'
import { awardPublicShield } from './publicShield.ts'
import { answerRecruitment, recruitmentFor } from './recruitment.ts'
import { acknowledgeRole, commandToken, publicShieldPending, type Run } from './run.ts'
import { recordSeasonCheckpoints } from './seasonRewards.ts'
import { intendsToEnd, resolveEndVote } from './settlement.ts'
import {
  advanceTableRound,
  buildTableBallots,
  mayorChoiceFor,
  recordTableSway,
  resolveMayorChoice,
  resolveTable,
  revealTable,
  tableDiscussionOpen,
  tableTargets,
} from './table.ts'

export type QaAdvance = 'phase' | 'day' | 'season'

type AudienceApproval = (run: Run) => Record<string, number>

function simulateBeat(run: Run, getAudienceApproval: AudienceApproval): Run {
  const token = commandToken(run)
  if (run.private.departurePower) return resolveDeparturePower(run, token)
  const required = getIncomingInteractions(run).find(
    ({ required, response }) => required && !response
  )
  if (required) return respondToIncomingInteraction(run, token, required.id, 'dismiss')
  if (publicShieldPending(run)) {
    const approval = getAudienceApproval(run)
    const awarded = awardPublicShield(run, token, approval)
    return awarded === run ? run : { ...awarded, audienceApproval: approval }
  }

  const human = run.humanId
  const random = mulberry32(run.publicSeed ^ Math.imul(run.day, 4187) ^ run.revision)
  const pick = (ids: readonly string[] = []) => ids[Math.floor(random() * ids.length)]
  switch (run.phase) {
    case 'role-reveal':
      return acknowledgeRole(run, token)
    case 'dawn':
    case 'social':
      return advanceDayBeat(run)
    case 'immunity':
    case 'safety':
    case 'final-challenge':
      return resolveChallenge(
        run,
        token,
        challengeContestantIds(run).map((contestantId) => {
          const score = random()
          return { contestantId, score: score * 100, potContribution: score }
        })
      )
    case 'after-immunity':
    case 'shield-deals':
    case 'cocktail':
      return advanceDayAftermath(run, token)
    case 'round-table':
    case 'final-banishment':
      if (run.tableCount) return advanceTableRound(run, token)
      if (tableDiscussionOpen(run)) return recordTableSway(run, token, null)
      if (mayorChoiceFor(run, human)) return resolveMayorChoice(run, token, false)
      return resolveTable(run, token, buildTableBallots(run, pick(tableTargets(run, human))))
    case 'table-reveal':
      return revealTable(run, token)
    case 'night': {
      if (nightCastleRoleFor(run, human)) return resolveNightCastleRole(run, token)
      const recruitment = recruitmentFor(run, human)
      if (recruitment?.kind === 'offer') return answerRecruitment(run, token, true)
      const targets =
        recruitment?.kind === 'choose'
          ? recruitment.targetIds
          : getConclaveView(run, human)?.targetIds
      return resolveConclave(run, token, pick(targets))
    }
    case 'night-resolved':
      return revealDawn(run, token)
    case 'end-vote':
      return resolveEndVote(
        run,
        token,
        run.seats
          .filter(({ exit }) => !exit)
          .map(({ id }) => ({
            voterId: id,
            choice: id === human || intendsToEnd(run, id) ? 'end' : 'banish',
          }))
      )
    default:
      return run
  }
}

export function simulateCastleQa(
  run: Run,
  advance: QaAdvance,
  getAudienceApproval: AudienceApproval
) {
  let current: Run = { ...run, presentation: undefined, pendingAdBreak: undefined }
  const limit = advance === 'season' ? 1024 : 160
  for (let step = 0; step < limit; step++) {
    let next = simulateBeat(current, getAudienceApproval)
    if (next === current) return
    if (next.phase !== current.phase && (next.phase === 'dawn' || next.phase === 'final-challenge'))
      next = openDayFlow(next)
    current = recordSeasonCheckpoints(
      current,
      recordGameActivity(current, { ...next, economy: run.economy })
    )
    if (
      current.result ||
      (advance === 'day' && current.day > run.day) ||
      (advance === 'phase' && current.phase !== run.phase)
    )
      return current
  }
}

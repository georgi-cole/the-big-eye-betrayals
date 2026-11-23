import { getSocialPersonality } from '../social/socialPersonalityBank.ts'
import { mulberry32, seededPick, seededPickN } from '../store/rng.ts'
import { MAX_TABLE_ROUNDS, eligibleBanishmentTargets, isCurrentCommand } from './run.ts'
import type {
  Ballot,
  CaseReview,
  CommandToken,
  Run,
  TableArgument,
  TableReceipt,
  TableSway,
} from './run.ts'
import { settleRun } from './settlement.ts'
import { argumentBasis, hearArgument, relationship, trackRecord } from './perception.ts'
import { getSocialView, settleVotePacts } from './social.ts'
import { finishShieldConversations } from './shieldSocial.ts'
import { chooseTarget, resolutionPerspective } from './strategy.ts'
import { activeLead, canPresentEvidence, evidenceSpeech, voluntaryWitness } from './intel.ts'
import { tableDialogue } from './tableDialogue.ts'

export type { Ballot } from './run.ts'

type TableSpeech = { speakerId: string; targetId: string; argument: string; verb?: string }

export function canVoteAtTable(run: Run, id: string): boolean {
  return (
    (run.phase === 'round-table' || run.phase === 'final-banishment') &&
    run.seats.some((seat) => seat.id === id && !seat.exit)
  )
}

export function tableTargets(run: Run, voterId: string): string[] {
  return canVoteAtTable(run, voterId) ? eligibleBanishmentTargets(run, voterId) : []
}

export function tableRoundNumber(run: Run): number {
  return run.tableRound ?? (run.runoffIds ? 2 : 1)
}

export function tableDiscussionOpen(run: Run): boolean {
  return (
    run.phase === 'round-table' &&
    (!run.options.publicMode || run.publicShieldDecisionDay === run.day) &&
    !run.runoffIds &&
    !run.tableCount &&
    run.tableSway === undefined
  )
}

function makeArgument(run: Run, speakerId: string, choice: TableSway): TableArgument {
  return {
    ...choice,
    speakerId,
    basis: argumentBasis(run, getSocialView(run, speakerId), speakerId, choice.targetId),
  }
}

function openingArguments(run: Run): TableArgument[] {
  const random = mulberry32(run.publicSeed ^ Math.imul(run.day, 349))
  const witness = voluntaryWitness(run)
  const order = run.seats
    .filter(({ id, exit }) => !exit && id !== run.humanId && id !== witness?.speakerId)
    .map(({ id }) => ({
      id,
      initiative:
        random() + getSocialPersonality(id).assertiveness * 0.44 + trackRecord(run, id) * 0.5,
    }))
    .sort((left, right) => right.initiative - left.initiative)
  const argumentsSoFar: TableArgument[] = witness ? [witness] : []
  for (const { id } of order) {
    if (argumentsSoFar.length >= 4) break
    const eligible = tableTargets(run, id)
    const last = argumentsSoFar.at(-1)
    if (last && eligible.includes(last.targetId)) {
      const { bond } = relationship(run.social, id, last.targetId)
      if (bond >= 0.24 && !last.stance && hearArgument(run, id, last) < 0.13) {
        argumentsSoFar.push(
          makeArgument(run, id, {
            targetId: last.targetId,
            tone: 'careful',
            stance: 'defend',
          })
        )
        continue
      }
    }
    const targetId = chooseTarget(resolutionPerspective(run, id, eligible), 'case')
    if (!targetId) continue
    const basis = argumentBasis(run, getSocialView(run, id), id, targetId)
    const personality = getSocialPersonality(id)
    const hasLead = argumentsSoFar.some((claim) => claim.targetId === targetId && !claim.stance)
    const wantsToLead =
      !hasLead && (basis !== 'impression' || random() < personality.assertiveness * 0.65)
    argumentsSoFar.push({
      speakerId: id,
      targetId,
      tone:
        wantsToLead && random() < personality.publicConflictComfort * 0.44 ? 'forceful' : 'careful',
      stance: wantsToLead ? undefined : 'question',
      basis,
    })
  }
  return argumentsSoFar
}

function argumentsAtTable(run: Run): TableArgument[] {
  if (run.tableArguments) return run.tableArguments
  if (run.phase !== 'round-table' || run.runoffIds) return []
  const opening = openingArguments(run)
  return run.tableSway ? [...opening, makeArgument(run, run.humanId, run.tableSway)] : opening
}

export function recordTableSway(run: Run, token: CommandToken, choice: TableSway | null): Run {
  if (!isCurrentCommand(run, token) || !tableDiscussionOpen(run)) return run
  if (
    choice &&
    (!tableTargets(run, run.humanId).includes(choice.targetId) ||
      (choice.tone !== 'careful' && choice.tone !== 'forceful') ||
      (choice.stance !== undefined && choice.stance !== 'question' && choice.stance !== 'defend') ||
      (choice.evidence !== undefined &&
        (choice.stance !== undefined ||
          !canPresentEvidence(run, choice.targetId, choice.evidence))))
  )
    return run

  const tableArguments = openingArguments(run)
  const lead = activeLead(run)
  let social = run.social
  if (choice) {
    const argument = makeArgument(run, run.humanId, choice)
    tableArguments.push(argument)
    if (argument.evidence === 'name-source' && lead) {
      // Naming a private source can strain that relationship. It changes no one's role evidence.
      social = [
        ...social,
        {
          day: run.day,
          actorId: argument.speakerId,
          recipientId: lead.sourceId,
          kind: 'share-suspicion',
          suspectId: argument.targetId,
          reaction: 'backfired',
        },
      ]
    }
  }

  return {
    ...run,
    revision: run.revision + 1,
    tableArguments,
    tableSway: choice ? { ...choice } : null,
    social,
  }
}

/** The room can converge on a name, but echoes of the same case add no evidence. */
export function tableArgumentPressure(
  run: Run,
  voterId: string,
  statements: readonly TableArgument[]
): ReadonlyMap<string, number> {
  const supporting = new Map<string, number>()
  const opposing = new Map<string, number>()
  for (const argument of statements) {
    if (argument.evidence) continue // The incident is scored once through the witness logic.
    const effect = hearArgument(run, voterId, argument)
    if (effect > 0) {
      supporting.set(argument.targetId, Math.max(effect, supporting.get(argument.targetId) ?? 0))
    } else if (effect < 0) {
      opposing.set(argument.targetId, Math.min(effect, opposing.get(argument.targetId) ?? 0))
    }
  }
  return new Map(
    [...new Set([...supporting.keys(), ...opposing.keys()])].map((id) => [
      id,
      (supporting.get(id) ?? 0) + (opposing.get(id) ?? 0),
    ])
  )
}

export function tableDiscussion(run: Run): TableSpeech[] {
  const tableArguments = argumentsAtTable(run)
  return [...evidenceSpeech({ ...run, tableArguments }), ...tableDialogue(run, tableArguments)]
}

export function tableSwayResponse(run: Run): string | undefined {
  if (!run.tableSway) return
  const tableArguments = argumentsAtTable(run)
  if (run.tableSway.evidence) {
    return evidenceSpeech({ ...run, tableArguments }).at(-1)?.argument
  }
  const claim = tableArguments.find(({ speakerId }) => speakerId === run.humanId)
  if (!claim) return
  if (claim.stance === 'question')
    return 'You ask the room for a reason. Guests weigh what they have heard.'
  const support = run.seats.filter(
    ({ id, exit }) => !exit && Math.abs(hearArgument(run, id, claim)) >= 0.12
  ).length
  if (support >= 3) {
    return claim.stance === 'defend'
      ? 'Several guests are less sure they want to vote for them.'
      : 'Several guests give your case a second look.'
  }
  if (support > 0) return 'A few guests hear you out. The rest are still weighing the case.'
  return 'The room wants a stronger reason before changing its mind.'
}

export function buildTableBallots(run: Run, humanTarget?: string): Ballot[] {
  const tableArguments = argumentsAtTable(run)
  const debate = { ...run, tableArguments }
  return run.seats.flatMap(({ id: voterId }) => {
    const eligible = tableTargets(run, voterId)
    if (!eligible.length) return []
    const targetId =
      voterId === run.humanId
        ? humanTarget
        : chooseTarget(
            {
              ...resolutionPerspective(debate, voterId, eligible),
              tableRound: run.runoffIds ? tableRoundNumber(run) : undefined,
              tablePressure: tableArgumentPressure(debate, voterId, tableArguments),
            },
            'table'
          )
    return targetId && eligible.includes(targetId) ? [{ voterId, targetId }] : []
  })
}

function reviewCases(
  run: Run,
  claims: readonly TableArgument[],
  targetId: string,
  role: 'loyal' | 'betrayer'
): CaseReview[] {
  const reviewed = new Set<string>()
  const result = role === 'betrayer' ? 'caught' : 'missed'
  const reviews: CaseReview[] = []
  for (const claim of claims) {
    if (
      claim.targetId !== targetId ||
      (result === 'missed' && claim.tone !== 'forceful') ||
      reviewed.has(claim.speakerId)
    )
      continue
    reviewed.add(claim.speakerId)
    reviews.push({ day: run.day, speakerId: claim.speakerId, targetId, result })
  }
  return [...(run.caseReviews ?? []).filter(({ day }) => day > run.day - 5), ...reviews]
}

export function tableLeaderboard(ballots: readonly Ballot[], limit = 5) {
  const tallied = new Map<string, number>()
  for (const { targetId } of ballots) tallied.set(targetId, (tallied.get(targetId) ?? 0) + 1)
  const ranked = [...tallied].sort(
    ([leftId, left], [rightId, right]) => right - left || leftId.localeCompare(rightId)
  )
  const rows: { id: string; votes: number }[] = []
  for (let start = 0; start < ranked.length; ) {
    const votes = ranked[start][1]
    let end = start + 1
    while (ranked[end]?.[1] === votes) end++
    if (end > limit) return { rows, hiddenTie: { size: end - start, position: start + 1 } }
    for (const [id, count] of ranked.slice(start, end)) rows.push({ id, votes: count })
    if (end === limit) break
    start = end
  }
  return { rows, hiddenTie: undefined }
}

export function resolveTable(run: Run, token: CommandToken, ballots: readonly Ballot[]): Run {
  if (
    !isCurrentCommand(run, token) ||
    run.tableCount ||
    (run.phase !== 'round-table' && run.phase !== 'final-banishment')
  )
    return run
  const eligible = new Map(
    run.seats.map(({ id }) => [id, tableTargets(run, id)] as const).filter(([, ids]) => ids.length)
  )
  if (eligible.size !== ballots.length) return run
  const tallied = new Map<string, number>()
  for (const { voterId, targetId } of ballots) {
    if (!eligible.get(voterId)?.includes(targetId)) return run
    eligible.delete(voterId)
    tallied.set(targetId, (tallied.get(targetId) ?? 0) + 1)
  }
  const topCount = Math.max(0, ...tallied.values())
  const tied = [...tallied.keys()].filter((id) => tallied.get(id) === topCount).sort()
  if (tied.length === 0) return run

  const tableArguments = argumentsAtTable(run)
  const withShieldTalk = finishShieldConversations(run)
  const revision = withShieldTalk.revision + 1
  const random = mulberry32(run.publicSeed ^ Math.imul(run.day, 547) ^ revision)
  const round = tableRoundNumber(run)
  const tableCount = {
    round,
    ballots: seededPickN(random, ballots, ballots.length).map((ballot) => ({ ...ballot })),
    tiedIds: tied.length > 1 ? tied : [],
  }
  if (tied.length > 1 && round < MAX_TABLE_ROUNDS) {
    return { ...withShieldTalk, revision, runoffIds: tied, tableCount, tableArguments }
  }

  const receipt: TableReceipt = {
    banishedId: seededPick(random, tied),
    blind: run.phase === 'final-banishment',
    tally: Object.fromEntries(tallied),
    tiedByDraw: tied.length > 1,
  }
  return {
    ...withShieldTalk,
    phase: 'table-reveal',
    revision,
    runoffIds: undefined,
    tableCount,
    tableArguments,
    private: { ...withShieldTalk.private, pendingTable: receipt },
  }
}

export function advanceTableRound(run: Run, token: CommandToken): Run {
  const count = run.tableCount
  if (
    !isCurrentCommand(run, token) ||
    !run.runoffIds ||
    !count ||
    count.tiedIds.length < 2 ||
    count.round >= MAX_TABLE_ROUNDS ||
    (run.phase !== 'round-table' && run.phase !== 'final-banishment')
  ) {
    return run
  }
  return {
    ...run,
    revision: run.revision + 1,
    tableRound: count.round + 1,
    social:
      count.round === 1 && run.phase === 'round-table'
        ? settleVotePacts(run, count.ballots)
        : run.social,
    tableCount: undefined,
  }
}

export function revealTable(run: Run, token: CommandToken): Run {
  const outcome = run.private.pendingTable
  if (run.phase !== 'table-reveal' || !isCurrentCommand(run, token) || !outcome) return run
  const seats = run.seats.map((seat) => {
    if (seat.id !== outcome.banishedId) return seat
    const revealedRole = run.private.betrayers.includes(seat.id) ? 'betrayer' : 'loyal'
    return {
      ...seat,
      exit: {
        cause: 'banished' as const,
        day: run.day,
        revealedRole: outcome.blind ? undefined : (revealedRole as 'betrayer' | 'loyal'),
      },
    }
  })
  const active = seats.filter(({ exit }) => !exit)
  const lastBetrayer =
    !outcome.blind && !active.some(({ id }) => run.private.betrayers.includes(id))
  const phase = lastBetrayer
    ? 'settled'
    : outcome.blind
      ? 'end-vote'
      : active.length === 5
        ? 'final-challenge'
        : 'night'
  const revealedRole = seats.find(({ id }) => id === outcome.banishedId)?.exit?.revealedRole
  const campaigns = (run.tableArguments ?? []).filter(
    ({ stance, evidence }) => !stance && !evidence
  )
  const revealed: Run = {
    ...run,
    phase,
    revision: run.revision + 1,
    seats,
    lastTable: { ...outcome, revealedBallots: run.tableCount?.ballots, campaigns },
    caseReviews: revealedRole
      ? reviewCases(run, campaigns, outcome.banishedId, revealedRole)
      : run.caseReviews,
    social:
      !outcome.blind && run.tableCount?.round === 1
        ? settleVotePacts(run, run.tableCount.ballots)
        : run.social,
    tableRound: undefined,
    tableCount: undefined,
    tableSway: undefined,
    tableArguments: undefined,
    immunityId: phase === 'night' ? run.immunityId : undefined,
    private: {
      ...run.private,
      pendingTable: undefined,
      nightShieldIds:
        phase === 'night'
          ? run.private.nightShieldIds.filter((id) => id !== outcome.banishedId)
          : [],
      nightShieldAwardIds: phase === 'night' ? run.private.nightShieldAwardIds : undefined,
    },
  }
  if (lastBetrayer) return settleRun(revealed, 'last-betrayer')
  if (outcome.blind && active.length === 2) return settleRun(revealed, 'final-two')
  return revealed
}

import { mulberry32, seededPick, seededPickN } from '../store/rng.ts'
import { MAX_TABLE_ROUNDS, eligibleBanishmentTargets, isCurrentCommand, viewFor } from './run.ts'
import type { Ballot, CommandToken, Run, TableReceipt, TableSway } from './run.ts'
import { settleRun } from './settlement.ts'
import { getSocialView, rapport } from './social.ts'
import { chooseTarget } from './strategy.ts'

export type { Ballot } from './run.ts'

type TableSpeech = { speakerId: string; targetId: string; argument: string }

const argumentsAtTable = [
  'I keep coming back to the way they listen before they commit. I want to know where they stand.',
  'The room has spent all day looking elsewhere. I think that suits them a little too well.',
  'I would rather put this on the table now. That is the person I have the hardest time reading.',
  'Several names have come up, and this is the one I cannot talk myself out of.',
  'I’ve heard a lot of confidence from them. I want to hear what that confidence is based on.',
  'I can live with being wrong about a hard call. This is the one I think we need to make.',
  'When a name comes up, they seem to know exactly when to let someone else take the heat.',
  'I would ask them one thing. Who are they prepared to stand behind when the votes are read?',
  'I have been trying to separate who makes me nervous from who seems to be steering us. I keep landing here.',
  'Every time the conversation gets uncomfortable, they seem to find a safer subject.',
  'I want to see how they handle a question they had no time to prepare for.',
  'I can’t make sense of where they stand. I suspect they prefer it that way.',
  'I think people are giving them a pass because they’re easy to talk to.',
  'They can read this room. I want to know what they’ve chosen to do with that.',
  'I’m open to hearing the case against someone else. So far this is where my vote is going.',
  'I want to hear a name from them before everyone else has finished speaking.',
]

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

export function recordTableSway(run: Run, token: CommandToken, choice: TableSway | null): Run {
  if (!isCurrentCommand(run, token) || !tableDiscussionOpen(run)) return run
  if (
    choice &&
    (!tableTargets(run, run.humanId).includes(choice.targetId) ||
      (choice.tone !== 'careful' && choice.tone !== 'forceful'))
  ) {
    return run
  }
  return { ...run, revision: run.revision + 1, tableSway: choice ? { ...choice } : null }
}

function reactionToSway(run: Run, voterId: string, index: number): number {
  const sway = run.tableSway
  if (!sway || voterId === run.humanId) return 0
  if (voterId === sway.targetId) return sway.tone === 'forceful' ? -0.62 : -0.3

  const conversations = getSocialView(run, voterId)
  const credibility = rapport(conversations, voterId, run.humanId)
  const loyalty = rapport(conversations, voterId, sway.targetId)
  const mood = mulberry32(run.publicSeed ^ Math.imul(run.day, 313) ^ Math.imul(index + 1, 751))()
  const hearing = mood + credibility - loyalty
  const forceful = sway.tone === 'forceful'
  if (hearing < (forceful ? 0.45 : 0.18)) return forceful ? -0.5 : -0.24
  if (hearing > (forceful ? 0.57 : 0.48)) return forceful ? 0.5 : 0.3
  return 0
}

function strategyTarget(run: Run, voterId: string, eligibleIds: string[], reaction = 0) {
  const view = viewFor(run, voterId)
  const sway = run.tableSway
  let tablePressure: ReadonlyMap<string, number> | undefined
  if (sway && reaction) {
    const directedAt = reaction > 0 ? sway.targetId : run.humanId
    tablePressure = new Map([[directedAt, Math.abs(reaction)]])
  }
  return chooseTarget(
    {
      actorId: voterId,
      role: view.role ?? 'loyal',
      teammates: view.teammateIds,
      day: run.day,
      phase: run.phase,
      seed: run.publicSeed,
      eligibleIds,
      ownConversations: getSocialView(run, voterId),
      publicTally: run.lastTable?.tally ?? {},
      tableRound: run.runoffIds ? tableRoundNumber(run) : undefined,
      tablePressure,
    },
    'table'
  )
}

export function tableDiscussion(run: Run): TableSpeech[] {
  const random = mulberry32(run.publicSeed ^ Math.imul(run.day, 349))
  const speakers = run.seats.filter(({ id, exit }) => !exit && id !== run.humanId)
  const order = seededPickN(random, speakers, speakers.length)
  const argumentsInOrder = seededPickN(random, argumentsAtTable, argumentsAtTable.length)
  return order.flatMap(({ id: speakerId }, index) => {
    const targets = tableTargets(run, speakerId)
    const targetId = strategyTarget(run, speakerId, targets)
    if (!targetId) return []
    const heard = getSocialView(run, speakerId).some(
      ({ day, suspectId, recipientId, kind, reaction, accepted }) =>
        day === run.day &&
        suspectId === targetId &&
        recipientId === speakerId &&
        (kind === 'question' ||
          (kind === 'share-suspicion' && reaction === 'landed') ||
          (kind === 'vote-plan' && accepted))
    )
    return [
      {
        speakerId,
        targetId,
        argument: heard
          ? 'Their name came up in a conversation earlier. I want to hear them answer for themselves.'
          : argumentsInOrder[index % argumentsInOrder.length],
      },
    ]
  })
}

export function tableSwayResponse(run: Run): string | undefined {
  if (!run.tableSway) return
  const responses = run.seats
    .map(({ id, exit }, index) => (exit ? 0 : reactionToSway(run, id, index)))
    .filter(Boolean)
  const support = responses.filter((reaction) => reaction > 0).length
  const backlash = responses.length - support
  if (backlash > support) return 'The table bristles. A few guests are now looking your way.'
  if (support > backlash * 2)
    return 'Your case finds an audience. Guests are reconsidering their votes.'
  if (support > 0) return 'Some guests reconsider. Others push back at your accusation.'
  return 'The guests listen in silence.'
}

export function buildTableBallots(run: Run, humanTarget?: string): Ballot[] {
  return run.seats.flatMap(({ id: voterId }, index) => {
    const eligible = tableTargets(run, voterId)
    if (!eligible.length) return []
    const targetId =
      voterId === run.humanId
        ? humanTarget
        : strategyTarget(run, voterId, eligible, reactionToSway(run, voterId, index))
    return targetId && eligible.includes(targetId) ? [{ voterId, targetId }] : []
  })
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

  const revision = run.revision + 1
  const random = mulberry32(run.publicSeed ^ Math.imul(run.day, 547) ^ revision)
  const round = tableRoundNumber(run)
  const tableCount = {
    round,
    ballots: seededPickN(random, ballots, ballots.length).map((ballot) => ({ ...ballot })),
    tiedIds: tied.length > 1 ? tied : [],
  }
  if (tied.length > 1 && round < MAX_TABLE_ROUNDS) {
    return { ...run, revision, runoffIds: tied, tableCount }
  }

  const receipt: TableReceipt = {
    banishedId: seededPick(random, tied),
    blind: run.phase === 'final-banishment',
    tally: Object.fromEntries(tallied),
    tiedByDraw: tied.length > 1,
  }
  return {
    ...run,
    phase: 'table-reveal',
    revision,
    runoffIds: undefined,
    tableCount,
    private: { ...run.private, pendingTable: receipt },
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
  const revealed: Run = {
    ...run,
    phase,
    revision: run.revision + 1,
    seats,
    lastTable: outcome,
    tableRound: undefined,
    tableCount: undefined,
    tableSway: undefined,
    immunityId: phase === 'night' ? run.immunityId : undefined,
    private: {
      ...run.private,
      pendingTable: undefined,
      nightShieldIds: phase === 'night' ? run.private.nightShieldIds : [],
    },
  }
  if (lastBetrayer) return settleRun(revealed, 'last-betrayer')
  if (outcome.blind && active.length === 2) return settleRun(revealed, 'final-two')
  return revealed
}

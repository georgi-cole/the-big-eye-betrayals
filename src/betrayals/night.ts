import { mulberry32, seededPick } from '../store/rng.ts'
import { isCurrentCommand, knownTeammateIds } from './run.ts'
import type { CommandToken, Run } from './run.ts'
import { nightShieldReads, shieldRoll } from './nightShields.ts'
import type { ShieldRead } from './nightShields.ts'
import { getSocialPersonality } from '../social/socialPersonalityBank.ts'
import { getSocialView, rapport } from './social.ts'
import { chooseTarget, resolutionPerspective } from './strategy.ts'
import type { Ballot } from './table.ts'
import { hasPaidNightShield, pendingPaidNightShieldPurchase } from './economy.ts'
import { FINALE_CAST_SIZE } from './seasonPhases.ts'

type ConclaveProposal = {
  speakerId: string
  speakerName: string
  portrait?: string
  nomineeName: string
  argument: string
}

export type ConclaveLine = Omit<ConclaveProposal, 'nomineeName'> & { nomineeName?: string }

export type ConclaveView = {
  targetIds: string[]
  proposals: ConclaveProposal[]
  shieldBriefing?: ConclaveLine[]
  runoff?: string
  ownArgument?: string
}

type ShieldBriefing = {
  speakerId: string
  subjectId: string
  read: ShieldRead
}

function isActiveBetrayer(run: Run, actorId: string) {
  return (
    run.private.betrayers.includes(actorId) &&
    run.seats.some(({ id, exit }) => id === actorId && !exit)
  )
}

export function nightTargets(run: Run, actorId: string): string[] {
  if (run.phase !== 'night' || !isActiveBetrayer(run, actorId)) return []
  return run.seats
    .filter(({ id, exit }) => !exit && id !== run.immunityId && !run.private.betrayers.includes(id))
    .map(({ id }) => id)
}

function tallyNightBallots(run: Run, choices: readonly Ballot[]) {
  const electorate = new Map(
    run.private.betrayers
      .map((id) => [id, nightTargets(run, id)] as const)
      .filter(([, targets]) => targets.length)
  )
  if (choices.length !== electorate.size) return

  const tally = new Map<string, number>()
  for (const { voterId, targetId } of choices) {
    if (!electorate.get(voterId)?.includes(targetId)) return
    electorate.delete(voterId)
    tally.set(targetId, (tally.get(targetId) ?? 0) + 1)
  }
  return tally
}

function majorityTarget(tally: ReadonlyMap<string, number>, ballotCount: number) {
  return [...tally].find(([, count]) => count > ballotCount / 2)?.[0]
}

function leadingTargets(tally: ReadonlyMap<string, number>) {
  const highest = Math.max(...tally.values())
  return [...tally].filter(([, count]) => count === highest).map(([id]) => id)
}

function countVotes(ballots: readonly Ballot[]) {
  const tally = new Map<string, number>()
  for (const { targetId } of ballots) tally.set(targetId, (tally.get(targetId) ?? 0) + 1)
  return tally
}

function ballotLine(run: Run, ballots: readonly Ballot[]) {
  return [...countVotes(ballots)]
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => `${run.seats.find((seat) => seat.id === id)?.name ?? 'Guest'} ${count}`)
    .join(' · ')
}

function runoffTargets(nominations: readonly Ballot[]) {
  const tally = countVotes(nominations)
  const leaders = leadingTargets(tally)
  return leaders.length > 1 ? leaders : [...tally.keys()]
}

export function conclaveGuests(run: Run, actorId: string | null) {
  if (!actorId || !isActiveBetrayer(run, actorId)) return []
  const known = new Set([actorId, ...knownTeammateIds(run, actorId)])
  return run.seats
    .filter(({ id, exit }) => !exit && run.private.betrayers.includes(id))
    .map(({ id, name, portrait }, index) =>
      known.has(id)
        ? { id, name, portrait, human: id === run.humanId }
        : { id: 'hooded-' + index, name: 'Hooded guest', concealed: true }
    )
}

export function resolveNight(
  run: Run,
  token: CommandToken,
  choices: readonly Ballot[],
  nominations: readonly Ballot[] = choices
): Run {
  if (run.phase !== 'night' || !isCurrentCommand(run, token)) return run
  if (pendingPaidNightShieldPurchase(run)) return run
  const tally = tallyNightBallots(run, choices)
  const nominated = choices === nominations ? tally : tallyNightBallots(run, nominations)
  if (!tally || !nominated || [...tally.keys()].some((id) => !nominated.has(id))) return run

  const leaders = leadingTargets(tally)
  const byDraw = leaders.length > 1
  const targetId = byDraw
    ? seededPick(mulberry32(run.publicSeed ^ Math.imul(run.day, 1229)), leaders.sort())
    : (leaders[0] ?? null)
  return {
    ...run,
    revision: run.revision + 1,
    phase: 'night-resolved',
    private: {
      ...run.private,
      pendingNight: {
        targetId,
        blocked: Boolean(
          targetId &&
          (run.private.nightShieldIds.includes(targetId) || hasPaidNightShield(run, targetId))
        ),
        byDraw,
      },
    },
  }
}

function discussShields(run: Run): ShieldBriefing[] {
  const candidates = new Set(
    run.seats.filter(({ id, exit }) => !exit && id !== run.immunityId).map(({ id }) => id)
  )
  return run.seats.flatMap(({ id: speakerId }) => {
    if (speakerId === run.humanId || !isActiveBetrayer(run, speakerId)) return []
    const teammates = knownTeammateIds(run, speakerId)
    const ranked = [...nightShieldReads(run, speakerId)]
      .filter(
        ([id, read]) =>
          id !== speakerId && candidates.has(id) && !teammates.includes(id) && !read.publicAwardOnly
      )
      .sort(
        ([, a], [, b]) =>
          Math.max(b.protected, b.exposed * 0.6) - Math.max(a.protected, a.exposed * 0.6)
      )
    const topic = ranked.find(([, read]) => Math.max(read.protected, read.exposed) >= 0.1)
    if (!topic) return []
    const [subjectId, read] = topic
    const personality = getSocialPersonality(speakerId)
    const discretion = rapport(run.social, speakerId, subjectId) * personality.loyalty * 0.38
    const willingness =
      0.48 +
      personality.strategicCalculation * 0.25 +
      personality.gossipPropensity * 0.18 -
      discretion
    return shieldRoll(run, speakerId, 20491) < willingness ? [{ speakerId, subjectId, read }] : []
  })
}

function chooseNominee(
  run: Run,
  actorId: string,
  eligibleIds: string[],
  briefing: readonly ShieldBriefing[]
) {
  const perspective = resolutionPerspective(run, actorId, eligibleIds)
  const shieldReads = perspective.shieldReads ?? new Map<string, ShieldRead>()
  for (const { speakerId, subjectId, read } of briefing) {
    if (speakerId === actorId || !eligibleIds.includes(subjectId)) continue
    const own = shieldReads.get(subjectId)
    const trust = rapport(run.social, actorId, speakerId)
    const weight = (0.38 + trust * 0.3) * (read.conflicting ? 0.6 : 1)
    const protectedRead = Math.max(own?.protected ?? 0, read.protected * weight)
    const exposed = Math.max(own?.exposed ?? 0, read.exposed * weight)
    shieldReads.set(subjectId, {
      protected: protectedRead,
      exposed,
      conflicting: Boolean(own?.conflicting || (protectedRead > 0 && exposed > 0)),
      firsthand: own?.firsthand ?? false,
      witnessedGift: own?.witnessedGift ?? false,
    })
  }
  return chooseTarget({ ...perspective, shieldReads }, 'night')
}

function nominate(run: Run, briefing: readonly ShieldBriefing[], humanTargetId?: string): Ballot[] {
  return run.seats.flatMap(({ id: voterId }) => {
    const eligibleIds = nightTargets(run, voterId)
    if (!eligibleIds.length) return []
    const targetId =
      voterId === run.humanId && humanTargetId && eligibleIds.includes(humanTargetId)
        ? humanTargetId
        : chooseNominee(run, voterId, eligibleIds, briefing)
    return targetId ? [{ voterId, targetId }] : []
  })
}

function caseFor(run: Run, voterId: string, targetId: string) {
  const ownConversations = getSocialView(run, voterId)
  const read = nightShieldReads(run, voterId).get(targetId)
  if (voterId === run.humanId && read) {
    if (read.publicAwardOnly) return 'They won a Night Shield. They could have passed it on.'
    if (read.conflicting) return 'The stories about their Night Shield don’t agree.'
    if (read.witnessedGift) return 'You gave them a shield earlier. They could have passed it on.'
    if (read.protected) return 'You’ve heard they might have a Night Shield.'
    if (read.exposed) return 'You’ve heard they might have no Night Shield.'
  }
  if (voterId !== run.humanId && read && !read.conflicting && read.exposed > 0.38) {
    return 'I heard they might be unprotected tonight. I’d take that chance.'
  }
  const threats = new Set([voterId, ...knownTeammateIds(run, voterId)])
  if (
    run.lastTable?.campaigns?.some(
      (claim) => claim.speakerId === targetId && threats.has(claim.targetId)
    )
  ) {
    return 'They were building a case against us at the table. By morning they could have more people behind it.'
  }
  const castAgainst = run.lastTable?.revealedBallots?.find(
    ({ voterId }) => voterId === targetId
  )?.targetId
  if (castAgainst === voterId)
    return 'They already voted for me. They could bring others next time.'
  if (castAgainst && knownTeammateIds(run, voterId).includes(castAgainst))
    return 'They voted for one of us. That is a campaign we cannot let grow.'
  if (rapport(ownConversations, voterId, targetId) > 0.12) {
    return 'They trust me. Their absence could throw tomorrow’s alliances off balance.'
  }
  if ((run.lastTable?.tally[targetId] ?? 0) > 0) {
    return 'Their name is already on slates. Take them out and the table has to start over.'
  }
  if (ownConversations.some(({ suspectId }) => suspectId === targetId)) {
    return 'I’ve heard their name in private. By tomorrow, they could be setting the agenda.'
  }
  const possibilities = [
    'Nobody wrote their name down. By daybreak the room will be guessing why we chose them.',
    'The table let them through. I’d take the opportunity while we still have it.',
    'Without a single vote against them, they could still be here on the last night.',
  ]
  const position = run.seats.findIndex(({ id }) => id === voterId)
  return possibilities[(run.day + position) % possibilities.length]
}

function projectedTargets(run: Run, actorId: string, known: ReadonlySet<string>) {
  return run.seats
    .filter(({ id, exit }) => !exit && id !== actorId && id !== run.immunityId && !known.has(id))
    .map(({ id }) => id)
}

export function getConclaveView(
  run: Run,
  actorId: string | null,
  selectedId?: string
): ConclaveView | null {
  if (run.phase !== 'night' || !actorId || !isActiveBetrayer(run, actorId)) return null

  const known = new Set(knownTeammateIds(run, actorId))
  const seats = new Map(run.seats.map((seat) => [seat.id, seat]))
  const vote = run.private.conclaveVote
  const targetIds = vote ? runoffTargets(vote.nominations) : projectedTargets(run, actorId, known)
  if (vote) {
    const unchanged = (id: string) => vote.nominations.find((ballot) => ballot.voterId === id)
    return {
      targetIds,
      proposals: [],
      runoff: ballotLine(run, vote.nominations),
      ownArgument:
        selectedId === unchanged(actorId)?.targetId ? 'You are keeping your vote.' : undefined,
    }
  }
  const guests = conclaveGuests(run, actorId)
  const participants = run.seats.filter(
    ({ id, exit }) => !exit && run.private.betrayers.includes(id)
  )
  const speakerIdFor = (id: string) => guests[participants.findIndex((seat) => seat.id === id)].id
  const briefing = discussShields(run)
  const proposals = nominate(run, briefing).flatMap(({ voterId, targetId }) => {
    if (voterId === actorId) return []
    const speaker = known.has(voterId) ? seats.get(voterId) : undefined
    const nominee = seats.get(targetId)
    if (!nominee) return []
    return [
      {
        speakerId: speakerIdFor(voterId),
        speakerName: speaker?.name ?? 'Hooded voice',
        portrait: speaker?.portrait,
        nomineeName: nominee.name,
        argument: caseFor(run, voterId, targetId),
      },
    ]
  })
  const ownArgument =
    selectedId && targetIds.includes(selectedId) ? caseFor(run, actorId, selectedId) : undefined
  const shieldBriefing = briefing.flatMap(({ speakerId, subjectId, read }) => {
    if (speakerId === actorId) return []
    const speaker = known.has(speakerId) ? seats.get(speakerId) : undefined
    const subject = seats.get(subjectId)?.name
    if (!subject) return []
    const argument = read.conflicting
      ? `I've heard different things about ${subject}'s shield. I wouldn't bet the night on either story.`
      : read.protected >= read.exposed
        ? read.witnessedGift
          ? `I had reason to think ${subject} was covered earlier. That could have changed.`
          : read.firsthand
            ? `${subject} told me they had a shield. Could be a bluff, but I'd keep a second name in mind.`
            : `I heard ${subject} might have a shield. It's secondhand, but I'd keep it in mind.`
        : read.firsthand
          ? `${subject} says they have no shield. They could be trying to draw us in.`
          : `I heard ${subject} might be open tonight. I wouldn't take a rumor as proof.`
    return [
      {
        speakerId: speakerIdFor(speakerId),
        speakerName: speaker?.name ?? 'Hooded voice',
        portrait: speaker?.portrait,
        argument,
      },
    ]
  })
  return { targetIds, proposals, ownArgument, shieldBriefing }
}

export function getConclaveVerdict(run: Run, actorId: string | null) {
  if (run.phase !== 'night-resolved' || !actorId || !isActiveBetrayer(run, actorId)) return null
  const pending = run.private.pendingNight
  return pending ? { targetId: pending.targetId, byDraw: pending.byDraw } : null
}

export function describeConclaveVerdict(run: Run, actorId: string | null) {
  const verdict = getConclaveVerdict(run, actorId)
  if (!verdict) return
  if (!verdict.targetId) return 'The Conclave chose no one.'
  const name = run.seats.find(({ id }) => id === verdict.targetId)?.name ?? 'A guest'
  const vote = run.private.conclaveVote
  const finalBallots = vote?.runoff ?? vote?.nominations
  const tally =
    finalBallots && `${vote?.runoff ? 'Runoff' : 'Ballot'}: ${ballotLine(run, finalBallots)}.`
  const changes = vote?.runoff?.filter(
    ({ voterId, targetId }) =>
      vote.nominations.find((ballot) => ballot.voterId === voterId)?.targetId !== targetId
  ).length
  const changeLine =
    changes === undefined
      ? undefined
      : changes === 0
        ? 'No votes changed.'
        : changes === 1
          ? 'One vote changed.'
          : `${changes} votes changed.`
  const majority = finalBallots && majorityTarget(countVotes(finalBallots), finalBallots.length)
  const decision = verdict.byDraw
    ? `${name} was chosen by draw.`
    : majority === verdict.targetId
      ? `${name} was chosen by majority vote.`
      : `${name} was chosen with the most votes.`
  return [tally, changeLine, decision].filter(Boolean).join(' ')
}

export function resolveConclave(run: Run, token: CommandToken, humanTargetId?: string): Run {
  if (run.phase !== 'night' || !isCurrentCommand(run, token)) return run
  if (pendingPaidNightShieldPurchase(run)) return run
  const humanIsBetrayer = isActiveBetrayer(run, run.humanId)
  const pending = run.private.conclaveVote
  const briefing = discussShields(run)
  if (pending) {
    const targets = runoffTargets(pending.nominations)
    if (humanIsBetrayer && (!humanTargetId || !targets.includes(humanTargetId))) return run
    return resolveConclaveRunoff(run, token, pending.nominations, targets, briefing, humanTargetId)
  }
  if (humanIsBetrayer) {
    const known = new Set(knownTeammateIds(run, run.humanId))
    const targetIds = projectedTargets(run, run.humanId, known)
    if (targetIds.length && (!humanTargetId || !targetIds.includes(humanTargetId))) return run
  }

  // An unknown Betrayer can appear to be a viable target. The private votes move to a backup.
  const nominations = nominate(run, briefing, humanIsBetrayer ? humanTargetId : undefined)
  const tally = tallyNightBallots(run, nominations)
  if (!tally) return run
  if (!nominations.length || majorityTarget(tally, nominations.length)) {
    const resolved = resolveNight(run, token, nominations)
    return { ...resolved, private: { ...resolved.private, conclaveVote: { nominations } } }
  }
  if (humanIsBetrayer) {
    return {
      ...run,
      revision: run.revision + 1,
      private: { ...run.private, conclaveVote: { nominations } },
    }
  }
  return resolveConclaveRunoff(run, token, nominations, runoffTargets(nominations), briefing)
}

function resolveConclaveRunoff(
  run: Run,
  token: CommandToken,
  nominations: Ballot[],
  targets: string[],
  briefing: readonly ShieldBriefing[],
  humanTargetId?: string
) {
  const tally = countVotes(nominations)
  const random = mulberry32(run.publicSeed ^ Math.imul(run.day, 4261))
  const runoff = nominations.map((nomination) => {
    if (nomination.voterId === run.humanId && humanTargetId)
      return { ...nomination, targetId: humanTargetId }
    const alternatives = targets.filter((id) => id !== nomination.targetId)
    const preferred = chooseNominee(run, nomination.voterId, alternatives, briefing)
    if (!preferred) return nomination

    // The closer a proposal is to passing, the easier it is to compromise on it.
    const support = tally.get(preferred) ?? 0
    return !targets.includes(nomination.targetId) ||
      random() < 0.2 + support / (nominations.length * 2)
      ? { ...nomination, targetId: preferred }
      : nomination
  })
  const resolved = resolveNight(run, token, runoff, nominations)
  return resolved === run
    ? run
    : { ...resolved, private: { ...resolved.private, conclaveVote: { nominations, runoff } } }
}

export function revealDawn(run: Run, token: CommandToken): Run {
  const night = run.private.pendingNight
  if (run.phase !== 'night-resolved' || !isCurrentCommand(run, token) || !night) return run
  const eliminatedId = night.blocked ? null : night.targetId
  const seats = run.seats.map((seat) =>
    seat.id === eliminatedId ? { ...seat, exit: { cause: 'night' as const, day: run.day } } : seat
  )
  const day = run.day + 1
  return {
    ...run,
    seats,
    day,
    lastDawn: { day, eliminatedId },
    revision: run.revision + 1,
    phase:
      seats.filter(({ exit }) => !exit).length === FINALE_CAST_SIZE ? 'final-challenge' : 'dawn',
    immunityId: undefined,
    private: {
      ...run.private,
      nightShieldIds: [],
      nightShieldAwardIds: undefined,
      lastShieldSave: night.blocked && night.targetId ? { day, id: night.targetId } : undefined,
      conclaveVote: undefined,
      pendingNight: undefined,
    },
  }
}

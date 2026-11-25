import { getSocialPersonality } from '../social/socialPersonalityBank.ts'
import { mulberry32 } from '../store/rng.ts'
import {
  audienceDecisionPending,
  eligibleBanishmentTargets,
  hashId,
  isCurrentCommand,
} from './run.ts'
import type { Ballot, CommandToken, Run, TableArgument } from './run.ts'
import { prepareVotePlans } from './votePlans.ts'

export const AUDIENCE_EVENTS = [
  'immunity',
  'safety',
  'defend',
  'case',
  'witness',
  'ballot',
  'under-fire',
  'appeal',
  'endorse',
  'backed',
  'own',
  'explain',
  'name',
  'reply',
  'wager',
  'kept',
  'switched',
] as const
export type AudienceEvent = {
  day: number
  kind: (typeof AUDIENCE_EVENTS)[number]
  actorId: string
  targetId?: string
}
export const AUDIENCE_FORMATS = ['wager', 'hot-seat', 'save'] as const
export const HOT_SEAT_ANSWERS = ['own', 'explain', 'name'] as const
export type HotSeatAnswer = (typeof HOT_SEAT_ANSWERS)[number]
export const WAGER_BONUS = 250

type HotSeat = { speakerId: string; defendedId: string; votedId: string; influenceId?: string }
type AudienceEpisode = {
  day: number
  kind: (typeof AUDIENCE_FORMATS)[number]
  hotSeat?: HotSeat
  decision?:
    | { kind: 'save'; shares: { guestId: string; percent: number }[]; reasons: AudienceEvent[] }
    | {
        kind: 'hot-seat'
        answer: HotSeatAnswer
        respondentId?: string
        reply?: 'back' | 'challenge'
      }
    | {
        kind: 'wager'
        volunteerId?: string
        targetId?: string
        result?: 'kept' | 'switched' | 'void'
      }
}
export type AudienceState = {
  episode: AudienceEpisode
  events: AudienceEvent[]
  lastSaveDay?: number
  ballotDay?: number
}
export type AudienceMove =
  | { kind: 'save'; guestId?: string }
  | { kind: 'hot-seat'; answer?: HotSeatAnswer; reply?: 'back' | 'challenge' }
  | { kind: 'wager'; targetId?: string }

const eventWeights: Record<AudienceEvent['kind'], readonly [number, number, number]> = {
  immunity: [1, 4, 0],
  safety: [1, 2, 0],
  defend: [4, 0, 2],
  case: [-1, 4, 0],
  witness: [3, 3, 4],
  ballot: [0, 0, 0],
  'under-fire': [0, 0, 4],
  appeal: [1, 2, 3],
  endorse: [3, 1, 0],
  backed: [2, 1, 3],
  own: [2, 3, 2],
  explain: [2, 2, 1],
  name: [-2, 3, 0],
  reply: [1, 2, 1],
  wager: [0, 2, 1],
  kept: [5, 0, 1],
  switched: [-4, 3, 0],
}

const active = (run: Run, id: string) => run.seats.some((seat) => seat.id === id && !seat.exit)
const allActive = (run: Run) => run.seats.filter(({ exit }) => !exit).map(({ id }) => id)
const randomFor = (run: Run, reason: string) =>
  mulberry32(run.publicSeed ^ hashId(`${run.day}:${reason}`))

function yesterdayContradictions(run: Run, events: readonly AudienceEvent[]): HotSeat[] {
  const past = events.filter(({ day }) => day === run.day - 1)
  return past.flatMap(({ kind, actorId, targetId }) => {
    if (kind !== 'defend' || !targetId || !active(run, actorId)) return []
    const votedId = past.find(
      (event) => event.kind === 'ballot' && event.actorId === actorId
    )?.targetId
    if (votedId !== targetId) return []
    const influenceId = past.find(
      (event) =>
        event.kind === 'case' &&
        event.targetId === votedId &&
        event.actorId !== actorId &&
        active(run, event.actorId)
    )?.actorId
    return [{ speakerId: actorId, defendedId: targetId, votedId, influenceId }]
  })
}

export function openAudienceEpisode(run: Run): Run {
  if (
    !run.dayFlow ||
    !run.options.publicMode ||
    run.phase === 'final-challenge' ||
    run.audience?.episode.day === run.day
  )
    return run
  const last = run.audience
  const events = (last?.events ?? []).filter(({ day }) => day >= run.day - 5)
  const hotSeats = yesterdayContradictions(run, events)
  const random = randomFor(run, 'audience format')
  const hotSeat =
    hotSeats.find(({ speakerId }) => speakerId === run.humanId) ??
    hotSeats.at(Math.floor(random() * hotSeats.length))
  const saveReady =
    run.day >= 3 &&
    run.day - (last?.lastSaveDay ?? 0) >= 3 &&
    allActive(run).filter((id) =>
      events.some(({ actorId, kind }) => actorId === id && kind !== 'ballot')
    ).length >= 3
  const episode: AudienceEpisode =
    hotSeat && last?.episode.kind !== 'hot-seat' && (!saveReady || random() < 0.58)
      ? { day: run.day, kind: 'hot-seat', hotSeat }
      : { day: run.day, kind: saveReady ? 'save' : 'wager' }
  return { ...run, audience: { ...last, events, episode } }
}

export function addAudienceEvents(run: Run, events: readonly Omit<AudienceEvent, 'day'>[]): Run {
  if (!run.audience || !run.options.publicMode || !events.length) return run
  const previous = run.audience.events
  const distinct = new Map(
    events.map((event) => [`${event.kind}:${event.actorId}:${event.targetId ?? ''}`, event])
  )
  const aired = [...distinct.values()].filter(
    (event) =>
      !previous.some(
        (prior) =>
          prior.day === run.day &&
          prior.kind === event.kind &&
          prior.actorId === event.actorId &&
          prior.targetId === event.targetId
      )
  )
  if (!aired.length) return run
  return {
    ...run,
    audience: {
      ...run.audience,
      events: [...previous, ...aired.map((event) => ({ ...event, day: run.day }))],
    },
  }
}

export function audienceSaveCandidates(run: Run) {
  return allActive(run).filter(
    (id) =>
      id !== run.immunityId &&
      id !== run.publicShield?.id &&
      run.audience?.events.some(({ actorId, kind }) => actorId === id && kind !== 'ballot')
  )
}

export function eligibleToAppeal(run: Run) {
  return run.humanId !== run.immunityId && run.humanId !== run.publicShield?.id
}

export function predictedHotSeatAnswer(run: Run): HotSeatAnswer {
  const seat = run.audience?.episode.hotSeat
  if (!seat) return 'explain'
  const profile = getSocialPersonality(seat.speakerId)
  if (seat.influenceId && profile.deceptionComfort > 0.56) return 'name'
  return profile.publicConflictComfort > 0.58 ? 'own' : 'explain'
}

function audienceVote(run: Run) {
  const candidates = audienceSaveCandidates(run)
  if (candidates.length === 0) return { shares: [], reasons: [] }
  // Each third of the audience weighs the same public record differently.
  const taste = randomFor(run, 'viewer turnout')
  const viewers = [0.83 + taste() * 0.34, 0.83 + taste() * 0.34, 0.83 + taste() * 0.34]
  const ranked = candidates
    .map((guestId) => {
      const moments =
        run.audience?.events.filter(
          ({ actorId, kind }) => actorId === guestId && kind !== 'ballot'
        ) ?? []
      const value = (event: AudienceEvent, index: number) =>
        eventWeights[event.kind][index] * 0.72 ** (run.day - event.day)
      const weight = viewers.reduce((sum, turnout, index) => {
        const support = moments.reduce((score, event) => score + value(event, index), 0)
        return sum + turnout * Math.exp(Math.min(16, Math.max(-8, support)) * 0.16)
      }, 0)
      return {
        guestId,
        weight,
        moments: [...moments].sort((a, b) =>
          viewers.reduce(
            (sum, turnout, index) => sum + turnout * (value(b, index) - value(a, index)),
            0
          )
        ),
      }
    })
    .sort((a, b) => b.weight - a.weight || a.guestId.localeCompare(b.guestId))
  const total = ranked.reduce((sum, row) => sum + row.weight, 0)
  const units = ranked.map(({ weight }) => (1000 * weight) / total)
  const rounded = units.map((amount) => Math.floor(amount))
  const leftover = 1000 - rounded.reduce((sum, amount) => sum + amount, 0)
  const fractions = units.map((amount, index) => ({ index, fraction: amount - rounded[index] }))
  fractions.sort((a, b) => b.fraction - a.fraction)
  for (const { index } of fractions.slice(0, leftover)) rounded[index] += 1
  return {
    shares: ranked.map(({ guestId }, index) => ({
      guestId,
      percent: rounded[index] / 10,
    })),
    reasons: ranked[0].moments.slice(0, 2),
  }
}

function audienceVolunteer(run: Run) {
  const random = randomFor(run, 'wager volunteers')
  return allActive(run)
    .filter((id) => id !== run.humanId)
    .map((id) => {
      const profile = getSocialPersonality(id)
      return {
        id,
        interest:
          profile.publicConflictComfort * 0.36 + profile.riskTolerance * 0.3 + random() * 0.45,
      }
    })
    .sort((a, b) => b.interest - a.interest)
    .find(({ id, interest }) => interest >= 0.68 && eligibleBanishmentTargets(run, id).length > 0)
    ?.id
}

export function resolveAudienceDecision(
  run: Run,
  token: CommandToken,
  move: AudienceMove,
  spectator = false
): Run {
  const before = run.audience
  if (
    !before ||
    !isCurrentCommand(run, token) ||
    !audienceDecisionPending(run) ||
    run.presentation?.length ||
    move.kind !== before.episode.kind ||
    spectator === active(run, run.humanId)
  )
    return run
  const { humanId, day } = run
  let next = run
  let decision: AudienceEpisode['decision']
  let lastSaveDay = before.lastSaveDay
  if (move.kind === 'save') {
    if (
      !spectator &&
      move.guestId &&
      (move.guestId === humanId
        ? !eligibleToAppeal(run)
        : !audienceSaveCandidates(run).includes(move.guestId))
    )
      return run
    if (!spectator && move.guestId) {
      next = addAudienceEvents(
        next,
        move.guestId === humanId
          ? [{ actorId: humanId, kind: 'appeal' }]
          : [
              { actorId: humanId, kind: 'endorse', targetId: move.guestId },
              { actorId: move.guestId, kind: 'backed', targetId: humanId },
            ]
      )
      if (move.guestId !== humanId)
        next = {
          ...next,
          social: [
            ...next.social,
            {
              day,
              actorId: humanId,
              recipientId: move.guestId,
              kind: 'group-chat',
            },
          ],
        }
    }
    decision = { kind: 'save', ...audienceVote(next) }
    const winner = decision.shares[0]?.guestId
    if (winner) {
      lastSaveDay = day
      next = { ...next, publicShield: { id: winner, day } }
    }
  } else if (move.kind === 'hot-seat') {
    const seat = before.episode.hotSeat
    if (!seat) return run
    const playerInChair = seat.speakerId === humanId && !spectator
    if (
      playerInChair &&
      (!move.answer ||
        !HOT_SEAT_ANSWERS.includes(move.answer) ||
        (move.answer === 'name' && !seat.influenceId))
    )
      return run
    const answer = playerInChair && move.answer ? move.answer : predictedHotSeatAnswer(run)
    const respondentId =
      playerInChair && answer === 'name' ? seat.influenceId : move.reply ? humanId : undefined
    const reply =
      playerInChair && respondentId
        ? 'challenge'
        : !spectator && !playerInChair
          ? move.reply
          : undefined
    decision = { kind: 'hot-seat', answer, respondentId, reply }
    next = addAudienceEvents(next, [
      {
        actorId: seat.speakerId,
        targetId: answer === 'name' ? seat.influenceId : seat.defendedId,
        kind: answer,
      },
      ...(respondentId && reply
        ? [{ actorId: respondentId, targetId: seat.speakerId, kind: 'reply' as const }]
        : []),
    ])
    if (respondentId && reply)
      next = {
        ...next,
        social: [
          ...next.social,
          {
            day,
            actorId: respondentId,
            recipientId: seat.speakerId,
            kind: 'group-chat',
            reaction: reply === 'back' ? 'repaired' : 'backfired',
          },
        ],
      }
  } else {
    if (
      move.targetId &&
      (spectator || !eligibleBanishmentTargets(run, humanId).includes(move.targetId))
    )
      return run
    const volunteerId = move.targetId ? humanId : audienceVolunteer(run)
    const eligible = volunteerId ? eligibleBanishmentTargets(run, volunteerId) : []
    const prior = volunteerId ? run.dayFlow?.provisional?.[volunteerId] : undefined
    const targetId = move.targetId ?? eligible.find((id) => id === prior) ?? eligible.at(0)
    decision = { kind: 'wager', volunteerId, targetId }
    if (volunteerId && targetId)
      next = addAudienceEvents(next, [{ actorId: volunteerId, targetId, kind: 'wager' }])
  }
  return prepareVotePlans({
    ...next,
    revision: run.revision + 1,
    publicShieldDecisionDay: day,
    audience: {
      ...before,
      events: next.audience?.events ?? before.events,
      lastSaveDay,
      episode: { ...before.episode, decision },
    },
  })
}

export function audienceWagerPressure(run: Run, voterId: string) {
  const episode = run.audience?.episode
  const wager = episode?.decision
  if (
    episode?.day !== run.day ||
    wager?.kind !== 'wager' ||
    !wager.targetId ||
    voterId !== wager.volunteerId
  )
    return undefined
  const profile = getSocialPersonality(voterId)
  return { targetId: wager.targetId, weight: 0.15 + profile.loyalty * 0.2 }
}

export function audienceOpening(run: Run): TableArgument | undefined {
  const episode = run.audience?.episode
  if (episode?.day !== run.day) return
  const { decision, hotSeat } = episode
  if (decision?.kind === 'wager' && decision.volunteerId && decision.targetId)
    return {
      speakerId: decision.volunteerId,
      targetId: decision.targetId,
      basis: 'record',
      tone: 'careful',
      broadcast: 'wager',
    }
  if (decision?.kind === 'hot-seat' && hotSeat && decision.reply && decision.respondentId)
    return {
      speakerId: decision.respondentId,
      targetId: hotSeat.speakerId,
      basis: 'record',
      tone: 'careful',
      broadcast: decision.reply,
      stance: decision.reply === 'back' ? 'defend' : 'question',
    }
}

export function recordAudienceBallot(
  run: Run,
  ballots: readonly Ballot[],
  arguments_: readonly TableArgument[]
): Run {
  const audience = run.audience
  if (
    !audience ||
    audience.ballotDay === run.day ||
    run.phase === 'final-banishment' ||
    run.private.pendingTable?.blind
  )
    return run
  const tally = new Map<string, number>()
  for (const { targetId } of ballots) tally.set(targetId, (tally.get(targetId) ?? 0) + 1)
  const events: Omit<AudienceEvent, 'day'>[] = [
    ...ballots.map(({ voterId, targetId }) => ({
      actorId: voterId,
      targetId,
      kind: 'ballot' as const,
    })),
    ...[...tally]
      .filter(([, count]) => count >= 2)
      .map(([actorId]) => ({ actorId, kind: 'under-fire' as const })),
    ...arguments_.flatMap(
      ({ speakerId, targetId, stance, investigation }): Omit<AudienceEvent, 'day'>[] => {
        const witness =
          investigation?.witness &&
          run.investigation?.reports.find(({ id }) => id === investigation.reportId)?.speakerId
        return [
          ...(stance !== 'question'
            ? [
                {
                  actorId: speakerId,
                  targetId,
                  kind: stance === 'defend' ? ('defend' as const) : ('case' as const),
                },
              ]
            : []),
          ...(witness ? [{ actorId: witness, targetId, kind: 'witness' as const }] : []),
        ]
      }
    ),
  ]
  const episode = audience.episode
  let decision = episode.decision
  let pot = run.pot
  if (
    decision?.kind === 'wager' &&
    decision.volunteerId &&
    decision.targetId &&
    episode.day === run.day
  ) {
    const volunteerId = decision.volunteerId
    const cast = ballots.find(({ voterId }) => voterId === volunteerId)
    const result =
      !cast ||
      !eligibleBanishmentTargets({ ...run, runoffIds: undefined }, cast.voterId).includes(
        decision.targetId
      )
        ? 'void'
        : cast.targetId === decision.targetId
          ? 'kept'
          : 'switched'
    if (result !== 'void')
      events.push({ kind: result, actorId: decision.volunteerId, targetId: decision.targetId })
    if (result === 'kept') pot += WAGER_BONUS
    decision = { ...decision, result }
  }
  return addAudienceEvents(
    {
      ...run,
      pot,
      audience: { ...audience, ballotDay: run.day, episode: { ...episode, decision } },
    },
    events
  )
}

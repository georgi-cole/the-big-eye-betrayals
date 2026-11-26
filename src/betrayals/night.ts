import { mulberry32, seededPick } from '../store/rng.ts'
import { commandToken, hashId, isCurrentCommand, knownTeammateIds, viewFor } from './run.ts'
import type { CommandToken, Run } from './run.ts'
import { nightExposure, nightShieldReads, shieldRoll } from './nightShields.ts'
import type { ShieldRead } from './nightShields.ts'
import { getSocialPersonality } from '../social/socialPersonalityBank.ts'
import { getSocialView, rapport } from './social.ts'
import { chooseTarget, rankedTargets, resolutionPerspective } from './strategy.ts'
import type { Ballot } from './table.ts'
import { deliverNightDecision } from './dayFlow.ts'
import { hasPaidNightShield, pendingPaidNightShieldPurchase } from './economy.ts'
import { requiredRecruiterId, resolveRecruitment } from './recruitment.ts'
import {
  castleRoleFor,
  COLUMBUS_GROUP_SIZE,
  doctorSelfWardUsed,
  eligibleCastleRole,
  isConcealedSecretBetrayer,
  passCastleRole,
  recordCastleRoleUse,
  spendCastleRole,
  turnCursedGuest,
  type NightPower,
} from './castleRoles.ts'
import { FINALE_CAST_SIZE } from './seasonPhases.ts'
import { settleRun } from './settlement.ts'
import { afterCastleDeparture, unsealSecretBetrayer } from './castleRoleEvents.ts'
import { composeConclaveConversation } from './conclaveConversation.ts'
import type { CinematicCastMember } from './CinematicScene'

export type ConclaveProposal = {
  speakerId: string
  speakerName: string
  portrait?: string
  nomineeId: string
  nomineeName: string
  argument: string
}

export type ConclaveLine = Omit<ConclaveProposal, 'nomineeId' | 'nomineeName'> & {
  nomineeName?: string
}

export type ConclaveView = {
  targetIds: string[]
  proposals: ConclaveProposal[]
  discussion: ConclaveLine[]
  shieldBriefing?: ConclaveLine[]
  runoff?: string
  ownArgument?: string
  alphaAvailable?: boolean
  nominationBlocked?: boolean
  sealed?: boolean
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

function mayAttendConclave(run: Run, actorId: string) {
  return isActiveBetrayer(run, actorId) && !isConcealedSecretBetrayer(run, actorId)
}

function activeSecretBetrayer(run: Run) {
  return run.private.betrayers.find(
    (id) => isConcealedSecretBetrayer(run, id) && isActiveBetrayer(run, id)
  )
}

type NightRolePrompt =
  | { roleId: 'doctor' | 'extrasense' | 'columbus'; targetIds: string[] }
  | { roleId: NightPower; targetIds?: never }

function nightRoleFor(run: Run, actorId: string): NightRolePrompt | undefined {
  // The player's options must not disclose that recruitment is scheduled.
  if (run.phase !== 'night' || run.private.conclaveVote || run.private.humanRecruitmentOffered)
    return
  const card = castleRoleFor(run, actorId)
  if (!card || card.passedDay === run.day || !eligibleCastleRole(run, actorId, card.roleId)) return
  if (card.roleId === 'good-witch' || card.roleId === 'illusionist') return { roleId: card.roleId }
  if (card.roleId !== 'doctor' && card.roleId !== 'extrasense' && card.roleId !== 'columbus') return
  return {
    roleId: card.roleId,
    targetIds: run.seats
      .filter(
        ({ id, exit }) =>
          !exit && (id !== actorId || (card.roleId === 'doctor' && !doctorSelfWardUsed(card)))
      )
      .map(({ id }) => id),
  }
}

export function nightCastleRoleFor(run: Run, actorId: string | null) {
  return actorId === run.humanId ? nightRoleFor(run, actorId) : undefined
}

export function resolveNightCastleRole(
  run: Run,
  token: CommandToken,
  choice?: string | readonly string[] | true
): Run {
  if (
    !isCurrentCommand(run, token) ||
    run.presentation?.length ||
    pendingPaidNightShieldPurchase(run)
  )
    return run
  const prompt = nightCastleRoleFor(run, run.humanId)
  if (!prompt) return run
  if (choice === undefined) return passCastleRole(run, run.humanId)
  if (prompt.roleId === 'columbus') {
    return Array.isArray(choice)
      ? spendCastleRole(run, run.humanId, { roleId: prompt.roleId, guestIds: choice })
      : run
  }
  if (prompt.roleId === 'doctor' || prompt.roleId === 'extrasense') {
    return typeof choice === 'string' && prompt.targetIds.includes(choice)
      ? spendCastleRole(run, run.humanId, { roleId: prompt.roleId, targetId: choice })
      : run
  }
  if (choice !== true) return run
  // A recruitment night has no murder ballot. Keep the charge and handle any invitation normally.
  if (requiredRecruiterId(run)) {
    const passed = passCastleRole(run, run.humanId)
    return resolveConclave(passed, commandToken(passed))
  }
  return resolveConclaveBallot(run, token, undefined, prompt.roleId)
}

function doctorTarget(run: Run, actorId: string, targetIds: string[]) {
  const knownShields = new Set(viewFor(run, actorId).knownNightShieldIds)
  const conversations = getSocialView(run, actorId)
  const reads = nightShieldReads(run, actorId)
  const choices = targetIds
    .filter((id) => id !== run.immunityId && !knownShields.has(id))
    .map((id) => ({
      id,
      score:
        nightExposure(run, id) +
        (id === actorId ? 0.12 : rapport(conversations, actorId, id) * 0.25) -
        (reads.get(id)?.protected ?? 0) * 0.4 +
        shieldRoll(run, actorId + ':' + id, 33413) * 0.2,
    }))
  choices.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
  return choices[0]?.id
}

function spendAiNightRoles(run: Run) {
  if (!run.private.castleRoles?.length) return run
  let next = run
  for (const { id } of run.seats) {
    if (id === run.humanId || (run.day < 3 && shieldRoll(run, id, 11369) >= 0.25)) continue
    const prompt = nightRoleFor(next, id)
    if (!prompt?.targetIds) continue
    if (prompt.roleId === 'columbus') {
      const perspective = resolutionPerspective(next, id, prompt.targetIds)
      // Check the strongest lead alongside less suspicious guests, so either result is useful.
      const [lead, ...otherGuests] = rankedTargets(perspective, 'case')
      if (lead)
        next = spendCastleRole(next, id, {
          roleId: 'columbus',
          guestIds: [lead, ...otherGuests.slice(-(COLUMBUS_GROUP_SIZE - 1))],
        })
      continue
    }
    const targetId =
      prompt.roleId === 'doctor'
        ? doctorTarget(next, id, prompt.targetIds)
        : chooseTarget(resolutionPerspective(next, id, prompt.targetIds), 'case')
    if (targetId) next = spendCastleRole(next, id, { roleId: prompt.roleId, targetId })
  }
  // The Night command commits these private preparations in the same revision.
  return next === run ? run : { ...next, revision: run.revision }
}

function activeDoctorWard(run: Run, targetId: string) {
  return run.private.castleRoles?.some(
    ({ used }) => used?.roleId === 'doctor' && used.day === run.day && used.targetId === targetId
  )
}

function hasNightShield(run: Run, targetId: string) {
  return run.private.nightShieldIds.includes(targetId) || hasPaidNightShield(run, targetId)
}

function aiNightPower(run: Run, roleId: NightPower) {
  const card = run.private.castleRoles?.find((card) => card.roleId === roleId)
  if (!card || card.guestId === run.humanId || !eligibleCastleRole(run, card.guestId, roleId))
    return
  const living = run.seats.filter(({ exit }) => !exit).length
  const view = viewFor(run, card.guestId)
  const exposure =
    view.hasNightShield || run.immunityId === card.guestId ? 0 : nightExposure(run, card.guestId)
  const risk = getSocialPersonality(card.guestId).riskTolerance
  const alliesAtRisk =
    roleId === 'good-witch'
      ? Math.max(
          0,
          ...run.seats.flatMap(({ id, exit }) =>
            exit ||
            id === card.guestId ||
            id === run.immunityId ||
            view.knownNightShieldIds.includes(id)
              ? []
              : [rapport(run.social, card.guestId, id) * nightExposure(run, id)]
          )
        )
      : 0
  const chance = Math.min(
    0.85,
    (living <= 11 ? 0.52 : run.day <= 2 ? 0.07 : 0.2) +
      exposure * (roleId === 'good-witch' ? 0.23 : 0.1) +
      risk * 0.08 +
      alliesAtRisk * 0.18
  )
  if (shieldRoll(run, card.guestId, roleId === 'good-witch' ? 19391 : 21529) < chance)
    return card.guestId
}

function hasMurderConclave(run: Run) {
  return (
    !run.private.conclaveVote &&
    run.private.betrayers.some((id) => isActiveBetrayer(run, id)) &&
    run.seats.some(
      ({ id, exit }) => !exit && id !== run.immunityId && !run.private.betrayers.includes(id)
    )
  )
}

export function aiGoodWitch(run: Run) {
  const witch = aiNightPower(run, 'good-witch')
  return witch && hasMurderConclave(run) ? witch : undefined
}

function cancelMurder(run: Run, witch: string): Run {
  const spent = spendCastleRole(run, witch, { roleId: 'good-witch' })
  if (spent === run) return run
  return {
    ...spent,
    phase: 'night-resolved',
    private: {
      ...spent.private,
      pendingNight: { targetId: null, blocked: false, castleEffect: { kind: 'good-witch' } },
    },
  }
}

export function nightTargets(run: Run, actorId: string): string[] {
  if (run.phase !== 'night' || !mayAttendConclave(run, actorId) || requiredRecruiterId(run))
    return []
  const ward = darkAngelWard(run, actorId)
  return run.seats
    .filter(
      ({ id, exit }) =>
        !exit &&
        id !== run.immunityId &&
        id !== ward &&
        (!run.private.betrayers.includes(id) || isConcealedSecretBetrayer(run, id))
    )
    .map(({ id }) => id)
}

function darkAngelWard(run: Run, voterId: string) {
  return run.private.castleRoles?.find(
    ({ used }) => used?.roleId === 'dark-angel' && used.day === run.day && used.targetId === voterId
  )?.guestId
}

function protectDarkAngel(run: Run, ballots: readonly Ballot[]): Run {
  const angel = run.private.castleRoles?.find(({ roleId }) => roleId === 'dark-angel')
  if (
    !angel?.boundBetrayerId ||
    !eligibleCastleRole(run, angel.guestId, 'dark-angel') ||
    !ballots.some(
      ({ voterId, targetId }) => voterId === angel.boundBetrayerId && targetId === angel.guestId
    )
  )
    return run
  return recordCastleRoleUse(run, angel, {
    roleId: 'dark-angel',
    day: run.day,
    targetId: angel.boundBetrayerId,
  })
}

function alphaNominations(run: Run, nominations: Ballot[], humanDouble: boolean) {
  const alpha = run.private.castleRoles?.find(({ roleId }) => roleId === 'alpha-betrayer')
  const ballot = nominations.find(({ voterId }) => voterId === alpha?.guestId)
  if (!alpha || !ballot || !eligibleCastleRole(run, alpha.guestId, 'alpha-betrayer'))
    return { run, nominations }
  const base = countVotes(nominations)
  const support = base.get(ballot.targetId) ?? 0
  const useful =
    !majorityTarget(base, nominations.length) && support >= Math.max(...base.values()) - 1
  if (alpha.guestId === run.humanId ? !humanDouble : !useful) return { run, nominations }
  return {
    run: recordCastleRoleUse(run, alpha, { roleId: 'alpha-betrayer', day: run.day }),
    nominations: nominations.map((row): Ballot => (row === ballot ? { ...row, weight: 2 } : row)),
  }
}

function tallyNightBallots(run: Run, choices: readonly Ballot[]) {
  const electorate = new Map(
    run.private.betrayers
      .map((id) => [id, nightTargets(run, id)] as const)
      .filter(([, targets]) => targets.length)
  )
  if (choices.length !== electorate.size) return

  const tally = new Map<string, number>()
  for (const { voterId, targetId, weight } of choices) {
    if (!electorate.get(voterId)?.includes(targetId)) return
    if (
      weight !== undefined &&
      (weight !== 2 ||
        castleRoleFor(run, voterId)?.used?.roleId !== 'alpha-betrayer' ||
        castleRoleFor(run, voterId)?.used?.day !== run.day)
    )
      return
    electorate.delete(voterId)
    tally.set(targetId, (tally.get(targetId) ?? 0) + (weight ?? 1))
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
  for (const { targetId, weight } of ballots)
    tally.set(targetId, (tally.get(targetId) ?? 0) + (weight ?? 1))
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
  if (!actorId || !mayAttendConclave(run, actorId)) return []
  const known = new Set([actorId, ...knownTeammateIds(run, actorId)])
  return run.seats
    .filter(({ id }) => run.private.betrayers.includes(id) && !isConcealedSecretBetrayer(run, id))
    .flatMap<CinematicCastMember>(({ id, name, portrait, exit }, conclaveSeat) => {
      if (exit) return []
      return known.has(id)
        ? [{ id, name, portrait, human: id === run.humanId, conclaveSeat }]
        : [{ id: 'hooded-' + conclaveSeat, name: 'Hooded guest', concealed: true, conclaveSeat }]
    })
}

export function resolveNight(
  run: Run,
  token: CommandToken,
  choices: readonly Ballot[],
  nominations: readonly Ballot[] = choices
): Run {
  if (run.phase !== 'night' || !isCurrentCommand(run, token)) return run
  if (
    run.private.departurePower ||
    pendingPaidNightShieldPurchase(run) ||
    requiredRecruiterId(run) ||
    nightCastleRoleFor(run, run.humanId)
  )
    return run
  if (choices.some(({ weight }) => weight !== undefined) || !tallyNightBallots(run, choices))
    return run
  const secretId = activeSecretBetrayer(run)
  if (secretId === run.humanId) return run
  const witch = aiGoodWitch(run)
  if (witch) return cancelMurder(run, witch)
  const warded = protectDarkAngel(run, choices)
  if (warded === run)
    return secretId
      ? resolveSealedVote(run, secretId, choices)
      : resolveNightBallot(run, choices, nominations)
  const updated = choices.flatMap(({ voterId, targetId }) => {
    const targets = nightTargets(warded, voterId)
    const eligible = targets.includes(targetId)
      ? targetId
      : chooseNominee(warded, voterId, targets, [])
    return eligible ? [{ voterId, targetId: eligible }] : []
  })
  return secretId
    ? resolveSealedVote(warded, secretId, updated)
    : resolveNightBallot(warded, updated, updated)
}

function resolveNightBallot(
  run: Run,
  choices: readonly Ballot[],
  nominations: readonly Ballot[],
  power?: NightPower
): Run {
  const tally = tallyNightBallots(run, choices)
  const nominated = choices === nominations ? tally : tallyNightBallots(run, nominations)
  if (!tally || !nominated || [...tally.keys()].some((id) => !nominated.has(id))) return run
  const witch = aiGoodWitch(run)
  if (witch) return cancelMurder(run, witch)

  const leaders = leadingTargets(tally)
  const byDraw = leaders.length > 1
  const originalTargetId = byDraw
    ? seededPick(mulberry32(run.publicSeed ^ Math.imul(run.day, 1229)), leaders.sort())
    : (leaders[0] ?? null)
  return resolveNightTarget(run, originalTargetId, byDraw, power)
}

function resolveNightTarget(
  run: Run,
  originalTargetId: string | null,
  byDraw: boolean,
  power?: NightPower,
  sealedBallot?: NonNullable<Run['private']['pendingNight']>['sealedBallot']
): Run {
  let prepared = spendAiNightRoles(run)
  let targetId = originalTargetId
  let castleEffect: NonNullable<Run['private']['pendingNight']>['castleEffect']
  const illusionist = power === 'illusionist' ? run.humanId : aiNightPower(run, 'illusionist')
  if (originalTargetId && illusionist) {
    const candidates = run.seats.filter(({ id, exit }) => !exit && id !== originalTargetId)
    const spent = candidates.length
      ? spendCastleRole(prepared, illusionist, { roleId: 'illusionist' })
      : prepared
    if (spent !== prepared) {
      const random = mulberry32(
        (run.private.recruitmentSeed ?? hashId(run.id)) ^ Math.imul(run.day, 16217)
      )
      targetId = seededPick(random, candidates).id
      prepared = spent
      castleEffect = { kind: 'illusionist', originalTargetId }
    }
  }
  const protectedTarget = Boolean(
    targetId &&
    (targetId === run.immunityId ||
      hasNightShield(prepared, targetId) ||
      activeDoctorWard(prepared, targetId) ||
      isConcealedSecretBetrayer(prepared, targetId))
  )
  if (
    targetId &&
    !castleEffect &&
    !protectedTarget &&
    eligibleCastleRole(prepared, targetId, 'cursed')
  )
    castleEffect = { kind: 'cursed' }
  return {
    ...prepared,
    revision: run.revision + 1,
    phase: 'night-resolved',
    private: {
      ...prepared.private,
      pendingNight: {
        targetId,
        blocked: protectedTarget || castleEffect?.kind === 'cursed',
        byDraw,
        ...(sealedBallot && { sealedBallot }),
        ...(castleEffect && { castleEffect }),
      },
    },
  }
}

function discussShields(run: Run): ShieldBriefing[] {
  const candidates = new Set(
    run.seats.filter(({ id, exit }) => !exit && id !== run.immunityId).map(({ id }) => id)
  )
  return run.seats.flatMap(({ id: speakerId }) => {
    if (speakerId === run.humanId || !mayAttendConclave(run, speakerId)) return []
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
  briefing: readonly ShieldBriefing[],
  pitchId?: string
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
  const danger =
    pitchId &&
    run.lastTable?.witnesses?.some(
      ({ speakerId, targetId }) =>
        pitchId === speakerId &&
        (targetId === actorId ||
          perspective.teammates.includes(targetId) ||
          targetId === perspective.revealedBetrayer)
    )
  const trust = rapport(run.social, actorId, run.humanId)
  const nightPitch =
    run.dayFlow && pitchId
      ? { id: pitchId, weight: 0.04 + trust * 0.2 + (danger ? 0.16 : 0) }
      : undefined
  return chooseTarget({ ...perspective, shieldReads, nightPitch }, 'night')
}

function nominate(run: Run, briefing: readonly ShieldBriefing[], humanTargetId?: string): Ballot[] {
  return run.seats.flatMap(({ id: voterId }) => {
    const eligibleIds = nightTargets(run, voterId)
    if (!eligibleIds.length) return []
    const targetId =
      voterId === run.humanId && humanTargetId && eligibleIds.includes(humanTargetId)
        ? humanTargetId
        : chooseNominee(run, voterId, eligibleIds, briefing, humanTargetId)
    return targetId ? [{ voterId, targetId }] : []
  })
}

function caseFor(run: Run, voterId: string, targetId: string) {
  const ownConversations = getSocialView(run, voterId)
  const read = nightShieldReads(run, voterId).get(targetId)
  const againstUs = new Set([voterId, ...knownTeammateIds(run, voterId)])
  const namedUs = run.lastTable?.witnesses?.some(
    ({ speakerId, targetId: accused }) =>
      speakerId === targetId &&
      (againstUs.has(accused) ||
        run.seats.some(({ id, exit }) => id === accused && exit?.revealedRole === 'betrayer'))
  )
  if (namedUs)
    return read?.protected
      ? 'They testified against one of us. We could stop them speaking again, if their shield story is a bluff.'
      : 'They testified against one of us. What will they bring to the next Table if they are still here?'
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
    return 'They started building a case at the table. Give them another day and it’ll stick.'
  }
  const castAgainst = run.lastTable?.revealedBallots?.find(
    ({ voterId }) => voterId === targetId
  )?.targetId
  if (castAgainst === voterId)
    return 'They wrote my name tonight. Give them another day and they’ll bring someone with them.'
  if (castAgainst && knownTeammateIds(run, voterId).includes(castAgainst))
    return 'They came for one of us tonight. They’ll try again tomorrow.'
  if (rapport(ownConversations, voterId, targetId) > 0.12) {
    return 'They trust me. By breakfast people will be looking in a different direction.'
  }
  if ((run.lastTable?.tally[targetId] ?? 0) > 0) {
    return 'People are already voting for them. Their seat goes empty and the whole table has to rethink.'
  }
  if (ownConversations.some(({ suspectId }) => suspectId === targetId)) {
    return 'Their name keeps coming up in private. Taking them out would throw that conversation off.'
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
  const ward = darkAngelWard(run, actorId)
  return run.seats
    .filter(
      ({ id, exit }) =>
        !exit && id !== actorId && id !== run.immunityId && id !== ward && !known.has(id)
    )
    .map(({ id }) => id)
}

function sealedShortlist(run: Run, secretId: string, nominations: readonly Ballot[]) {
  const ward = darkAngelWard(run, secretId)
  const targets = run.seats.flatMap(({ id, exit }) =>
    !exit && id !== run.immunityId && id !== ward && !run.private.betrayers.includes(id) ? [id] : []
  )
  // Shared nominations narrow the slate. A split Conclave sends an extra reserve name.
  const preferred = [...countVotes(nominations)]
    .sort((a, b) => b[1] - a[1])
    .flatMap(([id]) => (targets.includes(id) ? [id] : []))
  const limit = Math.max(
    2,
    Math.min(4, preferred.length === nominations.length ? preferred.length + 1 : preferred.length)
  )
  const reserve = targets.filter((id) => !preferred.includes(id))
  while (preferred.length < limit && reserve.length) {
    const backup = chooseNominee(run, nominations[0]?.voterId ?? secretId, reserve, [])
    if (!backup) break
    preferred.push(backup)
    reserve.splice(reserve.indexOf(backup), 1)
  }
  return preferred.slice(0, limit)
}

function resolveSealedVote(
  run: Run,
  secretId: string,
  nominations: readonly Ballot[],
  humanTargetId?: string,
  power?: NightPower
) {
  const shortlist = sealedShortlist(run, secretId, nominations)
  if (
    secretId === run.humanId &&
    (humanTargetId ? !shortlist.includes(humanTargetId) : shortlist.length > 0)
  )
    return run
  const targetId =
    (secretId === run.humanId ? humanTargetId : chooseNominee(run, secretId, shortlist, [])) ?? null
  const warded = targetId ? protectDarkAngel(run, [{ voterId: secretId, targetId }]) : run
  if (warded !== run) {
    if (secretId === run.humanId) return { ...warded, revision: run.revision + 1 }
    return resolveSealedVote(warded, secretId, nominations, undefined, power)
  }
  return resolveNightTarget(
    run,
    targetId,
    false,
    power,
    targetId ? { voterId: secretId, targetId, shortlist } : undefined
  )
}

export function getConclaveView(
  run: Run,
  actorId: string | null,
  selectedId?: string
): ConclaveView | null {
  if (
    run.phase !== 'night' ||
    !actorId ||
    !isActiveBetrayer(run, actorId) ||
    requiredRecruiterId(run) ||
    aiGoodWitch(run)
  )
    return null

  if (isConcealedSecretBetrayer(run, actorId)) {
    return {
      sealed: true,
      targetIds: sealedShortlist(run, actorId, nominate(run, discussShields(run))),
      proposals: [],
      discussion: [],
      ...(darkAngelWard(run, actorId) && { nominationBlocked: true }),
    }
  }

  const known = new Set(knownTeammateIds(run, actorId))
  const seats = new Map(run.seats.map((seat) => [seat.id, seat]))
  const vote = run.private.conclaveVote
  const ward = darkAngelWard(run, actorId)
  const targetIds = vote
    ? runoffTargets(vote.nominations).filter((id) => id !== ward)
    : projectedTargets(run, actorId, known)
  if (vote) {
    const unchanged = (id: string) => vote.nominations.find((ballot) => ballot.voterId === id)
    return {
      targetIds,
      proposals: [],
      discussion: [],
      runoff: ballotLine(run, vote.nominations),
      ...(ward && { nominationBlocked: true }),
      ownArgument:
        selectedId === unchanged(actorId)?.targetId ? 'You are keeping your vote.' : undefined,
    }
  }
  const guests = conclaveGuests(run, actorId)
  const participants = run.seats.filter(({ id }) => mayAttendConclave(run, id))
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
        nomineeId: targetId,
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
      ? `I heard two different stories about ${subject} and that shield. I'd keep a second name ready.`
      : read.protected >= read.exposed
        ? read.witnessedGift
          ? `I think ${subject} got a shield earlier. They might have passed it on.`
          : read.firsthand
            ? `${subject} told me they had a shield. Could be a bluff. Do we want to risk it?`
            : `I heard ${subject} might have a shield. It's secondhand. Who else have we got?`
        : read.firsthand
          ? `${subject} says they have no shield. They could be trying to draw us in.`
          : `I heard ${subject} might be open tonight. I can't vouch for it.`
    return [
      {
        speakerId: speakerIdFor(speakerId),
        speakerName: speaker?.name ?? 'Hooded voice',
        portrait: speaker?.portrait,
        aboutId: subjectId,
        argument,
      },
    ]
  })
  const discussion = composeConclaveConversation(proposals, shieldBriefing)
  return {
    targetIds,
    proposals,
    discussion,
    ownArgument,
    shieldBriefing,
    ...(ward && { nominationBlocked: true }),
    ...(eligibleCastleRole(run, actorId, 'alpha-betrayer') && { alphaAvailable: true }),
  }
}

export function getConclaveVerdict(run: Run, actorId: string | null) {
  if (run.phase !== 'night-resolved' || !actorId || !isActiveBetrayer(run, actorId)) return null
  const pending = run.private.pendingNight
  if (isConcealedSecretBetrayer(run, actorId) && !pending?.recruitedId && !pending?.sealedBallot)
    return null
  return pending
    ? {
        targetId:
          pending.castleEffect?.kind === 'illusionist'
            ? pending.castleEffect.originalTargetId
            : pending.targetId,
        byDraw: pending.byDraw,
      }
    : null
}

export function describeConclaveVerdict(run: Run, actorId: string | null) {
  const verdict = getConclaveVerdict(run, actorId)
  if (!verdict) return
  const recruitedId = run.private.pendingNight?.recruitedId
  if (recruitedId === actorId) {
    const [teammateId] = knownTeammateIds(run, actorId)
    const teammate = run.seats.find(({ id }) => id === teammateId)
    return teammate
      ? `You joined the Betrayers. ${teammate.name} is your teammate.`
      : 'You joined the Betrayers.'
  }
  if (recruitedId) {
    const recruit = run.seats.find(({ id }) => id === recruitedId)
    return `${recruit?.name ?? 'A guest'} accepted your invitation to join the Betrayers.`
  }
  if (!verdict.targetId) return 'The Conclave chose no one.'
  const name = run.seats.find(({ id }) => id === verdict.targetId)?.name ?? 'A guest'
  const sealedBallot = run.private.pendingNight?.sealedBallot
  if (sealedBallot)
    return sealedBallot.voterId === actorId
      ? `You chose ${name} from the sealed shortlist.`
      : `${name} was chosen.`
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
  const majority =
    finalBallots &&
    majorityTarget(
      countVotes(finalBallots),
      finalBallots.reduce((sum, { weight }) => sum + (weight ?? 1), 0)
    )
  const decision = verdict.byDraw
    ? `${name} was chosen by draw.`
    : majority === verdict.targetId
      ? `${name} was chosen by majority vote.`
      : `${name} was chosen with the most votes.`
  return [tally, changeLine, decision].filter(Boolean).join(' ')
}

export function resolveConclave(
  run: Run,
  token: CommandToken,
  humanTargetId?: string,
  humanDouble = false
): Run {
  if (run.phase !== 'night' || !isCurrentCommand(run, token)) return run
  if (run.private.departurePower) return run
  if (pendingPaidNightShieldPurchase(run)) return run
  if (nightCastleRoleFor(run, run.humanId)) return run
  return resolveConclaveBallot(run, token, humanTargetId, undefined, humanDouble)
}

function resolveConclaveBallot(
  run: Run,
  token: CommandToken,
  humanTargetId?: string,
  power?: NightPower,
  humanDouble = false
): Run {
  if (requiredRecruiterId(run)) {
    const prepared = spendAiNightRoles(run)
    const recruited = resolveRecruitment(prepared, token, humanTargetId)
    return recruited === prepared ? run : recruited
  }
  const witch = power === 'good-witch' && hasMurderConclave(run) ? run.humanId : aiGoodWitch(run)
  if (witch) {
    const cancelled = cancelMurder(run, witch)
    if (cancelled !== run) return cancelled
  }
  const humanIsBetrayer = mayAttendConclave(run, run.humanId)
  const pending = run.private.conclaveVote
  const briefing = discussShields(run)
  const secretId = activeSecretBetrayer(run)
  if (secretId === run.humanId)
    return resolveSealedVote(run, secretId, nominate(run, briefing), humanTargetId, power)
  if (pending) {
    const targets = runoffTargets(pending.nominations)
    const humanTargets = targets.filter((id) => id !== darkAngelWard(run, run.humanId))
    if (
      humanIsBetrayer &&
      humanTargets.length &&
      (!humanTargetId || !humanTargets.includes(humanTargetId))
    )
      return run
    return resolveConclaveRunoff(run, pending.nominations, targets, briefing, humanTargetId, power)
  }
  if (humanIsBetrayer) {
    const known = new Set(knownTeammateIds(run, run.humanId))
    const targetIds = projectedTargets(run, run.humanId, known)
    if (targetIds.length && (!humanTargetId || !targetIds.includes(humanTargetId))) return run
  }

  // An unknown Betrayer can appear to be a viable target. The private votes move to a backup.
  const proposed = nominate(run, briefing, humanIsBetrayer ? humanTargetId : undefined)
  const warded = protectDarkAngel(run, proposed)
  if (warded !== run && humanTargetId && darkAngelWard(warded, run.humanId) === humanTargetId)
    return { ...warded, revision: run.revision + 1 }
  const preparedBallot = alphaNominations(
    warded,
    warded === run
      ? proposed
      : nominate(warded, briefing, humanIsBetrayer ? humanTargetId : undefined),
    humanDouble
  )
  const { nominations } = preparedBallot
  run = preparedBallot.run
  const tally = tallyNightBallots(run, nominations)
  if (!tally) return run
  if (secretId) return resolveSealedVote(run, secretId, nominations, undefined, power)
  if (
    !nominations.length ||
    majorityTarget(
      tally,
      nominations.reduce((sum, { weight }) => sum + (weight ?? 1), 0)
    )
  ) {
    const resolved = resolveNightBallot(run, nominations, nominations, power)
    return resolved === run
      ? run
      : { ...resolved, private: { ...resolved.private, conclaveVote: { nominations } } }
  }
  if (humanIsBetrayer) {
    const prepared = spendAiNightRoles(run)
    return {
      ...prepared,
      revision: run.revision + 1,
      private: { ...prepared.private, conclaveVote: { nominations } },
    }
  }
  return resolveConclaveRunoff(
    run,
    nominations,
    runoffTargets(nominations),
    briefing,
    undefined,
    power
  )
}

function resolveConclaveRunoff(
  run: Run,
  nominations: Ballot[],
  targets: string[],
  briefing: readonly ShieldBriefing[],
  humanTargetId?: string,
  power?: NightPower
) {
  const tally = countVotes(nominations)
  const random = mulberry32(run.publicSeed ^ Math.imul(run.day, 4261))
  const runoff = nominations.map(({ voterId, targetId }) => {
    const nomination = { voterId, targetId }
    if (voterId === run.humanId && humanTargetId) return { voterId, targetId: humanTargetId }
    const alternatives = targets.filter(
      (id) => id !== targetId && id !== darkAngelWard(run, voterId)
    )
    const preferred = chooseNominee(run, voterId, alternatives, briefing, humanTargetId)
    if (!preferred) return nomination

    // The closer a proposal is to passing, the easier it is to compromise on it.
    const support = tally.get(preferred) ?? 0
    return !targets.includes(nomination.targetId) ||
      random() < 0.2 + support / (nominations.length * 2)
      ? { ...nomination, targetId: preferred }
      : nomination
  })
  const warded = protectDarkAngel(run, runoff)
  if (warded !== run) {
    if (humanTargetId && darkAngelWard(warded, run.humanId) === humanTargetId)
      return { ...warded, revision: run.revision + 1 }
    return resolveConclaveRunoff(warded, nominations, targets, briefing, humanTargetId, power)
  }
  const secretId = activeSecretBetrayer(run)
  if (secretId) {
    const prepared = { ...run, private: { ...run.private, conclaveVote: undefined } }
    return resolveSealedVote(prepared, secretId, runoff, undefined, power)
  }
  const resolved = resolveNightBallot(run, runoff, nominations, power)
  return resolved === run
    ? run
    : { ...resolved, private: { ...resolved.private, conclaveVote: { nominations, runoff } } }
}

export function revealDawn(run: Run, token: CommandToken): Run {
  const night = run.private.pendingNight
  if (
    run.phase !== 'night-resolved' ||
    !isCurrentCommand(run, token) ||
    run.presentation?.length ||
    !night
  )
    return run
  const turned =
    night.castleEffect?.kind === 'cursed' && night.targetId
      ? turnCursedGuest(run, night.targetId)
      : run
  const eliminatedId = night.blocked ? null : night.targetId
  const seats = run.seats.map((seat) =>
    seat.id === eliminatedId ? { ...seat, exit: { cause: 'night' as const, day: run.day } } : seat
  )
  const day = run.day + 1
  const dawn = deliverNightDecision(run, {
    ...turned,
    seats,
    day,
    lastDawn: { day, eliminatedId },
    revision: run.revision + 1,
    phase:
      seats.filter(({ exit }) => !exit).length === FINALE_CAST_SIZE ? 'final-challenge' : 'dawn',
    immunityId: undefined,
    votePlans: undefined,
    private: {
      ...turned.private,
      nightShieldIds: [],
      nightShieldAwardIds: undefined,
      lastShieldSave:
        night.blocked && night.targetId && hasNightShield(run, night.targetId)
          ? { day, id: night.targetId }
          : undefined,
      conclaveVote: undefined,
      pendingNight: undefined,
    },
  })
  return eliminatedId &&
    run.private.betrayers.includes(eliminatedId) &&
    !seats.some(({ id, exit }) => !exit && turned.private.betrayers.includes(id))
    ? settleRun(dawn, 'last-betrayer')
    : unsealSecretBetrayer(eliminatedId ? afterCastleDeparture(run, dawn, eliminatedId) : dawn)
}

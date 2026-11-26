import { hashId, isCurrentCommand } from './run.ts'
import type { CastleAlliance, CommandToken, Run, SocialEntry } from './run.ts'
import { mulberry32, seededPick } from '../store/rng.ts'
import { ALLIANCE_LIMITS } from '../social/reality/allianceIdentity.ts'
import { castleAlliances } from './allianceRecords.ts'
import { addIntelReport, isVoteClaim } from './investigationRecords.ts'
import { hasPersonalAlliance, rapport } from './perception.ts'
import {
  missingSocialResource,
  socialMoveCost,
  socialWalletFor,
  walletAfterSocialMove,
} from './socialResources.ts'

export const GENERAL_SOCIAL_MOVES = [
  'group-chat',
  'lay-low',
  'explore-castle',
  'eavesdrop',
  'found-alliance',
  'consult-alliance',
] as const
export type GeneralSocialMove = (typeof GENERAL_SOCIAL_MOVES)[number]
export type AllianceMoveDetails = { allianceId?: string; subjectId?: string }
type AllianceChange = NonNullable<SocialEntry['allianceChange']>
export const MIN_CHAT_GUESTS = 2
export const MAX_CHAT_GUESTS = 4

export function isGeneralSocialMove(kind: string): kind is GeneralSocialMove {
  return GENERAL_SOCIAL_MOVES.some((move) => move === kind)
}

export function generalSocialOpen(
  run: Pick<Run, 'phase' | 'result' | 'tableCount' | 'runoffIds'>
): boolean {
  return (
    !run.result &&
    !run.tableCount &&
    !run.runoffIds &&
    [
      'dawn',
      'social',
      'immunity',
      'after-immunity',
      'safety',
      'shield-deals',
      'round-table',
      'cocktail',
    ].includes(run.phase)
  )
}

export function alliancePlanningOpen(
  run: Pick<Run, 'phase' | 'result' | 'tableCount' | 'runoffIds'>
): boolean {
  return generalSocialOpen(run) && run.phase !== 'round-table'
}

export function consultableAlliances(
  entries: readonly SocialEntry[],
  actorId: string,
  activeIds: readonly string[]
) {
  const groups = castleAlliances(entries)
    .filter(({ memberIds }) => memberIds.includes(actorId))
    .map((group) => ({
      ...group,
      memberIds: group.memberIds.filter((id) => activeIds.includes(id)),
    }))
    .filter(({ memberIds }) => memberIds.length >= 2)
  return [
    ...groups,
    ...activeIds
      .filter((id) => hasPersonalAlliance(entries, actorId, id))
      .map((id) => ({ id: `pact:${id}`, name: '', memberIds: [actorId, id], leaderId: actorId })),
  ]
}

function inviteDeclined(run: Run, memberIds: string[], guest: string, host: string) {
  const trustHost = rapport(run.social, guest, host)
  const peers = memberIds.filter((member) => member !== host && member !== guest)
  const likesGroup = peers.length
    ? peers.reduce((sum, peer) => sum + rapport(run.social, guest, peer), 0) / peers.length
    : 0
  const votedAgainstGroup =
    run.lastTable?.blind === false &&
    run.lastTable.revealedBallots?.some(
      ({ voterId, targetId }) => voterId === guest && memberIds.includes(targetId)
    )
  return trustHost < 0.12 || (votedAgainstGroup && trustHost + likesGroup * 0.25 < 0.24)
}

function overAllianceLimit(groups: readonly CastleAlliance[], id: string) {
  return (
    groups.filter(({ memberIds }) => memberIds.includes(id)).length >=
    ALLIANCE_LIMITS.groupsPerMember
  )
}

function foundAlliance(run: Run, guestIds: readonly string[]): SocialEntry | undefined {
  const actorId = run.humanId
  const memberIds = [actorId, ...guestIds]
  const groups = castleAlliances(run.social)
  if (
    overAllianceLimit(groups, actorId) ||
    groups.some(
      (group) =>
        group.memberIds.length === memberIds.length &&
        memberIds.every((id) => group.memberIds.includes(id))
    )
  )
    return
  const declinedIds = guestIds.filter(
    (id) => overAllianceLimit(groups, id) || inviteDeclined(run, memberIds, id, actorId)
  )
  const name = run.seats.find(({ id }) => id === actorId)?.name ?? 'Castle'
  return {
    day: run.day,
    actorId,
    recipientId: actorId,
    kind: 'found-alliance',
    alliance: {
      id: `castle-alliance:${run.revision}`,
      name: `${name}'s alliance`,
      leaderId: actorId,
      memberIds,
    },
    accepted: declinedIds.length === 0,
    declinedIds,
  }
}

export function applyCastleAllianceChange(
  run: Run,
  token: CommandToken,
  allianceId: string,
  change: AllianceChange,
  value?: string
): Run {
  if (!isCurrentCommand(run, token) || !alliancePlanningOpen(run) || introvertDay(run, run.humanId))
    return run
  const actorId = run.humanId
  const active = new Set(run.seats.filter(({ exit }) => !exit).map(({ id }) => id))
  const groups = castleAlliances(run.social)
  const group = groups.find(({ id, memberIds }) => id === allianceId && memberIds.includes(actorId))
  if (
    !active.has(actorId) ||
    !group ||
    (change !== 'leave' && change !== 'invite' && group.leaderId !== actorId)
  )
    return run
  const alliance = { ...group, memberIds: group.memberIds.filter((id) => active.has(id)) }
  const entry: SocialEntry = {
    day: run.day,
    actorId,
    recipientId: actorId,
    kind: 'alliance-update',
    alliance,
    allianceChange: change,
    accepted: true,
  }
  switch (change) {
    case 'invite': {
      if (
        !value ||
        !active.has(value) ||
        alliance.memberIds.includes(value) ||
        alliance.memberIds.length >= ALLIANCE_LIMITS.groupMembers ||
        run.social.some(
          (note) =>
            note.day === run.day &&
            note.alliance?.id === allianceId &&
            note.allianceChange === 'invite' &&
            note.suspectId === value
        )
      )
        return run
      const supporters = alliance.memberIds.filter(
        (id) => id === actorId || rapport(run.social, id, value) >= 0.12
      )
      entry.suspectId = value
      entry.accepted =
        !overAllianceLimit(groups, value) &&
        supporters.length > alliance.memberIds.length / 2 &&
        !inviteDeclined(run, alliance.memberIds, value, actorId)
      if (entry.accepted) alliance.memberIds.push(value)
      break
    }
    case 'leave':
    case 'remove': {
      const departed = change === 'leave' ? actorId : value
      if (
        !departed ||
        !alliance.memberIds.includes(departed) ||
        (change === 'remove' && departed === actorId)
      )
        return run
      entry.recipientId = departed
      alliance.memberIds = alliance.memberIds.filter((id) => id !== departed)
      if (alliance.leaderId === departed) alliance.leaderId = alliance.memberIds[0] ?? actorId
      alliance.closed = alliance.memberIds.length < 2
      break
    }
    case 'rename': {
      const name = value?.trim()
      if (!name || name.length > 32 || name === alliance.name) return run
      alliance.name = name
      break
    }
    case 'dissolve':
      alliance.closed = true
      break
    default:
      return run
  }
  return { ...run, revision: run.revision + 1, social: [...run.social, entry] }
}

export function applyGeneralSocialMove(
  run: Run,
  token: CommandToken,
  kind: GeneralSocialMove,
  guestIds: readonly string[] = [],
  details: AllianceMoveDetails = {}
): Run {
  if (
    !isGeneralSocialMove(kind) ||
    !isCurrentCommand(run, token) ||
    !generalSocialOpen(run) ||
    introvertDay(run, run.humanId)
  )
    return run
  if (kind !== 'lay-low' && !alliancePlanningOpen(run)) return run
  const actorId = run.humanId
  const active = new Set(run.seats.filter(({ exit }) => !exit).map(({ id }) => id))
  if (
    !active.has(actorId) ||
    run.social.some(
      (entry) => entry.day === run.day && entry.actorId === actorId && entry.kind === kind
    )
  )
    return run
  if (kind === 'group-chat' || kind === 'found-alliance') {
    if (
      guestIds.length < MIN_CHAT_GUESTS ||
      guestIds.length >
        (kind === 'group-chat' ? MAX_CHAT_GUESTS : ALLIANCE_LIMITS.groupMembers - 1) ||
      new Set(guestIds).size !== guestIds.length ||
      guestIds.some((id) => id === actorId || !active.has(id))
    )
      return run
  } else if (guestIds.length) return run

  const cost = socialMoveCost(kind, run.options.realityMode, guestIds.length)
  if (missingSocialResource(socialWalletFor(run, actorId), cost)) return run
  let investigation = run.investigation
  let entries: SocialEntry[] = (kind === 'group-chat' ? guestIds : [actorId]).map(
    (recipientId) => ({
      day: run.day,
      actorId,
      recipientId,
      kind,
    })
  )
  if (kind === 'found-alliance') {
    const invitation = foundAlliance(run, guestIds)
    if (!invitation) return run
    entries = [invitation]
  }
  if (kind === 'consult-alliance') {
    const group = consultableAlliances(run.social, actorId, [...active]).find(
      (candidate) => candidate.id === details.allianceId
    )
    const subjectId = details.subjectId
    if (!group || !subjectId || !active.has(subjectId) || group.memberIds.includes(subjectId))
      return run
    entries = group.memberIds
      .filter((id) => id !== actorId)
      .map((recipientId) => ({
        day: run.day,
        actorId,
        recipientId,
        kind,
        suspectId: subjectId,
        reaction:
          !hasPersonalAlliance(run.social, actorId, recipientId) &&
          rapport(run.social, recipientId, actorId) < 0.18
            ? 'held-back'
            : rapport(run.social, recipientId, subjectId) >= 0.24
              ? 'trusts'
              : run.lastTable?.blind === false && (run.lastTable.tally[subjectId] ?? 0) >= 2
                ? 'wary'
                : 'uncertain',
      }))
  }
  if (kind === 'explore-castle' && run.lastTable?.blind === false) {
    entries[0].suspectId = Object.entries(run.lastTable.tally)
      .filter(([id, votes]) => id !== actorId && active.has(id) && votes > 0)
      .sort(([a, first], [b, second]) => second - first || a.localeCompare(b))[0]?.[0]
  }
  if (kind === 'eavesdrop') {
    const conversations =
      investigation?.incidents.filter(({ fact }) => fact.day === run.day && isVoteClaim(fact)) ?? []
    const candidates = run.social.filter(
      ({ kind, day, actorId: speaker, recipientId, suspectId, accepted }) =>
        day === run.day &&
        speaker !== actorId &&
        recipientId !== actorId &&
        active.has(speaker) &&
        active.has(recipientId) &&
        suspectId &&
        active.has(suspectId) &&
        (kind === 'question' || (kind === 'vote-plan' && accepted) || kind === 'share-suspicion')
    )
    const random = mulberry32(run.publicSeed ^ Math.imul(run.day, 829) ^ hashId(actorId))
    if (random() < 0.8) {
      const overheard = conversations.length ? seededPick(random, conversations) : undefined
      if (overheard && investigation) {
        const {
          guestId,
          id,
          fact: { day, behavior, room, topicId },
        } = overheard
        investigation = addIntelReport(investigation, {
          day,
          guestId,
          method: 'eavesdrop',
          access: 'observed',
          incidentId: id,
          claim: { day, behavior, room, topicId },
        })
        entries[0].suspectId = topicId
      } else if (candidates.length) entries[0].suspectId = seededPick(random, candidates).suspectId
    }
    entries[0].reaction = entries[0].suspectId ? 'landed' : 'held-back'
  }
  return {
    ...run,
    investigation,
    revision: run.revision + 1,
    social: [...run.social, ...entries],
    socialWallets: walletAfterSocialMove(run, entries[0], cost, guestIds.length),
  }
}
import { introvertDay } from './castleRoles.ts'

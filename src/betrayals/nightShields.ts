import { getSocialPersonality } from '../social/socialPersonalityBank.ts'
import { mulberry32 } from '../store/rng.ts'
import { getSocialView, rapport } from './perception.ts'
import { hashId, NIGHT_SHIELD_MOVES, publicNightShieldWinners } from './run.ts'
import type { NightShieldClaim, Run, SocialEntry } from './run.ts'

type ShieldWindow = Pick<Run, 'phase' | 'tableCount' | 'runoffIds' | 'result'> &
  Partial<Pick<Run, 'private'>>

export function nightShieldWindowOpen(run: ShieldWindow): boolean {
  return (
    (run.phase === 'shield-deals' ||
      (run.phase === 'round-table' && !run.private?.safetyStandings?.dealsClosed)) &&
    !run.result &&
    !run.tableCount &&
    !run.runoffIds &&
    Boolean(run.private?.nightShieldIds.length)
  )
}

export function isNightShieldMove(kind: SocialEntry['kind']) {
  return NIGHT_SHIELD_MOVES.some((move) => move === kind)
}

export function gaveNightShieldToday(
  entries: readonly SocialEntry[],
  giverId: string,
  recipientId: string,
  day: number
): boolean {
  return entries.some(
    (entry) =>
      entry.kind === 'shield-gift' &&
      entry.day === day &&
      entry.actorId === giverId &&
      entry.recipientId === recipientId
  )
}

export function canAskPlayerForNightShield(run: Run, guestId: string): boolean {
  return (
    guestId !== run.humanId &&
    guestId !== run.immunityId &&
    !run.private.nightShieldIds.includes(guestId) &&
    !gaveNightShieldToday(run.social, guestId, run.humanId, run.day)
  )
}

export function shieldTalkBlockedAfterGift(
  entries: readonly SocialEntry[],
  move: Pick<SocialEntry, 'actorId' | 'recipientId' | 'kind'>,
  day: number
): boolean {
  return (
    (move.kind === 'shield-claim' || move.kind === 'shield-deny' || move.kind === 'ask-shield') &&
    gaveNightShieldToday(entries, move.actorId, move.recipientId, day)
  )
}

type ShieldReport = { claim: NightShieldClaim; witnessedGift: boolean; changedStory: boolean }

function directClaim(entry: SocialEntry, listenerId: string) {
  if (entry.recipientId === listenerId) {
    if (entry.kind === 'shield-claim') return { id: entry.actorId, claim: 'has' as const }
    if (entry.kind === 'shield-deny') return { id: entry.actorId, claim: 'none' as const }
  }
  if (entry.kind === 'ask-shield' && entry.actorId === listenerId) {
    const { shieldReply: claim } = entry
    if (claim === 'has' || claim === 'none') return { id: entry.recipientId, claim }
  }
}

/** A handoff is evidence of possession at that moment. It can't rule out another handoff. */
export function firsthandShieldReports(
  entries: readonly SocialEntry[],
  listenerId: string,
  day: number
): Map<string, ShieldReport> {
  const reports = new Map<string, ShieldReport>()
  for (const entry of entries) {
    if (entry.day !== day) continue
    if (entry.kind === 'shield-gift') {
      if (entry.actorId === listenerId) {
        reports.set(entry.recipientId, { claim: 'has', witnessedGift: true, changedStory: false })
      } else if (entry.recipientId === listenerId) {
        // They handed over one shield. Their remaining shield count is unknown.
        reports.delete(entry.actorId)
      }
      continue
    }
    const statement = directClaim(entry, listenerId)
    if (!statement) continue
    const prior = reports.get(statement.id)
    reports.set(statement.id, {
      claim: statement.claim,
      witnessedGift: prior?.witnessedGift ?? false,
      changedStory: Boolean(prior && (prior.changedStory || prior.claim !== statement.claim)),
    })
  }
  return reports
}

export function reactionToShieldClaim(run: Run, entry: SocialEntry): SocialEntry['reaction'] {
  const listener = entry.kind === 'ask-shield' ? entry.actorId : entry.recipientId
  if (listener === run.humanId) return
  const statement = directClaim(entry, listener)
  if (!statement) return
  const prior = firsthandShieldReports(run.social, listener, run.day).get(statement.id)
  if (prior && prior.claim !== statement.claim) {
    return prior.witnessedGift ? 'uncertain' : 'backfired'
  }
  return rapport(run.social, listener, statement.id) >= 0.16 ? 'landed' : 'uncertain'
}

export function reactionToShieldGift(run: Run, entry: SocialEntry): SocialEntry['reaction'] {
  const heard = firsthandShieldReports(run.social, entry.recipientId, run.day).get(entry.actorId)
  if (heard?.claim !== 'none') return
  const trust = rapport(run.social, entry.recipientId, entry.actorId)
  const forgiveness = getSocialPersonality(entry.recipientId).forgiveness
  // A gift proves they had it at the handoff. They could have picked it up after speaking.
  const benefitOfDoubt = 0.2 + trust * 0.75 + forgiveness * 0.18
  return shieldRoll(run, `${entry.actorId}:${entry.recipientId}`, 9201) < benefitOfDoubt
    ? 'uncertain'
    : 'backfired'
}

export type ShieldRead = {
  protected: number
  exposed: number
  conflicting: boolean
  witnessedGift: boolean
  firsthand: boolean
  publicAwardOnly?: boolean
}

export function nightShieldReads(run: Run, observerId: string): Map<string, ShieldRead> {
  const notes = getSocialView(run, observerId).filter(({ day }) => day === run.day)
  const reads = new Map<string, ShieldRead>()
  for (const [id, report] of firsthandShieldReports(notes, observerId, run.day)) {
    const trust = rapport(run.social, observerId, id)
    const claimWeight = (0.26 + trust * 0.73) * (report.changedStory ? 0.4 : 1)
    reads.set(id, {
      protected: report.witnessedGift
        ? report.changedStory
          ? 0.42
          : 0.74
        : report.claim === 'has'
          ? claimWeight
          : 0,
      exposed: report.claim === 'none' ? claimWeight : 0,
      conflicting: report.changedStory,
      witnessedGift: report.witnessedGift,
      firsthand: true,
    })
  }

  const tips = new Map<string, Map<string, { claim: NightShieldClaim; doubtful: boolean }>>()
  for (const { kind, actorId, recipientId, suspectId, shieldReply, reaction } of notes) {
    if (
      kind !== 'shield-tip' ||
      recipientId !== observerId ||
      !suspectId ||
      (shieldReply !== 'has' && shieldReply !== 'none')
    )
      continue
    const from = tips.get(suspectId) ?? new Map()
    from.set(actorId, { claim: shieldReply, doubtful: reaction === 'uncertain' })
    tips.set(suspectId, from)
  }
  for (const [id, from] of tips) {
    const read = reads.get(id) ?? {
      protected: 0,
      exposed: 0,
      conflicting: false,
      witnessedGift: false,
      firsthand: false,
    }
    for (const [source, { claim, doubtful }] of from) {
      const weight = (0.1 + rapport(run.social, observerId, source) * 0.32) * (doubtful ? 0.55 : 1)
      // Several retellings could all come from the same conversation.
      if (claim === 'has') read.protected = Math.max(read.protected, weight)
      else read.exposed = Math.max(read.exposed, weight)
    }
    read.conflicting ||= read.protected > 0 && read.exposed > 0
    reads.set(id, read)
  }
  const vision = castleRoleFor(run, observerId)?.used
  const observedAwards =
    vision?.roleId === 'clairvoyant' && vision.day === run.day ? vision.shieldIds : []
  for (const id of new Set([...publicNightShieldWinners(run), ...observedAwards])) {
    if (id === observerId || reads.has(id)) continue
    // Everyone saw the award. Only the recipient could have seen this private handoff.
    reads.set(id, {
      protected: gaveNightShieldToday(notes, id, observerId, run.day) ? 0.16 : 0.58,
      exposed: 0,
      conflicting: false,
      witnessedGift: false,
      firsthand: false,
      publicAwardOnly: true,
    })
  }
  return reads
}

export function shieldRoll(run: Run, id: string, salt: number) {
  return mulberry32(run.publicSeed ^ Math.imul(run.day, 7349) ^ hashId(id) ^ salt)()
}

/** Estimate Night danger from public conduct, with room for rivals to take an easy shot. */
export function nightExposure(run: Run, id: string) {
  const spokeUp = run.lastTable?.campaigns?.some(
    ({ speakerId, stance }) => speakerId === id && !stance
  )
  const drewVotes = Math.min(0.3, (run.lastTable?.tally[id] ?? 0) * 0.06)
  return 0.42 + (spokeUp ? 0.32 : 0) - drewVotes
}

export function shieldReplyFor(
  run: Run,
  guestId: string,
  askerId: string
): SocialEntry['shieldReply'] {
  const personality = getSocialPersonality(guestId)
  const trust = rapport(run.social, guestId, askerId)
  const hasShield = run.private.nightShieldIds.includes(guestId)
  const roll = shieldRoll(run, `${guestId}:${askerId}`, 8241)
  const truthChance = Math.min(0.97, 0.12 + personality.warmth * 0.16 + trust * 0.92)
  if (roll < truthChance) {
    return hasShield ? 'has' : 'none'
  }
  const bluffRoll = shieldRoll(run, `${guestId}:${askerId}`, 8242)
  if (hasShield && bluffRoll < personality.deceptionComfort * 0.55) return 'none'
  const motive = run.private.betrayers.includes(guestId)
    ? 0.22 + personality.strategicCalculation * 0.25
    : 0.28 + nightExposure(run, guestId) * 0.55
  if (
    !hasShield &&
    guestId !== run.immunityId &&
    bluffRoll < personality.deceptionComfort * motive
  ) {
    return 'has'
  }
  return 'private'
}
import { castleRoleFor } from './castleRoles.ts'

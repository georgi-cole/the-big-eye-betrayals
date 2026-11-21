import {
  CAST_SIZE,
  INCOMING_ANSWERS,
  MAX_TABLE_ROUNDS,
  NIGHT_SHIELD_MOVES,
  PHASES,
  PRESENTATION_CUES,
  RULES_VERSION,
} from './run.ts'
import type { Run, Seat } from './run.ts'
import { initializeSocialWallets } from './socialResources.ts'

const SAVE_PREFIX = 'big-eye:betrayals:season:'

type StorageAdapter = Pick<Storage, 'getItem' | 'setItem'>
type Restore = { status: 'ready'; run: Run } | { status: 'empty' | 'incompatible' | 'unavailable' }

function asObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function validSeat(seat: unknown): seat is Seat {
  const item = asObject(seat)
  if (!item || typeof item.id !== 'string' || !item.id || typeof item.name !== 'string') {
    return false
  }
  if (item.portrait !== undefined && typeof item.portrait !== 'string') return false
  if (item.exit === undefined) return true
  const exit = asObject(item.exit)
  return Boolean(
    exit &&
    (exit.cause === 'banished' || exit.cause === 'night') &&
    typeof exit.day === 'number' &&
    Number.isSafeInteger(exit.day) &&
    exit.day > 0 &&
    (exit.revealedRole === undefined ||
      exit.revealedRole === 'loyal' ||
      exit.revealedRole === 'betrayer') &&
    (exit.cause !== 'night' || exit.revealedRole === undefined)
  )
}

function validIds(
  value: unknown,
  seats: Set<string>,
  min: number,
  max: number,
  distinct = true
): boolean {
  return (
    Array.isArray(value) &&
    value.length >= min &&
    value.length <= max &&
    (!distinct || new Set(value).size === value.length) &&
    value.every((id) => typeof id === 'string' && seats.has(id))
  )
}

function validTableRound(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_TABLE_ROUNDS
  )
}

function validTableCount(value: unknown, ids: Set<string>): boolean {
  if (value === undefined) return true
  const count = asObject(value)
  if (
    !count ||
    !validTableRound(count.round) ||
    !validIds(count.tiedIds, ids, 0, CAST_SIZE) ||
    !Array.isArray(count.ballots) ||
    count.ballots.length === 0
  ) {
    return false
  }
  const voters = new Set<string>()
  for (const value of count.ballots) {
    const ballot = asObject(value)
    if (
      !ballot ||
      typeof ballot.voterId !== 'string' ||
      typeof ballot.targetId !== 'string' ||
      !ids.has(ballot.voterId) ||
      !ids.has(ballot.targetId) ||
      voters.has(ballot.voterId) ||
      ballot.voterId === ballot.targetId
    ) {
      return false
    }
    voters.add(ballot.voterId)
  }
  return true
}

function validSafetyStandings(value: unknown, ids: Set<string>, day: number): boolean {
  if (value === undefined) return true
  const standings = asObject(value)
  if (
    !standings ||
    typeof standings.day !== 'number' ||
    !Number.isSafeInteger(standings.day) ||
    standings.day < 1 ||
    standings.day > day ||
    !Array.isArray(standings.rows)
  ) {
    return false
  }
  const rowIds = []
  for (const value of standings.rows) {
    const row = asObject(value)
    if (
      !row ||
      typeof row.score !== 'number' ||
      !Number.isFinite(row.score) ||
      (row.forfeited !== undefined && typeof row.forfeited !== 'boolean')
    ) {
      return false
    }
    rowIds.push(row.contestantId)
  }
  return validIds(rowIds, ids, 1, CAST_SIZE)
}

function validIncomingResponses(value: unknown, day: number): boolean {
  if (value === undefined) return true
  const responses = asObject(value)
  return Boolean(
    responses &&
    Object.entries(responses).every(([id, answer]) => {
      const match =
        /^([1-9]\d*):(social:[12]|round-table:1|shield-question|shield-note:[1-9]\d*)$/.exec(id)
      return match && Number(match[1]) <= day && INCOMING_ANSWERS.some((valid) => answer === valid)
    })
  )
}

function validShieldConversations(entries: unknown[], ids: Set<string>, day: number) {
  return entries.every((value) => {
    const entry = asObject(value)
    if (entry?.kind === 'found-alliance' || entry?.kind === 'alliance-update') {
      const group = asObject(entry.alliance)
      return Boolean(
        group &&
        typeof group.id === 'string' &&
        group.id &&
        typeof group.name === 'string' &&
        group.name &&
        typeof group.leaderId === 'string' &&
        ids.has(group.leaderId) &&
        validIds(group.memberIds, ids, group.closed === true ? 0 : 2, 6) &&
        (group.closed === undefined || typeof group.closed === 'boolean') &&
        typeof entry.accepted === 'boolean' &&
        typeof entry.day === 'number' &&
        Number.isSafeInteger(entry.day) &&
        entry.day >= 1 &&
        entry.day <= day &&
        typeof entry.actorId === 'string' &&
        ids.has(entry.actorId) &&
        typeof entry.recipientId === 'string' &&
        ids.has(entry.recipientId) &&
        (entry.declinedIds === undefined || validIds(entry.declinedIds, ids, 0, 5))
      )
    }
    if (!entry || !NIGHT_SHIELD_MOVES.some((kind) => kind === entry.kind)) return true
    if (
      typeof entry.day !== 'number' ||
      !Number.isSafeInteger(entry.day) ||
      entry.day < 1 ||
      entry.day > day ||
      !validIds([entry.actorId, entry.recipientId], ids, 2, 2)
    )
      return false
    if (entry.kind === 'shield-tip') {
      return (
        validIds([entry.actorId, entry.recipientId, entry.suspectId], ids, 3, 3) &&
        (entry.shieldReply === 'has' || entry.shieldReply === 'none')
      )
    }
    if (entry.kind === 'ask-shield') {
      return (
        entry.shieldReply === 'has' ||
        entry.shieldReply === 'none' ||
        entry.shieldReply === 'private'
      )
    }
    return entry.shieldReply === undefined && entry.suspectId === undefined
  })
}

function validSocialWallets(value: unknown, ids: Set<string>, day: number): boolean {
  if (value === undefined) return true
  const wallets = asObject(value)
  if (!wallets) return false
  return Object.entries(wallets).every(([id, value]) => {
    const wallet = asObject(value)
    return (
      ids.has(id) &&
      wallet &&
      typeof wallet.day === 'number' &&
      Number.isSafeInteger(wallet.day) &&
      wallet.day >= 1 &&
      wallet.day <= day &&
      ['energy', 'influence', 'info', 'energySpent'].every((key) => {
        const balance = wallet[key]
        return typeof balance === 'number' && Number.isSafeInteger(balance) && balance >= 0
      })
    )
  })
}

function validWitnessLead(value: unknown, ids: Set<string>, day: number): boolean {
  if (value === undefined) return true
  const lead = asObject(value)
  return Boolean(
    lead &&
    typeof lead.day === 'number' &&
    Number.isSafeInteger(lead.day) &&
    lead.day >= 1 &&
    lead.day <= day &&
    validIds(
      [lead.suspectId, lead.pitchId, lead.sourceId, lead.witnessId, lead.relayId],
      ids,
      5,
      5
    ) &&
    (lead.promised === undefined || lead.promised === true)
  )
}

function validTableArguments(value: unknown, ids: Set<string>): boolean {
  if (value === undefined) return true
  if (!Array.isArray(value) || value.length > 5) return false
  const speakers = new Set<string>()
  return value.every((entry: unknown) => {
    const argument = asObject(entry)
    if (
      !argument ||
      typeof argument.speakerId !== 'string' ||
      speakers.has(argument.speakerId) ||
      !validIds([argument.speakerId, argument.targetId], ids, 2, 2) ||
      (argument.tone !== 'careful' && argument.tone !== 'forceful') ||
      (argument.stance !== undefined &&
        argument.stance !== 'question' &&
        argument.stance !== 'defend') ||
      (argument.basis !== 'impression' &&
        argument.basis !== 'conversation' &&
        argument.basis !== 'record') ||
      (argument.evidence !== undefined &&
        argument.evidence !== 'call-witness' &&
        argument.evidence !== 'name-source')
    )
      return false
    speakers.add(argument.speakerId)
    return true
  })
}

function validCaseReviews(value: unknown, ids: Set<string>, day: number): boolean {
  if (value === undefined) return true
  return (
    Array.isArray(value) &&
    value.length <= 25 &&
    value.every((entry: unknown) => {
      const review = asObject(entry)
      return (
        review &&
        typeof review.day === 'number' &&
        Number.isSafeInteger(review.day) &&
        review.day >= 1 &&
        review.day <= day &&
        validIds([review.speakerId, review.targetId], ids, 2, 2) &&
        (review.result === 'caught' || review.result === 'missed')
      )
    })
  )
}

function isRun(value: unknown): value is Run {
  const item = asObject(value)
  if (!item || item.edition !== 'betrayals' || item.version !== RULES_VERSION) return false
  if (
    typeof item.id !== 'string' ||
    !item.id ||
    typeof item.revision !== 'number' ||
    !Number.isSafeInteger(item.revision) ||
    item.revision < 0 ||
    typeof item.day !== 'number' ||
    !Number.isSafeInteger(item.day) ||
    item.day < 1 ||
    !PHASES.some((phase) => phase === item.phase) ||
    !Number.isSafeInteger(item.publicSeed) ||
    typeof item.pot !== 'number' ||
    !Number.isSafeInteger(item.pot) ||
    item.pot < 0 ||
    !Array.isArray(item.social) ||
    !Array.isArray(item.seats) ||
    item.seats.length !== CAST_SIZE ||
    !item.seats.every(validSeat)
  ) {
    return false
  }

  const ids = new Set(item.seats.map(({ id }) => id))
  const options = asObject(item.options)
  const hidden = asObject(item.private)
  const shield = asObject(item.publicShield)
  const pendingTable = asObject(hidden?.pendingTable)
  const pendingNight = asObject(hidden?.pendingNight)
  const lastShieldSave = asObject(hidden?.lastShieldSave)
  const lastTable = asObject(item.lastTable)
  const sway = asObject(item.tableSway)
  return Boolean(
    ids.size === CAST_SIZE &&
    typeof item.humanId === 'string' &&
    ids.has(item.humanId) &&
    options &&
    typeof options.publicMode === 'boolean' &&
    ['off', 'casual', 'tv', 'adult'].some((preset) => preset === options.realityMode) &&
    hidden &&
    validIds(hidden.betrayers, ids, 3, 4) &&
    (hidden.hiddenBetrayerIds === undefined ||
      validIds(hidden.hiddenBetrayerIds, new Set(hidden.betrayers as string[]), 0, 4)) &&
    validIds(hidden.nightShieldIds, ids, 0, 2, false) &&
    (hidden.nightShieldAwardIds === undefined || validIds(hidden.nightShieldAwardIds, ids, 1, 2)) &&
    (hidden.lastShieldSave === undefined ||
      (lastShieldSave &&
        typeof lastShieldSave.id === 'string' &&
        ids.has(lastShieldSave.id) &&
        typeof lastShieldSave.day === 'number' &&
        Number.isSafeInteger(lastShieldSave.day) &&
        lastShieldSave.day >= 2 &&
        lastShieldSave.day <= item.day)) &&
    validShieldConversations(item.social, ids, item.day) &&
    (item.runoffIds === undefined || validIds(item.runoffIds, ids, 2, CAST_SIZE)) &&
    (item.tableRound === undefined || validTableRound(item.tableRound)) &&
    validTableCount(item.tableCount, ids) &&
    (lastTable?.revealedBallots === undefined ||
      (Array.isArray(lastTable.revealedBallots) &&
        validTableCount({ round: 1, ballots: lastTable.revealedBallots, tiedIds: [] }, ids))) &&
    validTableArguments(item.tableArguments, ids) &&
    validTableArguments(lastTable?.campaigns, ids) &&
    validCaseReviews(item.caseReviews, ids, item.day) &&
    validWitnessLead(item.witnessLead, ids, item.day) &&
    (item.tableSway == null ||
      (sway &&
        typeof sway.targetId === 'string' &&
        ids.has(sway.targetId) &&
        (sway.tone === 'careful' || sway.tone === 'forceful') &&
        (sway.stance === undefined || sway.stance === 'question' || sway.stance === 'defend') &&
        (sway.evidence === undefined ||
          ((sway.evidence === 'call-witness' || sway.evidence === 'name-source') &&
            asObject(item.witnessLead)?.day === item.day &&
            asObject(item.witnessLead)?.suspectId === sway.targetId &&
            (sway.evidence !== 'call-witness' ||
              asObject(item.witnessLead)?.promised === true))))) &&
    validSafetyStandings(hidden.safetyStandings, ids, item.day) &&
    validIncomingResponses(item.incomingResponses, item.day) &&
    (item.activity === undefined ||
      (Array.isArray(item.activity) &&
        item.activity.every((value) => {
          const entry = asObject(value)
          return (
            entry &&
            typeof entry.day === 'number' &&
            Number.isSafeInteger(entry.day) &&
            entry.day >= 1 &&
            entry.day <= Number(item.day) &&
            typeof entry.text === 'string' &&
            ['season', 'vote', 'departure', 'conversation'].some((kind) => kind === entry.kind)
          )
        }))) &&
    validSocialWallets(item.socialWallets, ids, item.day) &&
    (item.presentation === undefined ||
      (Array.isArray(item.presentation) &&
        item.presentation.length > 0 &&
        item.presentation.length <= 4 &&
        item.presentation.every((cue) => PRESENTATION_CUES.some((valid) => valid === cue)))) &&
    (item.phase === 'table-reveal'
      ? pendingTable &&
        typeof pendingTable.banishedId === 'string' &&
        ids.has(pendingTable.banishedId) &&
        typeof pendingTable.blind === 'boolean' &&
        typeof pendingTable.tiedByDraw === 'boolean' &&
        asObject(pendingTable.tally)
      : hidden.pendingTable === undefined) &&
    (item.phase === 'night-resolved'
      ? pendingNight &&
        typeof pendingNight.blocked === 'boolean' &&
        (pendingNight.byDraw === undefined || typeof pendingNight.byDraw === 'boolean') &&
        (pendingNight.targetId === null ||
          (typeof pendingNight.targetId === 'string' && ids.has(pendingNight.targetId)))
      : hidden.pendingNight === undefined) &&
    (item.immunityId === undefined ||
      (typeof item.immunityId === 'string' && ids.has(item.immunityId))) &&
    (item.publicShield === undefined ||
      (shield &&
        typeof shield.id === 'string' &&
        ids.has(shield.id) &&
        typeof shield.day === 'number' &&
        Number.isSafeInteger(shield.day) &&
        shield.day >= 1 &&
        shield.day <= item.day))
  )
}

export function saveRun(storage: StorageAdapter, profileId: string, run: Run): void {
  storage.setItem(SAVE_PREFIX + profileId, JSON.stringify(run))
}

export function restoreRun(storage: StorageAdapter, profileId: string): Restore {
  let value: string | null
  try {
    value = storage.getItem(SAVE_PREFIX + profileId)
  } catch {
    return { status: 'unavailable' }
  }
  if (value === null) return { status: 'empty' }
  try {
    const candidate: unknown = JSON.parse(value)
    if (!isRun(candidate)) return { status: 'incompatible' }
    if (candidate.socialWallets) return { status: 'ready', run: candidate }
    return {
      status: 'ready',
      run: {
        ...candidate,
        socialWallets: initializeSocialWallets(
          candidate.seats,
          candidate.day,
          candidate.options.realityMode
        ),
      },
    }
  } catch {
    return { status: 'incompatible' }
  }
}

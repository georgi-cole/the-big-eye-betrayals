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
import { validSeasonCheckpoint, type SeasonRewards } from './seasonRewards.ts'
import { AUDIENCE_EVENTS, AUDIENCE_FORMATS, HOT_SEAT_ANSWERS } from './audienceSeason.ts'
import { CASTLE_PERIODS, CASTLE_SCENES } from './castleLifeBank.ts'
import type { CastleSceneId } from './castleLifeBank.ts'
import { MORNING_MOVES, SAFETY_MOVES, SHIELD_MOVES, VOTE_MOVES } from './dayFlowState.ts'
import { validBetrayalsEconomy } from './economy.ts'
import {
  CASTLE_ROOMS,
  DEMEANORS,
  GUEST_READS,
  IMPRESSIONS,
  PERSONAL_NOTE_LIMIT,
  PROFILE_TRAITS,
  REPORT_ACCESSES,
  REPORT_METHODS,
  SHARING_MODES,
  SOCIAL_BEHAVIORS,
  TRAIT_READS,
  WATCH_STATUSES,
} from './investigationRecords.ts'

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

function validConclaveVotes(value: unknown, ids: Set<string>, betrayers: ReadonlySet<string>) {
  if (!Array.isArray(value) || value.length > betrayers.size) return false
  const voters = new Set<string>()
  for (const ballot of value) {
    const row = asObject(ballot)
    if (
      !row ||
      typeof row.voterId !== 'string' ||
      !betrayers.has(row.voterId) ||
      voters.has(row.voterId) ||
      typeof row.targetId !== 'string' ||
      !ids.has(row.targetId) ||
      betrayers.has(row.targetId)
    )
      return false
    voters.add(row.voterId)
  }
  return true
}

function validConclaveVote(
  value: unknown,
  phase: unknown,
  ids: Set<string>,
  betrayerIds: string[]
) {
  if (value === undefined) return true
  if (phase !== 'night' && phase !== 'night-resolved') return false
  const vote = asObject(value)
  const betrayers = new Set(betrayerIds)
  return Boolean(
    vote &&
    validConclaveVotes(vote.nominations, ids, betrayers) &&
    (phase === 'night'
      ? vote.runoff === undefined && (vote.nominations as unknown[]).length >= 2
      : vote.runoff === undefined || validConclaveVotes(vote.runoff, ids, betrayers))
  )
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
    (standings.publicResults !== undefined && typeof standings.publicResults !== 'boolean') ||
    (standings.dealsClosed !== undefined && standings.dealsClosed !== true) ||
    (standings.requestId !== undefined && !validIds([standings.requestId], ids, 1, 1)) ||
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

function validVotePlans(value: unknown, ids: Set<string>, day: number, humanId: string): boolean {
  if (value === undefined) return true
  const plans = asObject(value)
  if (!plans || plans.day !== day || !Array.isArray(plans.contacts)) return false
  if (plans.kind !== 'check-in' && plans.kind !== 'offers' && plans.kind !== 'change') return false
  const length = plans.kind === 'offers' ? 2 : 1
  const contacts = plans.contacts.map(asObject)
  const speakers = contacts.map((contact) => contact?.speakerId)
  if (!validIds(speakers, ids, length, length) || speakers.includes(humanId)) return false
  const targets = contacts.map((contact) => contact?.targetId)
  if (plans.kind === 'change') {
    if (!validIds([plans.previousTargetId], ids, 1, 1) || targets.includes(plans.previousTargetId))
      return false
  } else if (plans.previousTargetId !== undefined) return false
  if (plans.kind === 'check-in' && targets[0] === undefined) return true
  return (
    validIds(targets, ids, length, length) &&
    targets.every((target, index) => target !== humanId && target !== speakers[index])
  )
}

function validIncomingResponses(value: unknown, day: number): boolean {
  if (value === undefined) return true
  const responses = asObject(value)
  return Boolean(
    responses &&
    Object.entries(responses).every(([id, answer]) => {
      const match =
        /^([1-9]\d*):(social:[12]|after-immunity:[12]|round-table:1|shield-(?:question|request)|shield-note:[1-9]\d*)$/.exec(
          id
        )
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
    if (!entry) return true
    const isFollowUp = entry.kind === 'shield-request' || entry.kind === 'shield-plans'
    if (!isFollowUp && !NIGHT_SHIELD_MOVES.some((kind) => kind === entry.kind)) return true
    if (
      typeof entry.day !== 'number' ||
      !Number.isSafeInteger(entry.day) ||
      entry.day < 1 ||
      entry.day > day ||
      !validIds([entry.actorId, entry.recipientId], ids, 2, 2)
    )
      return false
    if (isFollowUp) {
      return (
        entry.shieldReply === undefined &&
        entry.suspectId === undefined &&
        (entry.kind === 'shield-request'
          ? typeof entry.accepted === 'boolean' && entry.shieldPlan === undefined
          : entry.accepted === undefined &&
            (entry.shieldPlan === 'keep' ||
              entry.shieldPlan === 'open-to-gift' ||
              entry.shieldPlan === 'private'))
      )
    }
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

function onOrBefore(value: unknown, day: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= day
}

function validInvestigation(value: unknown, ids: Set<string>, humanId: string, day: number) {
  if (value === undefined) return true
  const state = asObject(value)
  if (!state) return false
  const { incidents, reports, watches, witnesses, shares, saved, votes } = state
  const notes = asObject(state.notes)
  if (
    !notes ||
    !Array.isArray(incidents) ||
    !Array.isArray(reports) ||
    !Array.isArray(watches) ||
    !Array.isArray(witnesses) ||
    !Array.isArray(shares) ||
    !Array.isArray(saved) ||
    !Array.isArray(votes)
  )
    return false

  const guest = (id: unknown): id is string =>
    typeof id === 'string' && id !== humanId && ids.has(id)
  const validOptional = (list: readonly string[], value: unknown) =>
    value === undefined || list.includes(value as string)
  function validClaim(claim: Record<string, unknown>, reportedDay: number) {
    return (
      onOrBefore(claim.day, reportedDay) &&
      (claim.period === undefined || claim.period === 'afternoon') &&
      validOptional(SOCIAL_BEHAVIORS, claim.behavior) &&
      validOptional(CASTLE_ROOMS, claim.room) &&
      validOptional(DEMEANORS, claim.mood) &&
      (claim.contactId === undefined || guest(claim.contactId)) &&
      (claim.topicId === undefined || guest(claim.topicId)) &&
      (claim.denies === undefined || claim.denies === true)
    )
  }
  const incidentIds = new Set<string>()
  if (
    !incidents.every((value: unknown) => {
      const incident = asObject(value)
      const fact = asObject(incident?.fact)
      if (
        !incident ||
        typeof incident.id !== 'string' ||
        !guest(incident.guestId) ||
        !fact ||
        !validClaim(fact, day) ||
        incident.id !==
          `${fact.day}:castle${fact.period === 'afternoon' ? '-afternoon' : ''}:${incident.guestId}` ||
        incidentIds.has(incident.id) ||
        !fact.behavior ||
        !fact.room ||
        !fact.mood ||
        fact.denies ||
        (incident.witnessId !== undefined && !guest(incident.witnessId)) ||
        !validIds(incident.relayIds, ids, 0, 2) ||
        (incident.relayIds as string[]).some((id) => !guest(id)) ||
        (fact.behavior === 'alone' ? fact.contactId !== undefined : !guest(fact.contactId)) ||
        (fact.behavior === 'lobbied' || fact.behavior === 'defended') !== Boolean(fact.topicId)
      )
        return false
      const present = [
        incident.guestId,
        fact.contactId,
        incident.witnessId,
        ...(incident.relayIds as string[]),
      ].filter(Boolean)
      if (
        new Set(present).size !== present.length ||
        (fact.topicId && (fact.topicId === incident.guestId || fact.topicId === fact.contactId))
      )
        return false
      incidentIds.add(incident.id)
      return true
    })
  )
    return false

  const reportIds = new Set<string>()
  if (
    !reports.every((value: unknown, index) => {
      const report = asObject(value)
      if (
        !report ||
        report.id !== `intel:${index + 1}` ||
        !onOrBefore(report.day, day) ||
        !guest(report.guestId) ||
        !REPORT_METHODS.includes(report.method as (typeof REPORT_METHODS)[number]) ||
        !REPORT_ACCESSES.includes(report.access as (typeof REPORT_ACCESSES)[number]) ||
        !validOptional(IMPRESSIONS, report.impression) ||
        (report.method === 'observe' || report.method === 'eavesdrop'
          ? report.speakerId !== undefined
          : !guest(report.speakerId)) ||
        [report.sourceId, report.nearbyId].some((id) => id !== undefined && !guest(id)) ||
        (report.incidentId !== undefined && !incidentIds.has(report.incidentId as string)) ||
        (report.referenceId !== undefined && !reportIds.has(report.referenceId as string))
      )
        return false
      const claim = asObject(report.claim)
      if (report.claim !== undefined && (!claim || !validClaim(claim, report.day))) return false
      reportIds.add(report.id)
      return true
    })
  )
    return false

  const validReference = (value: unknown) => {
    const record = asObject(value)
    return record &&
      onOrBefore(record.day, day) &&
      typeof record.reportId === 'string' &&
      reportIds.has(record.reportId)
      ? record
      : undefined
  }
  return (
    saved.every((id: unknown) => typeof id === 'string' && reportIds.has(id)) &&
    new Set(saved).size === saved.length &&
    Object.entries(notes).every(([id, value]) => {
      const note = asObject(value)
      const traits = asObject(note?.traits)
      return (
        guest(id) &&
        note &&
        GUEST_READS.includes(note.leaning as (typeof GUEST_READS)[number]) &&
        typeof note.text === 'string' &&
        note.text.length <= PERSONAL_NOTE_LIMIT &&
        (note.traits === undefined ||
          (traits &&
            Object.entries(traits).every(
              ([trait, value]) =>
                Object.hasOwn(PROFILE_TRAITS, trait) &&
                TRAIT_READS.includes(value as (typeof TRAIT_READS)[number])
            )))
      )
    }) &&
    watches.every((value: unknown) => {
      const watch = asObject(value)
      return (
        watch &&
        onOrBefore(watch.day, day) &&
        guest(watch.guestId) &&
        guest(watch.watcherId) &&
        watch.guestId !== watch.watcherId &&
        WATCH_STATUSES.includes(watch.status as (typeof WATCH_STATUSES)[number])
      )
    }) &&
    witnesses.every((value: unknown) => {
      const request = validReference(value)
      return (
        request &&
        typeof request.accepted === 'boolean' &&
        (request.shield === undefined ||
          (request.shield === 'met' && request.accepted) ||
          ((request.shield === 'pending' || request.shield === 'unmet') && !request.accepted))
      )
    }) &&
    shares.every((value: unknown) => {
      const share = validReference(value)
      return (
        share &&
        guest(share.listenerId) &&
        SHARING_MODES.includes(share.mode as (typeof SHARING_MODES)[number])
      )
    }) &&
    votes.every((value: unknown) => {
      const vote = asObject(value)
      return (
        vote &&
        onOrBefore(vote.day, day) &&
        Array.isArray(vote.ballots) &&
        vote.ballots.length > 0 &&
        validTableCount({ round: 1, ballots: vote.ballots, tiedIds: [] }, ids)
      )
    })
  )
}

function validInvestigationChoice(value: unknown, targetId: string, reports: unknown) {
  if (value === undefined) return true
  const choice = asObject(value)
  return Boolean(
    choice &&
    typeof choice.reportId === 'string' &&
    (choice.witness === undefined || choice.witness === true) &&
    (choice.named === undefined || (choice.named === true && choice.witness === undefined)) &&
    Array.isArray(reports) &&
    reports.some((value: unknown) => {
      const report = asObject(value)
      return (
        report &&
        report.id === choice.reportId &&
        report.guestId === targetId &&
        ((choice.witness === undefined && choice.named === undefined) ||
          report.access === 'firsthand')
      )
    })
  )
}

function validTableArguments(value: unknown, ids: Set<string>, reports?: unknown): boolean {
  if (value === undefined) return true
  if (!Array.isArray(value) || value.length > 5) return false
  const speakers = new Set<string>()
  return value.every((entry: unknown) => {
    const argument = asObject(entry)
    if (
      !argument ||
      typeof argument.speakerId !== 'string' ||
      typeof argument.targetId !== 'string' ||
      speakers.has(argument.speakerId) ||
      !validIds([argument.speakerId, argument.targetId], ids, 2, 2) ||
      (argument.tone !== 'careful' && argument.tone !== 'forceful') ||
      (argument.stance !== undefined &&
        argument.stance !== 'question' &&
        argument.stance !== 'defend') ||
      (argument.basis !== 'impression' &&
        argument.basis !== 'conversation' &&
        argument.basis !== 'record') ||
      (argument.broadcast !== undefined &&
        !['wager', 'back', 'challenge'].includes(String(argument.broadcast))) ||
      (argument.evidence !== undefined &&
        argument.evidence !== 'call-witness' &&
        argument.evidence !== 'name-source') ||
      (argument.investigation !== undefined &&
        (argument.stance !== undefined || argument.evidence !== undefined)) ||
      !validInvestigationChoice(argument.investigation, argument.targetId, reports)
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

function validDayFlow(value: unknown, ids: Set<string>, day: number, reports: unknown): boolean {
  if (value === undefined) return true
  const flow = asObject(value)
  if (!flow || flow.day !== day || (flow.castleDay !== undefined && flow.castleDay !== true))
    return false
  const guest = (id: unknown) => typeof id === 'string' && ids.has(id)
  const optionalGuest = (id: unknown) => id === undefined || guest(id)
  const report = (id: unknown) =>
    typeof id === 'string' &&
    Array.isArray(reports) &&
    reports.some((value) => asObject(value)?.id === id)
  const optionalReport = (id: unknown) => id === undefined || report(id)
  const optionalBool = (flag: unknown) => flag === undefined || typeof flag === 'boolean'
  const oneOf = (item: unknown, options: readonly string[]) =>
    typeof item === 'string' && options.includes(item)
  const provisional = asObject(flow.provisional)
  if (
    flow.provisional !== undefined &&
    (!provisional ||
      !Object.entries(provisional).every(
        ([id, target]) => guest(id) && guest(target) && id !== target
      ))
  )
    return false

  function valid(key: string, check: (item: Record<string, unknown>) => boolean) {
    if (flow?.[key] === undefined) return true
    const item = asObject(flow[key])
    return !!item && check(item)
  }

  const nightOrder = (item: Record<string, unknown>) =>
    guest(item.guestId) &&
    (item.kind === 'meeting'
      ? item.reportId === undefined
      : item.kind === 'account' && report(item.reportId))
  return (
    valid('breakfast', (item) => guest(item.guestId) && optionalReport(item.reportId)) &&
    valid(
      'morning',
      (item) =>
        oneOf(item.kind, MORNING_MOVES) && guest(item.guestId) && optionalReport(item.reportId)
    ) &&
    valid(
      'witness',
      (item) =>
        guest(item.guestId) &&
        report(item.reportId) &&
        typeof item.needsShield === 'boolean' &&
        optionalBool(item.ready)
    ) &&
    valid(
      'plan',
      (item) =>
        oneOf(item.kind, VOTE_MOVES) &&
        guest(item.partnerId) &&
        optionalGuest(item.targetId) &&
        optionalGuest(item.redirectedTo) &&
        typeof item.accepted === 'boolean'
    ) &&
    valid(
      'safety',
      (item) =>
        oneOf(item.kind, SAFETY_MOVES) &&
        optionalGuest(item.guestId) &&
        optionalBool(item.accepted) &&
        (item.result === undefined || oneOf(item.result, ['kept', 'broken', 'void']))
    ) &&
    valid(
      'shields',
      (item) =>
        oneOf(item.kind, SHIELD_MOVES) &&
        optionalGuest(item.guestId) &&
        optionalGuest(item.donorId) &&
        optionalGuest(item.voteTargetId) &&
        (item.result === undefined ||
          oneOf(item.result, ['gifted', 'declined', 'uncertain', 'has', 'none']))
    ) &&
    valid('night', nightOrder) &&
    valid('delivery', nightOrder) &&
    valid('finale', (item) => guest(item.guestId) && oneOf(item.stance, ['trust', 'doubt']))
  )
}

function validCastleMoments(
  value: unknown,
  ids: Set<string>,
  humanId: string,
  day: number,
  intel: unknown
) {
  if (value === undefined) return true
  if (!Array.isArray(value) || value.length > day * CASTLE_PERIODS.length) return false
  const investigation = asObject(intel)
  const periods = new Set<string>()
  const guest = (id: unknown) => typeof id === 'string' && id !== humanId && ids.has(id)
  return value.every((entry: unknown) => {
    const moment = asObject(entry)
    if (
      !moment ||
      !onOrBefore(moment.day, day) ||
      !guest(moment.contactId) ||
      (moment.subjectId !== undefined &&
        (typeof moment.subjectId !== 'string' ||
          !ids.has(moment.subjectId) ||
          moment.subjectId === moment.contactId)) ||
      typeof moment.scene !== 'string' ||
      !Object.hasOwn(CASTLE_SCENES, moment.scene)
    )
      return false
    const scene = CASTLE_SCENES[moment.scene as CastleSceneId]
    if (moment.subjectId === humanId && scene.context !== 'absence') return false
    const key = `${moment.day}:${scene.period}`
    if (periods.has(key)) return false
    periods.add(key)

    if (scene.context === 'lead') {
      if (
        !Array.isArray(investigation?.incidents) ||
        typeof moment.incidentId !== 'string' ||
        !investigation.incidents.some((value: unknown) => {
          const incident = asObject(value)
          return (
            incident?.id === moment.incidentId &&
            incident?.guestId === moment.subjectId &&
            asObject(incident?.fact)?.day === moment.day
          )
        })
      )
        return false
    } else if (moment.incidentId !== undefined) return false

    if (moment.response === undefined) return true
    const response = asObject(moment.response)
    if (!response) return false
    if (response.result === 'passed')
      return response.choice === undefined && response.reportId === undefined
    if (!scene.choices.some(({ action }) => action === response.choice)) return false
    if (response.choice === 'ask' || response.choice === 'observe') {
      return (
        ['firsthand', 'hearsay', 'observed', 'guarded'].includes(response.result as string) &&
        typeof response.reportId === 'string' &&
        Array.isArray(investigation?.reports) &&
        investigation.reports.some((value: unknown) => {
          const report = asObject(value)
          return (
            report &&
            report.id === response.reportId &&
            report.day === moment.day &&
            report.guestId === moment.subjectId &&
            report.method === response.choice
          )
        })
      )
    }
    if (response.result !== 'shared' && response.result !== 'guarded') return false
    if (response.reportId === undefined) return true
    return (
      response.choice === 'rapport' &&
      scene.context === 'meeting' &&
      typeof response.reportId === 'string' &&
      Array.isArray(investigation?.reports) &&
      investigation.reports.some((value: unknown) => {
        const report = asObject(value)
        return (
          report &&
          report.id === response.reportId &&
          report.day === moment.day &&
          report.speakerId === moment.contactId &&
          report.access === 'firsthand'
        )
      })
    )
  })
}

function validAudience(value: unknown, ids: Set<string>, day: number) {
  if (value === undefined) return true
  const audience = asObject(value)
  const episode = asObject(audience?.episode)
  const guest = (id: unknown) => typeof id === 'string' && ids.has(id)
  const optionalGuest = (id: unknown) => id === undefined || guest(id)
  function validEvent(value: unknown): boolean {
    const event = asObject(value)
    return (
      !!event &&
      onOrBefore(event.day, day) &&
      guest(event.actorId) &&
      optionalGuest(event.targetId) &&
      AUDIENCE_EVENTS.some((kind) => kind === event.kind)
    )
  }
  if (
    !audience ||
    !episode ||
    !onOrBefore(episode.day, day) ||
    !AUDIENCE_FORMATS.some((kind) => kind === episode.kind) ||
    !Array.isArray(audience.events) ||
    audience.events.length > 320 ||
    !audience.events.every(validEvent) ||
    (audience.lastSaveDay !== undefined && !onOrBefore(audience.lastSaveDay, day)) ||
    (audience.ballotDay !== undefined && !onOrBefore(audience.ballotDay, day))
  )
    return false
  if (episode.kind === 'hot-seat') {
    const seat = asObject(episode.hotSeat)
    if (
      !seat ||
      !guest(seat.speakerId) ||
      !guest(seat.defendedId) ||
      seat.defendedId !== seat.votedId ||
      !optionalGuest(seat.influenceId)
    )
      return false
  }
  if (episode.decision === undefined) return true
  const decision = asObject(episode.decision)
  if (!decision || decision.kind !== episode.kind) return false
  if (decision.kind === 'wager')
    return (
      optionalGuest(decision.volunteerId) &&
      optionalGuest(decision.targetId) &&
      (decision.result === undefined ||
        decision.result === 'kept' ||
        decision.result === 'switched' ||
        decision.result === 'void')
    )
  if (decision.kind === 'hot-seat')
    return (
      HOT_SEAT_ANSWERS.some((answer) => answer === decision.answer) &&
      optionalGuest(decision.respondentId) &&
      (decision.reply === undefined || decision.reply === 'back' || decision.reply === 'challenge')
    )
  return (
    Array.isArray(decision.shares) &&
    decision.shares.length <= CAST_SIZE &&
    decision.shares.every((value) => {
      const share = asObject(value)
      return (
        !!share &&
        guest(share.guestId) &&
        typeof share.percent === 'number' &&
        share.percent >= 0 &&
        share.percent <= 100
      )
    }) &&
    Array.isArray(decision.reasons) &&
    decision.reasons.length <= 2 &&
    decision.reasons.every(validEvent)
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
  const reports = asObject(item.investigation)?.reports
  const adBreak = asObject(item.pendingAdBreak)
  return Boolean(
    ids.size === CAST_SIZE &&
    typeof item.humanId === 'string' &&
    ids.has(item.humanId) &&
    validDayFlow(item.dayFlow, ids, item.day, reports) &&
    validAudience(item.audience, ids, item.day) &&
    validBetrayalsEconomy(item.economy, item.id) &&
    (item.pendingAdBreak === undefined ||
      (adBreak &&
        typeof adBreak.id === 'string' &&
        adBreak.id.length > 0 &&
        adBreak.runId === item.id &&
        typeof adBreak.day === 'number' &&
        Number.isSafeInteger(adBreak.day) &&
        adBreak.day >= 1 &&
        adBreak.day <= item.day &&
        ['banishment', 'murder', 'final-vote'].includes(adBreak.kind as string))) &&
    options &&
    typeof options.publicMode === 'boolean' &&
    ['off', 'casual', 'tv', 'adult'].some((preset) => preset === options.realityMode) &&
    hidden &&
    validIds(hidden.betrayers, ids, 3, 4) &&
    validConclaveVote(hidden.conclaveVote, item.phase, ids, hidden.betrayers as string[]) &&
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
    validInvestigation(item.investigation, ids, item.humanId, item.day) &&
    validCastleMoments(item.castleMoments, ids, item.humanId, item.day, item.investigation) &&
    validTableArguments(item.tableArguments, ids, reports) &&
    validTableArguments(lastTable?.campaigns, ids, reports) &&
    validCaseReviews(item.caseReviews, ids, item.day) &&
    validWitnessLead(item.witnessLead, ids, item.day) &&
    (item.tableSway == null ||
      (sway &&
        typeof sway.targetId === 'string' &&
        ids.has(sway.targetId) &&
        (sway.tone === 'careful' || sway.tone === 'forceful') &&
        (sway.investigation === undefined ||
          (sway.stance === undefined && sway.evidence === undefined)) &&
        validInvestigationChoice(sway.investigation, sway.targetId, reports) &&
        (sway.stance === undefined || sway.stance === 'question' || sway.stance === 'defend') &&
        (sway.evidence === undefined ||
          ((sway.evidence === 'call-witness' || sway.evidence === 'name-source') &&
            asObject(item.witnessLead)?.day === item.day &&
            asObject(item.witnessLead)?.suspectId === sway.targetId &&
            (sway.evidence !== 'call-witness' ||
              asObject(item.witnessLead)?.promised === true))))) &&
    validSafetyStandings(hidden.safetyStandings, ids, item.day) &&
    validVotePlans(item.votePlans, ids, item.day, item.humanId) &&
    (item.challengeHistory === undefined ||
      (Array.isArray(item.challengeHistory) &&
        item.challengeHistory.every((key) => typeof key === 'string'))) &&
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
        (pendingNight.filmPlayed === undefined || typeof pendingNight.filmPlayed === 'boolean') &&
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

function restoreSeasonRewards(run: Run): SeasonRewards | undefined {
  const saved = asObject(run.seasonRewards)
  if (!saved) return
  function restoreCheckpoint(type: 'day' | 'table') {
    const candidate = saved?.[type]
    if (
      isRun(candidate) &&
      candidate.seasonRewards === undefined &&
      candidate.presentation === undefined &&
      candidate.pendingAdBreak === undefined &&
      validSeasonCheckpoint(candidate, run, type)
    ) {
      return candidate
    }
  }
  return {
    day: restoreCheckpoint('day'),
    table: restoreCheckpoint('table'),
    finaleRevealed: run.phase === 'settled' && saved.finaleRevealed === true,
  }
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
    const seasonRewards = restoreSeasonRewards(candidate)
    return {
      status: 'ready',
      run: {
        ...candidate,
        ...(candidate.seasonRewards !== undefined ? { seasonRewards } : {}),
        socialWallets:
          candidate.socialWallets ??
          initializeSocialWallets(candidate.seats, candidate.day, candidate.options.realityMode),
      },
    }
  } catch {
    return { status: 'incompatible' }
  }
}

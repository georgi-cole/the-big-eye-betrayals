import { getSocialPersonality } from '../social/socialPersonalityBank.ts'
import { mulberry32 } from '../store/rng.ts'
import { openInvestigationDay } from './castleIncidents.ts'
import {
  addIntelReport,
  firsthandAt,
  GUEST_READS,
  investigationFor,
  isActiveGuest,
  isVoteClaim,
  OBSERVATION_FOCI,
  PERSONAL_NOTE_LIMIT,
  PROFILE_TRAITS,
  SHARING_MODES,
  TRAIT_READS,
} from './investigationRecords.ts'
import type {
  IntelReport,
  Investigation,
  ObservationFocus,
  PersonalRead,
  SharedReport,
  WitnessRequest,
} from './investigationRecords.ts'
import { between, getSocialView, relationship } from './perception.ts'
import { eligibleBanishmentTargets, hashId, isCurrentCommand } from './run.ts'
import type { CommandToken, Run } from './run.ts'
import { recordSocialWallet, socialWalletFor } from './socialResources.ts'

export const INVESTIGATION_ENERGY_COST = 1
const OBSERVATION_LIMIT = 3

export type InvestigationAction =
  | { kind: 'observe'; guestId: string; focus: ObservationFocus; incidentId?: string }
  | { kind: 'ask'; guestId: string; speakerId: string; referenceId?: string; incidentId?: string }
  | { kind: 'source' | 'confront' | 'witness' | 'save'; reportId: string }
  | { kind: 'watch'; guestId: string; speakerId: string }
  | { kind: 'note'; guestId: string; note: PersonalRead }
  | { kind: 'share'; reportId: string; speakerId: string; mode: SharedReport['mode'] }

export function observationsRemaining(run: Run) {
  return (
    OBSERVATION_LIMIT -
    investigationFor(run).reports.filter(
      ({ day, method }) => day === run.day && method === 'observe'
    ).length
  )
}

export function investigationOpen(run: Run) {
  const castleWindow =
    run.dayFlow?.castleDay === true && (run.phase === 'dawn' || run.phase === 'shield-deals')
  return (run.phase === 'social' || castleWindow) && !run.result && isActiveGuest(run, run.humanId)
}

function witnessWindow(run: Run) {
  return (
    investigationOpen(run) ||
    (run.phase === 'round-table' &&
      isActiveGuest(run, run.humanId) &&
      run.tableSway === undefined &&
      !run.tableCount &&
      !run.runoffIds)
  )
}

export function investigationActionReason(
  run: Run,
  action: InvestigationAction
): string | undefined {
  const state = investigationFor(run)
  const report =
    'reportId' in action ? state.reports.find(({ id }) => id === action.reportId) : undefined
  if ('reportId' in action && !report) return 'That account is unavailable.'
  const guestId = 'guestId' in action ? action.guestId : report?.guestId

  if (action.kind === 'save') return
  if (action.kind === 'note') {
    if (!run.seats.some(({ id }) => id === action.guestId) || action.guestId === run.humanId)
      return 'Choose a guest.'
    if (!GUEST_READS.includes(action.note.leaning) || action.note.text.length > PERSONAL_NOTE_LIMIT)
      return 'Shorten your note.'
    if (
      action.note.traits &&
      Object.entries(action.note.traits).some(
        ([trait, value]) => !Object.hasOwn(PROFILE_TRAITS, trait) || !TRAIT_READS.includes(value)
      )
    )
      return 'Choose a valid impression.'
    return
  }
  if (action.kind === 'witness' ? !witnessWindow(run) : !investigationOpen(run))
    return 'Available during Social.'
  if (!guestId || guestId === run.humanId || !isActiveGuest(run, guestId))
    return 'This guest has left the castle.'
  if (
    'speakerId' in action &&
    (action.speakerId === run.humanId ||
      action.speakerId === guestId ||
      !isActiveGuest(run, action.speakerId))
  )
    return 'Choose another guest to speak with.'
  if (socialWalletFor(run, run.humanId).energy < INVESTIGATION_ENERGY_COST)
    return `Requires ${INVESTIGATION_ENERGY_COST} Energy.`

  const today = state.reports.filter(({ day }) => day === run.day)
  if (
    'incidentId' in action &&
    action.incidentId &&
    !state.incidents.some(
      (incident) =>
        incident.id === action.incidentId &&
        incident.guestId === guestId &&
        incident.fact.day === run.day &&
        (action.kind !== 'ask' ||
          firsthandAt(incident, action.speakerId) ||
          incident.relayIds.includes(action.speakerId))
    )
  )
    return 'That conversation is unavailable.'
  switch (action.kind) {
    case 'observe':
      if (!OBSERVATION_FOCI.includes(action.focus)) return 'Choose what to watch.'
      if (
        today.some(
          (item) =>
            item.method === 'observe' &&
            item.guestId === guestId &&
            (!action.incidentId || item.incidentId === action.incidentId)
        )
      )
        return 'Already observed today.'
      if (observationsRemaining(run) <= 0) return 'Your attention is spent for today.'
      return
    case 'ask':
      if (
        action.referenceId &&
        !state.reports.some(
          ({ id, guestId, claim }) =>
            id === action.referenceId &&
            guestId === action.guestId &&
            claim &&
            claim.day >= run.day - 2
        )
      )
        return 'Choose a recent account about this guest.'
      if (
        today.some(
          (item) =>
            item.method === 'ask' &&
            item.guestId === guestId &&
            item.speakerId === action.speakerId &&
            (!action.incidentId || item.incidentId === action.incidentId)
        )
      )
        return 'You already asked this guest today.'
      return
    case 'source':
      if (
        report?.access !== 'hearsay' ||
        !report.speakerId ||
        report.sourceId ||
        !isActiveGuest(run, report.speakerId) ||
        report.day < run.day - 2
      )
        return 'You need a recent secondhand account with a source you can ask.'
      if (state.reports.some((item) => item.method === 'source' && item.referenceId === report.id))
        return 'You already followed up on this account.'
      return
    case 'confront':
      if (!isVoteClaim(report?.claim) || report.claim.denies || report.claim.day < run.day - 2)
        return 'Bring a recent, specific account of a vote conversation.'
      if (today.some((item) => item.method === 'confront' && item.guestId === guestId))
        return 'You already asked them for their side today.'
      return
    case 'watch':
      if (state.watches.some(({ day }) => day === run.day))
        return 'You have already asked for a lookout today.'
      return
    case 'witness':
      if (run.dayFlow?.witness?.reportId === action.reportId)
        return 'You already spoke to this witness about appearing at the Table.'
      if (
        report?.access !== 'firsthand' ||
        !isVoteClaim(report.claim) ||
        report.claim.denies ||
        !report.speakerId ||
        !isActiveGuest(run, report.speakerId) ||
        report.claim.day < run.day - 2 ||
        !eligibleBanishmentTargets(run, run.humanId).includes(guestId)
      )
        return 'You need a firsthand witness who can speak about a recent vote conversation.'
      if (state.witnesses.some(({ day, reportId }) => day === run.day && reportId === report.id))
        return 'You already asked this witness today.'
      return
    case 'share':
      if (
        !report?.claim?.behavior ||
        report.speakerId === action.speakerId ||
        !SHARING_MODES.includes(action.mode) ||
        (action.mode === 'challenge' && (!isVoteClaim(report.claim) || report.claim.denies))
      )
        return 'Choose a specific account to discuss.'
      if (
        state.shares.some(
          ({ day, reportId, listenerId }) =>
            day === run.day && reportId === report.id && listenerId === action.speakerId
        )
      )
        return 'You have already discussed this account with them today.'
  }
}

function paid(run: Run, investigation: Investigation): Run {
  return {
    ...run,
    investigation,
    revision: run.revision + 1,
    socialWallets: recordSocialWallet(
      run,
      run.humanId,
      { energy: -INVESTIGATION_ENERGY_COST },
      INVESTIGATION_ENERGY_COST
    ),
  }
}

function roll(run: Run, action: string, guestId: string, speakerId = '') {
  return mulberry32(run.publicSeed ^ hashId(`${run.day}:${action}:${guestId}:${speakerId}`))()
}

function willingness(run: Run, speakerId: string, guestId: string, publicSetting = false) {
  const social = getSocialView(run, speakerId)
  const towardsPlayer = relationship(social, speakerId, run.humanId)
  const towardsGuest = relationship(social, speakerId, guestId)
  const personality = getSocialPersonality(speakerId)
  const guardedAfterQuestions = investigationFor(run).reports.some(
    ({ guestId, day, method }) =>
      guestId === speakerId && method === 'confront' && day >= run.day - 1
  )
  // A guest may confide in someone privately and still refuse to repeat it in the room.
  return (
    0.45 +
    towardsPlayer.bond * 0.94 +
    towardsPlayer.reliability * 0.45 -
    towardsGuest.bond * (0.26 + personality.loyalty * 0.3) +
    personality.gossipPropensity * 0.21 -
    (publicSetting ? (1 - personality.publicConflictComfort) * 0.27 : 0) -
    (guardedAfterQuestions ? 0.1 : 0)
  )
}

function observe(run: Run, action: Extract<InvestigationAction, { kind: 'observe' }>) {
  const state = investigationFor(run)
  const incident = state.incidents
    .filter(
      ({ id, guestId, fact }) =>
        guestId === action.guestId &&
        fact.day === run.day &&
        (!action.incidentId || id === action.incidentId)
    )
    .at(-1)
  const report = { day: run.day, guestId: action.guestId, method: 'observe' } as const
  if (!incident) return addIntelReport(state, { ...report, access: 'unavailable' })
  const focus = observationsRemaining(run)
  const { day, period, behavior, room, mood, contactId, topicId } = incident.fact
  const claim =
    focus === 1
      ? { day, room, mood: action.focus === 'demeanor' ? mood : undefined }
      : action.focus === 'contacts'
        ? {
            day,
            room,
            contactId,
            behavior: behavior === 'avoided' || behavior === 'alone' ? behavior : ('met' as const),
          }
        : action.focus === 'demeanor'
          ? {
              day,
              room,
              mood,
              behavior: focus === 3 && behavior === 'avoided' ? behavior : undefined,
              contactId: focus === 3 && behavior === 'avoided' ? contactId : undefined,
            }
          : {
              day,
              room,
              behavior,
              contactId: focus === 3 ? contactId : undefined,
              topicId: focus === 3 ? topicId : undefined,
            }
  return addIntelReport(state, {
    ...report,
    access: 'observed',
    claim: { ...claim, period },
    incidentId: incident.id,
    nearbyId: focus === 3 && action.focus !== 'demeanor' ? incident.witnessId : undefined,
  })
}

function bestAccount(
  run: Run,
  guestId: string,
  speakerId: string,
  reference?: IntelReport,
  incidentId = reference?.incidentId
) {
  return investigationFor(run)
    .incidents.filter((incident) => {
      const { fact } = incident
      return (
        incident.guestId === guestId &&
        fact.day >= run.day - 2 &&
        (!reference?.claim || fact.day === reference.claim.day) &&
        (!incidentId || incident.id === incidentId) &&
        (firsthandAt(incident, speakerId) || incident.relayIds.includes(speakerId))
      )
    })
    .at(-1)
}

function answerQuestion(
  run: Run,
  action: Extract<InvestigationAction, { kind: 'ask' }>,
  offeredAccount: boolean
) {
  const state = investigationFor(run)
  const { guestId, speakerId } = action
  const reference = state.reports.find(({ id }) => id === action.referenceId)
  const incident = bestAccount(run, guestId, speakerId, reference, action.incidentId)
  const base = {
    day: run.day,
    method: 'ask',
    speakerId,
    guestId,
    referenceId: reference?.id,
  } as const
  const chance = roll(
    run,
    action.incidentId ? `ask:${action.incidentId}` : 'ask',
    guestId,
    speakerId
  )
  const openness = willingness(run, speakerId, guestId)
  if (!(offeredAccount && incident) && chance > openness + (reference ? 0.15 : 0))
    return addIntelReport(state, { ...base, access: 'withheld' })

  if (!incident) {
    const social = getSocialView(run, speakerId)
    const knewGuest = social.some((entry) => between(entry, speakerId, guestId))
    if (!knewGuest) return addIntelReport(state, { ...base, access: 'unavailable' })
    const bond = relationship(social, speakerId, guestId).bond
    const opinion = social.some(
      (entry) => between(entry, speakerId, guestId) && entry.kind === 'vote-plan'
    )
      ? 'careful about votes'
      : bond >= 0.22
        ? 'open with me'
        : bond > 0
          ? 'keeps to a close circle'
          : 'hard to read'
    return addIntelReport(state, { ...base, access: 'impression', impression: opinion })
  }

  const firsthand = firsthandAt(incident, speakerId)
  const partial = chance > openness - 0.22 && !reference
  const wouldProtect = relationship(getSocialView(run, speakerId), speakerId, guestId).bond > 0.25
  const misleading =
    isVoteClaim(incident.fact) &&
    wouldProtect &&
    roll(run, 'cover', guestId, speakerId) < getSocialPersonality(speakerId).deceptionComfort * 0.24
  const { day, period, behavior, contactId, topicId, room, mood } = incident.fact
  const firmDenial = firsthand && misleading && chance > openness - 0.35
  // A relay can mistake who stood with whom, but its source remains the same.
  const confused =
    !firsthand &&
    contactId &&
    behavior !== 'avoided' &&
    !reference &&
    roll(run, 'memory', guestId, speakerId) < 0.11
  const claim = firmDenial
    ? { day, behavior, topicId, denies: true as const }
    : misleading || confused
      ? {
          day,
          behavior: 'met' as const,
          contactId: confused ? incident.witnessId : contactId,
          room,
        }
      : partial
        ? { day, behavior, room, contactId: firsthand ? contactId : undefined }
        : {
            day,
            behavior,
            room: firsthand ? room : undefined,
            contactId: firsthand ? contactId : undefined,
            mood: firsthand ? mood : undefined,
            topicId,
          }
  return addIntelReport(state, {
    ...base,
    access: firsthand ? 'firsthand' : 'hearsay',
    claim: { ...claim, period },
    incidentId: incident.id,
    sourceId: !firsthand && chance < openness - 0.42 ? incident.witnessId : undefined,
  })
}

function followSource(run: Run, state: Investigation, report: IntelReport) {
  const speakerId = report.speakerId!
  const { guestId, claim, incidentId } = report
  const incident = state.incidents.find(({ id }) => id === incidentId)
  const sourceId =
    roll(run, 'source', guestId, speakerId) < willingness(run, speakerId, guestId) - 0.12
      ? incident?.witnessId
      : undefined
  return addIntelReport(state, {
    day: run.day,
    guestId,
    speakerId,
    sourceId,
    incidentId,
    method: 'source',
    referenceId: report.id,
    access: sourceId ? 'hearsay' : 'withheld',
    claim: sourceId ? claim : undefined,
  })
}

function confront(run: Run, state: Investigation, report: IntelReport) {
  const { guestId, claim } = report
  const personality = getSocialPersonality(guestId)
  const social = getSocialView(run, guestId)
  const trust = relationship(social, guestId, run.humanId).bond
  const caution = Math.min(
    1,
    (run.lastTable?.blind === false ? (run.lastTable.tally[guestId] ?? 0) : 0) / 5
  )
  const chance = roll(run, 'confront', guestId)
  const incident = state.incidents.find(({ id }) => id === report.incidentId)
  const contradictsWhatTheyDid =
    incident &&
    (incident.fact.topicId !== claim?.topicId || incident.fact.behavior !== claim?.behavior)
  const denies =
    contradictsWhatTheyDid ||
    chance < 0.17 + personality.deceptionComfort * 0.38 + caution * 0.24 - trust * 0.44
  const willing = chance > 0.32 - trust * 0.3
  return addIntelReport(state, {
    day: run.day,
    guestId,
    speakerId: guestId,
    method: 'confront',
    referenceId: report.id,
    incidentId: report.incidentId,
    access: denies || willing ? 'statement' : 'withheld',
    claim:
      claim && (denies || willing)
        ? {
            day: claim.day,
            period: claim.period,
            behavior: claim.behavior,
            topicId: claim.topicId,
            denies: denies ? true : undefined,
          }
        : undefined,
  })
}

export function applyInvestigationAction(
  run: Run,
  token: CommandToken,
  action: InvestigationAction,
  { offeredAccount = false }: { offeredAccount?: boolean } = {}
): Run {
  if (
    !isCurrentCommand(run, token) ||
    run.presentation?.length ||
    investigationActionReason(run, action)
  )
    return run
  const current =
    action.kind === 'observe' || action.kind === 'ask' ? openInvestigationDay(run) : run
  const state = investigationFor(current)
  const report =
    'reportId' in action ? state.reports.find(({ id }) => id === action.reportId) : undefined
  switch (action.kind) {
    case 'observe':
      return paid(current, observe(current, action))
    case 'ask':
      return paid(current, answerQuestion(current, action, offeredAccount))
    case 'source':
      return paid(current, followSource(current, state, report!))
    case 'confront':
      return paid(current, confront(current, state, report!))
    case 'save': {
      const saved = state.saved.includes(action.reportId)
        ? state.saved.filter((id) => id !== action.reportId)
        : [...state.saved, action.reportId]
      return { ...current, revision: current.revision + 1, investigation: { ...state, saved } }
    }
    case 'note': {
      const { guestId, note } = action
      const prior = Object.hasOwn(state.notes, guestId) ? state.notes[guestId] : undefined
      const text = note.text.trim()
      const traits =
        note.traits &&
        Object.fromEntries(
          Object.entries(note.traits).sort(([left], [right]) => left.localeCompare(right))
        )
      if (
        prior?.leaning === note.leaning &&
        prior.text === text &&
        JSON.stringify(prior.traits ?? {}) === JSON.stringify(traits ?? {})
      )
        return run
      const notes = { ...state.notes, [guestId]: { leaning: note.leaning, text, traits } }
      if (note.leaning === 'open' && !text && !Object.keys(traits ?? {}).length)
        delete notes[guestId]
      if (!prior && !Object.hasOwn(notes, guestId)) return run
      return { ...current, revision: current.revision + 1, investigation: { ...state, notes } }
    }
    case 'share':
      return paid(current, {
        ...state,
        shares: [
          ...state.shares,
          {
            day: run.day,
            reportId: action.reportId,
            listenerId: action.speakerId,
            mode: action.mode,
          },
        ],
      })
    case 'watch': {
      const { guestId, speakerId } = action
      const accepted =
        roll(run, 'watch-request', guestId, speakerId) < willingness(run, speakerId, guestId) - 0.23
      return paid(current, {
        ...state,
        watches: [
          ...state.watches,
          {
            day: run.day,
            guestId,
            watcherId: speakerId,
            status: accepted ? 'waiting' : 'declined',
          },
        ],
      })
    }
    case 'witness': {
      const speakerId = report!.speakerId!
      const guestId = report!.guestId
      const request: WitnessRequest = { day: run.day, reportId: action.reportId, accepted: false }
      const accepted =
        roll(run, 'table-witness', guestId, speakerId) <
        willingness(run, speakerId, guestId, true) + 0.18
      if (run.dayFlow && investigationOpen(run)) {
        const profile = getSocialPersonality(speakerId)
        const trust = relationship(run.social, speakerId, run.humanId)
        const confidence =
          profile.publicConflictComfort * 0.38 + trust.bond * 0.45 + trust.reliability * 0.3
        if (confidence < 0.48 + roll(run, 'cover for testimony', guestId, speakerId) * 0.29) {
          request.shield = 'pending'
        } else request.accepted = accepted
      } else request.accepted = accepted
      return paid(current, {
        ...state,
        witnesses: [...state.witnesses, request],
      })
    }
  }
}

export function settleDayWitnesses(run: Run): Run {
  if (!run.dayFlow) return run
  const state = investigationFor(run)
  const legacy = run.dayFlow.witness
  if (
    !legacy &&
    !state.witnesses.some(({ day, shield }) => day === run.day && shield === 'pending')
  )
    return run
  const eligible = eligibleBanishmentTargets(run, run.humanId)
  const protectedAtNight = (id: string) =>
    id === run.immunityId || run.private.nightShieldIds.includes(id)
  const witnesses = state.witnesses.map((request): WitnessRequest => {
    if (request.day !== run.day || request.shield !== 'pending') return request
    const report = state.reports.find(({ id }) => id === request.reportId)
    const accepted = Boolean(
      report?.speakerId &&
      isActiveGuest(run, report.speakerId) &&
      protectedAtNight(report.speakerId) &&
      eligible.includes(report.guestId)
    )
    return { ...request, accepted, shield: accepted ? 'met' : 'unmet' }
  })
  if (!legacy) return { ...run, investigation: { ...state, witnesses } }

  const guestId = state.reports.find(({ id }) => id === legacy.reportId)?.guestId
  const ready = Boolean(
    guestId &&
    eligible.includes(guestId) &&
    (!legacy.needsShield || protectedAtNight(legacy.guestId))
  )
  return {
    ...run,
    dayFlow: { ...run.dayFlow, witness: { ...legacy, ready } },
    investigation: {
      ...state,
      witnesses: [
        ...witnesses.filter(({ day, reportId }) => day !== run.day || reportId !== legacy.reportId),
        {
          day: run.day,
          reportId: legacy.reportId,
          accepted: ready,
          shield: legacy.needsShield ? (ready ? 'met' : 'unmet') : undefined,
        },
      ],
    },
  }
}

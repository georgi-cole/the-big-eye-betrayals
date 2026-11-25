import { getSocialPersonality } from '../social/socialPersonalityBank.ts'
import { mulberry32, seededPick, seededPickN } from '../store/rng.ts'
import {
  addIntelReport,
  CASTLE_ROOMS,
  investigationFor,
  isActiveGuest,
} from './investigationRecords.ts'
import type { CastleIncident, Investigation, WatchRequest } from './investigationRecords.ts'
import { getSocialView, relationship } from './perception.ts'
import { eligibleBanishmentTargets, hashId } from './run.ts'
import type { Run } from './run.ts'
import { chooseTarget, resolutionPerspective } from './strategy.ts'

function castleIncident(
  run: Run,
  guestId: string,
  others: readonly string[],
  period?: 'afternoon'
): CastleIncident {
  const random = mulberry32(
    run.publicSeed ^ Math.imul(run.day, 3271) ^ hashId(guestId) ^ (period ? 213367 : 0)
  )
  const personality = getSocialPersonality(guestId)
  const relationships = getSocialView(run, guestId)
  const politicalHeat = run.lastTable?.blind === false ? run.lastTable.tally : undefined
  const contactId = others
    .map((id) => ({ id, score: relationship(relationships, guestId, id).bond + random() * 0.7 }))
    .sort((left, right) => right.score - left.score)[0]?.id
  const room = seededPick(random, CASTLE_ROOMS)
  const trait = personality.emotionalReactivity
  const pressure = Math.min(1, (politicalHeat?.[guestId] ?? 0) / 4)
  const recentlyChallenged = investigationFor(run).reports.some(
    ({ guestId: challenged, method, day }) =>
      challenged === guestId && method === 'confront' && day === run.day - 1
  )
  const moodRoll = random() + pressure * 0.3 + trait * 0.18 + (recentlyChallenged ? 0.12 : 0)
  const mood =
    moodRoll > 1.04
      ? 'restless'
      : moodRoll > 0.82
        ? 'guarded'
        : moodRoll < 0.4
          ? 'at ease'
          : 'subdued'
  const incident: CastleIncident = {
    id: `${run.day}:castle${period ? '-afternoon' : ''}:${guestId}`,
    guestId,
    fact: { day: run.day, ...(period ? { period } : {}), behavior: 'alone', room, mood },
    relayIds: [],
  }
  if (!contactId || random() < 0.36 - personality.socialEnergy * 0.28) return incident

  const options = eligibleBanishmentTargets(run, guestId).filter(
    (id) => id !== contactId && id !== run.humanId
  )
  const view = resolutionPerspective(run, guestId, options)
  const atRisk = options.filter((id) => (politicalHeat?.[id] ?? 0) >= 2)
  const friendship = atRisk.find(
    (id) => relationship(relationships, guestId, id).bond >= 0.28 && random() < personality.loyalty
  )
  const threatenedTeammate = atRisk.find((id) => view.teammates.includes(id))
  const protectedAlly =
    friendship ??
    (threatenedTeammate && random() < personality.loyalty * 0.19 + personality.riskTolerance * 0.14
      ? threatenedTeammate
      : undefined)
  const risk = 0.19 + personality.assertiveness * 0.17 + personality.strategicCalculation * 0.12
  const topic =
    random() < risk + (threatenedTeammate ? 0.12 : 0) ? chooseTarget(view, 'case') : undefined
  const wasTargeted =
    run.lastTable?.blind === false &&
    view.revealedBallots?.some(
      ({ voterId, targetId }) => voterId === contactId && targetId === guestId
    )
  const behavior = protectedAlly
    ? 'defended'
    : topic
      ? 'lobbied'
      : wasTargeted && random() < trait * 0.57
        ? 'avoided'
        : random() < personality.warmth
          ? 'checked-in'
          : 'met'
  incident.fact = {
    ...incident.fact,
    behavior,
    contactId,
    topicId: protectedAlly ?? topic,
    mood: behavior === 'avoided' ? 'hurried' : mood,
  }
  if (!incident.fact.topicId || random() < 0.18) return incident

  // The conversation has a recipient, sometimes a person within earshot, and at most two relays.
  const nearby = others.filter((id) => id !== contactId)
  const [witnessId, ...relays] = seededPickN(random, nearby, Math.min(nearby.length, 3))
  incident.witnessId = witnessId
  incident.relayIds = witnessId ? relays.filter(() => random() < 0.82) : []
  return incident
}

function deliverWatch(run: Run, state: Investigation, watch: WatchRequest): Investigation {
  const { guestId, watcherId, day } = watch
  const incident = state.incidents.find(
    (item) => item.guestId === guestId && item.fact.day === run.day
  )
  const random = mulberry32(run.publicSeed ^ hashId(`watch:${day}:${watcherId}:${guestId}`))
  const attention = getSocialPersonality(watcherId).strategicCalculation
  const caught =
    day + 1 === run.day &&
    incident &&
    isActiveGuest(run, watcherId) &&
    random() < 0.57 + attention * 0.34
  return addIntelReport(state, {
    day: run.day,
    guestId,
    speakerId: watcherId,
    method: 'watch',
    access: caught ? 'firsthand' : 'unavailable',
    incidentId: caught ? incident.id : undefined,
    claim: caught ? incident.fact : undefined,
  })
}

/** Commit the day's conversations before the player chooses which lead to follow. */
export function openInvestigationDay(run: Run): Run {
  if (
    (run.phase !== 'social' && !(run.dayFlow && run.phase === 'dawn')) ||
    !isActiveGuest(run, run.humanId)
  )
    return run
  const state = investigationFor(run)
  if (state.incidents.some(({ fact }) => fact.day === run.day)) return run
  const active = run.seats.flatMap(({ id, exit }) => (!exit && id !== run.humanId ? [id] : []))
  if (!active.length) return run
  const incidents = active.map((id) =>
    castleIncident(
      run,
      id,
      active.filter((other) => other !== id)
    )
  )
  let next = { ...state, incidents: [...state.incidents, ...incidents] }
  const watches = state.watches.map((watch) => {
    if (watch.status !== 'waiting' || watch.day >= run.day) return watch
    next = deliverWatch(run, next, watch)
    return {
      ...watch,
      status: next.reports.at(-1)?.claim ? ('reported' as const) : ('missed' as const),
    }
  })
  return { ...run, investigation: { ...next, watches } }
}

export function openAfternoonInvestigation(run: Run): Run {
  const state = investigationFor(run)
  if (
    !isActiveGuest(run, run.humanId) ||
    state.incidents.some(({ fact }) => fact.day === run.day && fact.period === 'afternoon')
  )
    return run
  const guests = run.seats.flatMap(({ id, exit }) => (!exit && id !== run.humanId ? [id] : []))
  const random = mulberry32(run.publicSeed ^ hashId(`afternoon:${run.day}`))
  const actors = seededPickN(random, guests, Math.min(guests.length, 8))
  const incidents = actors.map((actor) =>
    castleIncident(
      run,
      actor,
      guests.filter((id) => id !== actor),
      'afternoon'
    )
  )
  return { ...run, investigation: { ...state, incidents: [...state.incidents, ...incidents] } }
}

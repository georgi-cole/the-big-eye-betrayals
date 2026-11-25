import { getSocialPersonality } from '../social/socialPersonalityBank.ts'
import { mulberry32 } from '../store/rng.ts'
import { CASTLE_SCENES } from './castleLifeBank.ts'
import type { CastleChoice, CastleMoment, CastlePeriod, CastleSceneId } from './castleLifeBank.ts'
import {
  applyInvestigationAction,
  INVESTIGATION_ENERGY_COST,
  investigationActionReason,
} from './investigation.ts'
import type { InvestigationAction } from './investigation.ts'
import {
  describeClaim,
  firsthandAt,
  guestName,
  investigationFor,
  isActiveGuest,
  isVoteClaim,
  waitingShieldWitnesses,
} from './investigationRecords.ts'
import {
  commandToken,
  eligibleBanishmentTargets,
  hashId,
  isCurrentCommand,
  publicNightShieldWinners,
} from './run.ts'
import type { CommandToken, Run } from './run.ts'
import { shieldTalkBlockedAfterGift } from './nightShields.ts'
import {
  applySocialMove,
  discussedToday,
  getSocialView,
  hasSocialStrain,
  rapport,
  socialMoveKinds,
} from './social.ts'
import { missingSocialResource, socialMoveCost, socialWalletFor } from './socialResources.ts'
import { chooseTarget, resolutionPerspective } from './strategy.ts'

const momentPhase = {
  breakfast: 'dawn',
  lunch: 'after-immunity',
  afternoon: 'social',
  supper: 'shield-deals',
  cocktail: 'cocktail',
} as const
const momentLabels = {
  breakfast: 'At breakfast',
  lunch: 'Over lunch',
  afternoon: 'Around the castle',
  supper: 'Before the Table',
  cocktail: 'Over cocktails',
} as const
const sceneIds = Object.keys(CASTLE_SCENES) as CastleSceneId[]

function storyRandom(run: Run, context: string) {
  return mulberry32(run.publicSeed ^ hashId(`${run.day}:castle life:${context}`))
}

function momentFor(run: Run, period: CastlePeriod) {
  return run.castleMoments?.find(
    ({ day, scene }) => day === run.day && CASTLE_SCENES[scene].period === period
  )
}

function visibleMoment(run: Run) {
  const period = (Object.keys(momentPhase) as CastlePeriod[]).find(
    (period) => momentPhase[period] === run.phase
  )
  return period && momentFor(run, period)
}

/** Pick from the period's authored scenes using public facts or the player's own social history. */
export function openCastleMoment(run: Run, period: CastlePeriod): Run {
  if (!run.dayFlow?.castleDay || run.phase !== momentPhase[period] || momentFor(run, period))
    return run
  const guests = run.seats.filter(({ id, exit }) => !exit && id !== run.humanId)
  if (guests.length < 2) return run
  const random = storyRandom(run, period)
  const histories = run.castleMoments ?? []
  const visible = getSocialView(run, run.humanId)
  const recent = histories.slice(-5)
  const publicVote = run.lastTable?.blind === false ? run.lastTable : undefined
  const lostId = run.lastDawn?.day === run.day ? run.lastDawn.eliminatedId : undefined
  const delivery = run.dayFlow.delivery
  const meetingId =
    delivery?.kind === 'meeting' && !run.dayFlow.breakfast ? delivery.guestId : undefined
  const shift =
    run.votePlans?.day === run.day && run.votePlans.kind === 'change' ? run.votePlans : undefined
  const witnesses = new Set(waitingShieldWitnesses(run))
  const winners = publicNightShieldWinners(run)
  const promise = run.dayFlow.safety
  const previous = histories.at(-1)
  const familiarId =
    previous?.day === run.day &&
    previous.response?.result === 'shared' &&
    previous.response.choice === 'rapport'
      ? previous.contactId
      : undefined
  const state = investigationFor(run)
  const later = period !== 'breakfast'
  const leads = state.incidents.filter(
    ({ fact, id }) =>
      fact.day === run.day &&
      isVoteClaim(fact) &&
      (fact.period === 'afternoon') === later &&
      !recent.some(({ incidentId }) => incidentId === id)
  )

  const candidates = sceneIds.flatMap((id) => {
    const scene = CASTLE_SCENES[id]
    if (scene.period !== period) return []
    const context = scene.context
    if (
      (context === 'opening' && run.day !== 1) ||
      (context === 'absence' && !lostId) ||
      (context === 'tie' && !publicVote?.tiedByDraw) ||
      (context === 'after-vote' && !publicVote) ||
      (context === 'full-house' && lostId !== null) ||
      (context === 'vote-shift' && !shift) ||
      (context === 'immunity' && (!run.immunityId || run.immunityId === run.humanId))
    )
      return []
    const contacts = guests.flatMap(({ id: contactId }) => {
      if (
        (context === 'meeting' && contactId !== meetingId) ||
        (context === 'familiar' && contactId !== familiarId) ||
        (context === 'rift' && !hasSocialStrain(visible, run.humanId, contactId)) ||
        (context === 'witness' && !witnesses.has(contactId)) ||
        (context === 'public-safety' && !winners.includes(contactId)) ||
        (context === 'shield-promise' && contactId !== promise?.guestId) ||
        (context === 'vote-shift' &&
          !shift?.contacts.some(({ speakerId }) => contactId === speakerId))
      )
        return []
      const lead =
        context === 'lead'
          ? leads.filter(
              (incident) =>
                firsthandAt(incident, contactId) || incident.relayIds.includes(contactId)
            )
          : []
      const incident = lead[Math.floor(random() * lead.length)]
      if (context === 'lead' && !incident) return []
      const subjects = guests.filter(
        ({ id }) => id !== contactId && (context !== 'vote' || (publicVote?.tally[id] ?? 0) > 0)
      )
      const subjectId =
        context === 'absence'
          ? (lostId ?? undefined)
          : context === 'vote-shift'
            ? shift?.previousTargetId
            : context === 'immunity'
              ? run.immunityId
              : (incident?.guestId ?? subjects[Math.floor(random() * subjects.length)]?.id)
      if ((context === 'vote' || context === 'immunity') && (!subjectId || subjectId === contactId))
        return []
      const person = getSocialPersonality(contactId)
      const voice =
        scene.voice === 'composure' ? 1 - person.emotionalReactivity : person[scene.voice]
      const affinity = rapport(visible, contactId, run.humanId)
      const repeat = context !== 'familiar' && recent.some((event) => event.contactId === contactId)
      return [
        {
          moment: { day: run.day, scene: id, contactId, subjectId, incidentId: incident?.id },
          score: random() * 1.05 + voice * 0.42 + affinity * 0.23 - (repeat ? 0.38 : 0),
        },
      ]
    })
    const best = contacts.sort((a, b) => b.score - a.score)[0]
    if (!best) return []
    const recentScene = recent.some(({ scene }) => scene === id)
    const relevance =
      context === 'meeting'
        ? 4
        : context === 'vote-shift' ||
            context === 'witness' ||
            context === 'shield-promise' ||
            context === 'familiar'
          ? 0.35
          : context === 'routine'
            ? 0
            : 0.16
    return [{ ...best, score: best.score + relevance + random() - (recentScene ? 1.7 : 0) }]
  })
  const moment = candidates.sort((a, b) => b.score - a.score)[0]?.moment
  return moment ? { ...run, castleMoments: [...histories, moment] } : run
}

function remember(
  run: Run,
  moment: CastleMoment,
  response: NonNullable<CastleMoment['response']>
): Run {
  return {
    ...run,
    castleMoments: run.castleMoments?.map((entry) =>
      entry === moment ? { ...moment, response } : entry
    ),
  }
}

function requestedInvestigation(
  moment: CastleMoment,
  choice: CastleChoice
): InvestigationAction | undefined {
  const { incidentId, subjectId, contactId } = moment
  if (!incidentId || !subjectId) return
  if (choice === 'observe')
    return { kind: 'observe', guestId: subjectId, focus: 'contacts', incidentId }
  if (choice === 'ask') return { kind: 'ask', guestId: subjectId, speakerId: contactId, incidentId }
}

function reasonForChoice(run: Run, moment: CastleMoment, choice: CastleChoice) {
  const investigation = requestedInvestigation(moment, choice)
  if (investigation) return investigationActionReason(run, investigation)
  if (choice === 'ask' || choice === 'observe' || !socialMoveKinds(run).includes(choice))
    return 'Unavailable at this point in the day.'
  if (
    shieldTalkBlockedAfterGift(
      run.social,
      {
        actorId: run.humanId,
        recipientId: moment.contactId,
        kind: choice,
      },
      run.day
    )
  )
    return 'You already gave them a Night Shield.'
  if (
    choice === 'mend-fences' &&
    !hasSocialStrain(getSocialView(run, run.humanId), run.humanId, moment.contactId)
  )
    return 'You have already cleared the air.'
  const discussesGuest =
    choice === 'question' ||
    choice === 'ask-about' ||
    choice === 'defend-guest' ||
    choice === 'share-suspicion'
  if (
    discussesGuest &&
    (!moment.subjectId ||
      !isActiveGuest(run, moment.subjectId) ||
      moment.subjectId === run.humanId ||
      moment.subjectId === moment.contactId)
  )
    return 'That guest is unavailable.'
  if (
    choice === 'question' &&
    run.social.some(
      ({ actorId, recipientId, kind, day }) =>
        kind === 'question' &&
        day === run.day &&
        actorId === run.humanId &&
        recipientId === moment.contactId
    )
  )
    return 'You already asked who was on their mind.'
  if (
    discussedToday(
      run.social,
      {
        actorId: run.humanId,
        recipientId: moment.contactId,
        kind: choice,
        suspectId: discussesGuest ? moment.subjectId : undefined,
      },
      run.day
    )
  )
    return 'You already spoke about this today.'
  const cost = socialMoveCost(choice, run.options.realityMode)
  const missing = missingSocialResource(socialWalletFor(run, run.humanId), cost)
  if (missing) return `Requires ${cost[missing]} ${missing[0].toUpperCase() + missing.slice(1)}.`
}

export function playCastleChoice(run: Run, token: CommandToken, choice: CastleChoice): Run {
  const moment = visibleMoment(run)
  if (
    !isCurrentCommand(run, token) ||
    run.presentation?.length ||
    !moment ||
    moment.response ||
    !isActiveGuest(run, run.humanId) ||
    !isActiveGuest(run, moment.contactId) ||
    !CASTLE_SCENES[moment.scene].choices.some(({ action }) => action === choice) ||
    reasonForChoice(run, moment, choice)
  )
    return run
  const action = requestedInvestigation(moment, choice)
  let next = run
  if (action) {
    next = applyInvestigationAction(run, token, action, { offeredAccount: action.kind === 'ask' })
  } else if (choice !== 'ask' && choice !== 'observe') {
    const { contactId } = moment
    const subject =
      choice === 'question'
        ? (chooseTarget(
            resolutionPerspective(
              run,
              contactId,
              eligibleBanishmentTargets(run, contactId).filter((id) => id !== run.humanId)
            ),
            'case'
          ) ?? moment.subjectId)
        : moment.subjectId
    next = applySocialMove(run, token, {
      actorId: run.humanId,
      recipientId: contactId,
      kind: choice,
      suspectId: subject,
    })
  }
  if (next === run) return run
  const reports = investigationFor(next).reports
  const report = reports.length > investigationFor(run).reports.length ? reports.at(-1) : undefined
  const social = action ? undefined : next.social.at(-1)
  const guarded = social && ['held-back', 'backfired', 'unmoved'].includes(social.reaction ?? '')
  const result =
    action && report?.access === 'observed'
      ? 'observed'
      : action && report?.access === 'firsthand'
        ? 'firsthand'
        : action && report?.access === 'hearsay'
          ? 'hearsay'
          : (action && report) || guarded
            ? 'guarded'
            : 'shared'
  return remember(next, moment, { choice, result, reportId: report?.id })
}

/** The other guests use the time even if the player spends it elsewhere. */
export function closeCastleMoment(run: Run): Run {
  const moment = visibleMoment(run)
  if (!moment || moment.response) return run
  const random = storyRandom(run, `passed:${moment.scene}`)
  const companyView = getSocialView(run, moment.contactId)
  const company = run.seats
    .filter(({ id, exit }) => !exit && id !== run.humanId && id !== moment.contactId)
    .map(({ id }) => ({
      id,
      score: rapport(companyView, moment.contactId, id) + random() * 0.45,
    }))
    .sort((a, b) => b.score - a.score)[0]?.id
  let next = run
  if (company && isActiveGuest(run, moment.contactId)) {
    next = applySocialMove(run, commandToken(run), {
      actorId: moment.contactId,
      recipientId: company,
      kind: 'rapport',
    })
    // Someone else may hear the same conversation. The original account and source stay intact.
    if (
      next !== run &&
      moment.incidentId &&
      random() < 0.5 + getSocialPersonality(moment.contactId).gossipPropensity * 0.35
    ) {
      const state = investigationFor(next)
      const incidents = state.incidents.map((incident) => {
        if (
          incident.id !== moment.incidentId ||
          incident.relayIds.length >= 2 ||
          incident.guestId === company ||
          firsthandAt(incident, company) ||
          incident.relayIds.includes(company)
        )
          return incident
        return { ...incident, relayIds: [...incident.relayIds, company] }
      })
      next = { ...next, investigation: { ...state, incidents } }
    }
  }
  return remember(next, moment, { result: 'passed' })
}

function copyFor(run: Run, moment: CastleMoment, copy: string) {
  const room = investigationFor(run).incidents.find(({ id }) => id === moment.incidentId)?.fact.room
  return copy.replace(/\{(guest|subject|room)\}/g, (_, token: string) => {
    if (token === 'room') return room ?? 'hall'
    const id = token === 'guest' ? moment.contactId : moment.subjectId
    return id ? guestName(run.seats, id) : 'another guest'
  })
}

export function castleGlance(run: Run) {
  const moment = visibleMoment(run)
  return moment && copyFor(run, moment, CASTLE_SCENES[moment.scene].glance)
}

export function castleSocialMoment(run: Run) {
  const moment = visibleMoment(run)
  if (!moment || !isActiveGuest(run, run.humanId) || !isActiveGuest(run, moment.contactId)) return
  const scene = CASTLE_SCENES[moment.scene]
  const previous = run.castleMoments?.at((run.castleMoments?.indexOf(moment) ?? 0) - 1)
  const prior =
    previous &&
    previous !== moment &&
    previous.day >= run.day - 1 &&
    previous.response?.choice &&
    previous.response.result !== 'guarded' &&
    isActiveGuest(run, previous.contactId)
      ? previous
      : undefined
  const priorChoice =
    prior &&
    CASTLE_SCENES[prior.scene].choices.find(({ action }) => action === prior.response?.choice)
  const response = moment.response
  const state = investigationFor(run)
  const report = response && state.reports.find(({ id }) => id === response.reportId)
  const callbackReport =
    prior?.response?.reportId && state.reports.find(({ id }) => id === prior.response?.reportId)
  const incident = moment.incidentId && state.incidents.find(({ id }) => id === moment.incidentId)
  const opening =
    incident && !firsthandAt(incident, moment.contactId)
      ? 'Someone told me they saw {subject} near the {room}. You would have to ask them what was said.'
      : scene.opening
  return {
    id: `${moment.day}:castle:${moment.scene}`,
    required: scene.context === 'meeting' && run.dayFlow?.breakfast?.guestId !== moment.contactId,
    guestId: moment.contactId,
    title: momentLabels[scene.period],
    opening: copyFor(run, moment, opening),
    callback: prior && priorChoice ? copyFor(run, prior, priorChoice.remembered) : undefined,
    callbackGuestId: callbackReport ? callbackReport.guestId : undefined,
    options: response
      ? []
      : scene.choices
          .map(({ action, label }) => ({
            action,
            label: copyFor(run, moment, label),
            cost:
              action === 'ask' || action === 'observe'
                ? { energy: INVESTIGATION_ENERGY_COST, influence: 0, info: 0 }
                : socialMoveCost(action, run.options.realityMode),
            reason: reasonForChoice(run, moment, action),
          }))
          .filter(({ action }) => action !== 'debrief' || run.lastTable?.blind === false),
    response: response?.result,
    reportGuestId: report?.guestId,
    reportText: report?.claim
      ? describeClaim(report.claim, guestName(run.seats, report.guestId), (id) =>
          guestName(run.seats, id)
        )
      : undefined,
  }
}

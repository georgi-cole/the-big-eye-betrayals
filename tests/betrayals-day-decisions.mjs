import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  addAudienceEvents,
  openAudienceEpisode,
  recordAudienceBallot,
  resolveAudienceDecision,
  WAGER_BONUS,
} from '../src/betrayals/audienceSeason.ts'
import { challengeContestantIds, resolveChallenge } from '../src/betrayals/challenges.ts'
import { castleGlance, castleSocialMoment, playCastleChoice } from '../src/betrayals/castleLife.ts'
import { CASTLE_SCENES } from '../src/betrayals/castleLifeBank.ts'
import { advanceDayAftermath } from '../src/betrayals/dayAftermath.ts'
import { openDayFlow } from '../src/betrayals/dayFlow.ts'
import { advanceDayBeat } from '../src/betrayals/daySocial.ts'
import { getIncomingInteractions, respondToIncomingInteraction } from '../src/betrayals/incoming.ts'
import { applyInvestigationAction } from '../src/betrayals/investigation.ts'
import { compareReportAccounts } from '../src/betrayals/investigationEvidence.ts'
import { investigationFor } from '../src/betrayals/investigationRecords.ts'
import { resolveNight, revealDawn } from '../src/betrayals/night.ts'
import { restoreRun, saveRun } from '../src/betrayals/persistence.ts'
import { awardPublicShield } from '../src/betrayals/publicShield.ts'
import { commandToken, eligibleBanishmentTargets, startRun, viewFor } from '../src/betrayals/run.ts'
import { applySocialMove, latestPact } from '../src/betrayals/social.ts'
import { recordSocialWallet, socialWalletFor } from '../src/betrayals/socialResources.ts'
import {
  advanceTableRound,
  buildTableBallots,
  recordTableSway,
  resolveTable,
  revealTable,
  tableTargets,
} from '../src/betrayals/table.ts'

const cast = [
  'noa',
  'finn',
  'pax',
  'kian',
  'rey',
  ...Array.from({ length: 19 }, (_, i) => `guest-${i}`),
].map((id) => ({ id, name: id }))

function seed({ publicMode = false, publicSeed = 47, day = 1, scheduled = true } = {}) {
  const run = startRun(
    { id: 'me', name: 'Player' },
    cast,
    { publicMode, realityMode: 'casual' },
    { id: 'day-flow-test', publicSeed, roleSeed: 12 }
  )
  return openDayFlow({
    ...run,
    day,
    phase: 'dawn',
    dayFlow: scheduled ? { day, delivery: { kind: 'meeting', guestId: 'noa' } } : undefined,
    private: { ...run.private, betrayers: ['finn', 'kian', 'rey'] },
    investigation: scheduled
      ? {
          ...investigationFor(run),
          incidents: [
            {
              id: `${day}:castle:finn`,
              guestId: 'finn',
              relayIds: [],
              fact: {
                day,
                behavior: 'lobbied',
                room: 'Library',
                mood: 'guarded',
                contactId: 'noa',
                topicId: 'pax',
              },
            },
          ],
        }
      : undefined,
  })
}

function restore(run) {
  const storage = new Map()
  const adapter = {
    setItem: (key, value) => storage.set(key, value),
    getItem: (key) => storage.get(key) ?? null,
  }
  saveRun(adapter, 'review', run)
  const loaded = restoreRun(adapter, 'review')
  assert.equal(loaded.status, 'ready')
  return loaded.run
}

function move(run, kind, recipientId, options) {
  const next = applySocialMove(run, commandToken(run), {
    actorId: run.humanId,
    recipientId,
    kind,
    ...options,
  })
  assert.notStrictEqual(next, run, `Social action was rejected: ${kind}`)
  return restore(next)
}

function contest(run, tops, publicResults = false) {
  const score = challengeContestantIds(run).map((contestantId, index) => ({
    contestantId,
    score: tops.includes(contestantId) ? 1000 - tops.indexOf(contestantId) : index,
    potContribution: 0.5,
  }))
  return resolveChallenge(run, commandToken(run), score, 'test-game', publicResults)
}

function getToVotePlans(run) {
  run = move(run, 'rapport', 'noa')
  run = restore(
    applyInvestigationAction(run, commandToken(run), {
      kind: 'witness',
      reportId: run.dayFlow.breakfast.reportId,
    })
  )
  assert.equal(run.investigation.witnesses.at(-1)?.shield, 'pending')
  return restore(contest(advanceDayBeat(run), ['guest-0']))
}

function getToShields(run) {
  const funded = {
    ...run,
    socialWallets: recordSocialWallet(run, 'me', { energy: 3, info: 50, influence: 20 }),
  }
  run = move(funded, 'vote-plan', 'noa', {
    suspectId: 'finn',
    witnessReportId: run.dayFlow.breakfast.reportId,
  })
  assert.equal(
    latestPact(run.social, 'me', 'noa', run.day)?.witnessReportId,
    run.dayFlow.breakfast.reportId
  )
  run = move(advanceDayAftermath(run, commandToken(run)), 'promise-shield', 'noa')
  return restore(contest(advanceDayBeat(run), ['pax', 'me']))
}

function vote(run, target) {
  let pending = resolveTable(run, commandToken(run), buildTableBallots(run, target))
  while (pending.runoffIds) {
    const runoff = advanceTableRound(pending, commandToken(pending))
    const replacement = tableTargets(runoff, run.humanId)[0]
    pending = resolveTable(runoff, commandToken(runoff), buildTableBallots(runoff, replacement))
  }
  return restore(revealTable(pending, commandToken(pending)))
}

test('breakfast, lunch and the castle afternoon each resolve in the new daily schedule', () => {
  const breakfast = seed()
  assert.equal(castleSocialMoment(breakfast).title, 'At breakfast')
  assert.equal(castleSocialMoment(breakfast).guestId, 'noa')
  const incoming = getIncomingInteractions(breakfast)[0]
  assert.equal(incoming.required, true)
  assert.strictEqual(advanceDayBeat(restore(breakfast)).phase, 'dawn')
  const declined = restore(
    respondToIncomingInteraction(breakfast, commandToken(breakfast), incoming.id, 'dismiss')
  )
  assert.equal(socialWalletFor(declined, 'me').energy, socialWalletFor(breakfast, 'me').energy)
  assert.equal(advanceDayBeat(declined).phase, 'immunity')
  const met = restore(
    respondToIncomingInteraction(breakfast, commandToken(breakfast), incoming.id, 'rapport')
  )
  const report = met.investigation.reports.at(-1)
  assert.equal(report.speakerId, 'noa')
  assert.equal(report.access, 'firsthand')
  assert.strictEqual(playCastleChoice(met, commandToken(met), 'rapport'), met)

  const immunity = advanceDayBeat(met)
  assert.equal(immunity.phase, 'immunity')
  const lunch = restore(contest(immunity, ['guest-0']))
  assert.equal(castleSocialMoment(lunch).title, 'Over lunch')
  assert.equal(castleSocialMoment(lunch).callbackGuestId, 'finn')
  assert.match(castleSocialMoment(lunch).callback, /turned up/)

  const afternoon = restore(advanceDayAftermath(lunch, commandToken(lunch)))
  assert.equal(afternoon.phase, 'social')
  assert.equal(castleSocialMoment(afternoon).title, 'Around the castle')
  assert.equal(challengeContestantIds(afternoon).length, 0)
  assert.strictEqual(advanceDayAftermath(afternoon, commandToken(afternoon)), afternoon)
  const safety = advanceDayBeat(afternoon)
  assert.equal(safety.phase, 'safety')
  assert(!challengeContestantIds(safety).includes('guest-0'))
  const supper = restore(contest(safety, ['pax', 'me']))
  assert.equal(castleSocialMoment(supper).title, 'Before the Table')
  assert.equal(supper.castleMoments.length, 4)
  assert.equal(supper.castleMoments[1].response.result, 'passed')
  assert.equal(supper.castleMoments[2].response.result, 'passed')
})

test('afternoon sightings leave a time-specific trace and a missed conversation still goes on', () => {
  const afternoons = Array.from({ length: 30 }, (_, publicSeed) => {
    const dawn = seed({ publicSeed, scheduled: false })
    const lunch = contest(advanceDayBeat(dawn), ['guest-0'])
    return advanceDayAftermath(lunch, commandToken(lunch))
  })
  const scenes = new Set(afternoons.flatMap((run) => run.castleMoments.map(({ scene }) => scene)))
  assert(scenes.size >= 12)
  const afternoon = afternoons.find(
    (run) => CASTLE_SCENES[run.castleMoments.at(-1).scene].context === 'lead'
  )
  assert(afternoon)
  const moment = afternoon.castleMoments.at(-1)
  const original = afternoon.investigation.incidents.find(({ id }) => id === moment.incidentId)
  assert.equal(original.fact.period, 'afternoon')
  assert(!castleGlance(afternoon).includes(original.fact.topicId))
  assert.equal(castleGlance(restore(afternoon)), castleGlance(afternoon))

  const observed = restore(playCastleChoice(afternoon, commandToken(afternoon), 'observe'))
  const report = observed.investigation.reports.at(-1)
  assert.equal(report.incidentId, original.id)
  assert.equal(report.claim.period, 'afternoon')
  assert.equal(report.claim.topicId, undefined)
  assert.equal(report.access, 'observed')
  assert.equal(socialWalletFor(observed, 'me').energy, socialWalletFor(afternoon, 'me').energy - 1)
  const morning = { ...report, claim: { ...report.claim, period: undefined } }
  assert.match(compareReportAccounts(morning, report), /different times/)

  const passed = restore(advanceDayBeat(afternoon))
  assert.equal(passed.castleMoments.at(-1).response.result, 'passed')
  assert.equal(passed.investigation.reports.length, afternoon.investigation.reports.length)
  assert(
    passed.social
      .slice(afternoon.social.length)
      .some(
        ({ actorId, recipientId, kind }) =>
          actorId === moment.contactId && recipientId !== 'me' && kind === 'rapport'
      )
  )
})

test('the player can resume as a spectator when breakfast refers to their absence', () => {
  const breakfasts = Array.from({ length: 12 }, (_, publicSeed) => {
    const run = seed({ day: 2, publicSeed, scheduled: false })
    return openDayFlow({
      ...run,
      castleMoments: undefined,
      investigation: undefined,
      lastDawn: { day: 2, eliminatedId: run.humanId },
      seats: run.seats.map((seat) =>
        seat.id === run.humanId ? { ...seat, exit: { day: 1, cause: 'night' } } : seat
      ),
    })
  })
  const departure = breakfasts.find((run) => run.castleMoments.at(-1).subjectId === run.humanId)
  assert(departure)
  const resumed = restore(departure)
  assert.equal(resumed.phase, 'dawn')
  assert.equal(castleSocialMoment(resumed), undefined)
  assert.equal(advanceDayBeat(resumed).phase, 'immunity')
})

test('the same morning can lead to a witness, a different ballot and a shield save', () => {
  const start = seed({ publicSeed: 7 })
  const offers = getToVotePlans(start)
  const deals = getToShields(offers)
  const table = (run) => restore(advanceDayAftermath(run, commandToken(run)))
  const keep = table(deals)
  const gift = table(move(deals, 'shield-gift', 'noa'))
  assert.equal(keep.investigation.witnesses[0].shield, 'unmet')
  assert.equal(gift.investigation.witnesses[0].shield, 'met')
  assert.equal(keep.dayFlow.safety.result, 'broken')
  assert.equal(gift.dayFlow.safety.result, 'kept')
  assert.equal(viewFor(gift, 'finn').knownNightShieldIds.includes('noa'), false)

  const runVote = (run, witness) =>
    recordTableSway(run, commandToken(run), {
      targetId: 'finn',
      tone: 'careful',
      investigation: { reportId: run.dayFlow.breakfast.reportId, witness },
    })
  assert.strictEqual(runVote(keep, true), keep)
  assert.strictEqual(resolveTable(gift, commandToken(gift), buildTableBallots(gift, 'finn')), gift)
  const attested = restore(runVote(gift, true))
  const anonymous = restore(runVote(keep, undefined))
  assert.notDeepEqual(buildTableBallots(attested, 'finn'), buildTableBallots(anonymous, 'finn'))
  const next = vote(attested, 'finn')
  const stayed = vote(anonymous, 'finn')
  assert.equal(next.phase, 'cocktail')
  assert.equal(stayed.phase, 'cocktail')
  assert.equal(castleSocialMoment(next).title, 'Over cocktails')
  assert.notEqual(next.lastTable.banishedId, stayed.lastTable.banishedId)
  assert.deepEqual(next.lastTable.witnesses, [{ speakerId: 'noa', targetId: 'finn' }])
  assert.equal(stayed.lastTable.witnesses.length, 0)
  assert.notEqual(latestPact(next.social, next.humanId, 'noa', next.day).pledgeResult, 'void')
  assert.equal(latestPact(stayed.social, stayed.humanId, 'noa', stayed.day).pledgeResult, 'void')
  const meetingGuest = next.seats.find(
    ({ id, exit }) => !exit && id !== next.humanId && id !== 'noa'
  ).id
  const rest = (run) => move(run, 'arrange-breakfast', meetingGuest)
  const targeted = (run) => {
    run = restore(advanceDayAftermath(run, commandToken(run)))
    assert.equal(run.phase, 'night')
    const voters = run.private.betrayers.filter((id) =>
      run.seats.some((seat) => seat.id === id && !seat.exit)
    )
    return resolveNight(
      run,
      commandToken(run),
      voters.map((voterId) => ({ voterId, targetId: 'noa' }))
    )
  }
  const protectedNight = restore(targeted(rest(next)))
  const exposedNight = restore(targeted(stayed))
  assert.equal(protectedNight.private.pendingNight.blocked, true)
  assert.equal(exposedNight.private.pendingNight.blocked, false)
  const dawn = openDayFlow(restore(revealDawn(protectedNight, commandToken(protectedNight))))
  assert.equal(dawn.lastDawn.eliminatedId, null)
  assert.equal(dawn.dayFlow.delivery.guestId, meetingGuest)
  assert.equal(revealDawn(exposedNight, commandToken(exposedNight)).lastDawn.eliminatedId, 'noa')
})

test('a Loyal’s sealed account reaches just the chosen guest when the Loyal is removed', () => {
  const deals = getToShields(getToVotePlans(seed()))
  const donated = move(deals, 'shield-gift', 'pax')
  const table = advanceDayAftermath(donated, commandToken(donated))
  const night = vote(recordTableSway(table, commandToken(table), null), 'finn')
  const recipient = night.seats.find(
    ({ id, exit }) => !exit && !['me', 'noa', 'finn'].includes(id)
  ).id
  const order = move(night, 'leave-account', recipient)
  const ballots = night.private.betrayers
    .filter((id) => night.seats.some((seat) => seat.id === id && !seat.exit))
    .map((voterId) => ({ voterId, targetId: 'me' }))
  const endOfEvening = restore(advanceDayAftermath(order, commandToken(order)))
  const resolved = resolveNight(endOfEvening, commandToken(endOfEvening), ballots)
  const dawn = restore(revealDawn(resolved, commandToken(resolved)))
  assert.deepEqual(dawn.dayFlow.delivery, order.dayFlow.night)
  assert.deepEqual(dawn.investigation.shares.at(-1), {
    day: 2,
    listenerId: recipient,
    reportId: order.dayFlow.night.reportId,
    mode: 'attribute',
  })
})

test('vote offers live in the Inbox and unanswered guests can pursue a different partner', () => {
  const offers = getToVotePlans(seed())
  const proposal = getIncomingInteractions(offers).find(({ kind }) => kind === 'vote-plan')
  assert.ok(proposal)
  const accepted = restore(
    respondToIncomingInteraction(offers, commandToken(offers), proposal.id, 'engage')
  )
  assert.equal(
    latestPact(accepted.social, 'me', proposal.speaker.id, offers.day)?.suspectId,
    proposal.target.id
  )
  const continued = advanceDayAftermath(accepted, commandToken(accepted))
  assert.equal(continued.phase, 'social')
  assert.equal(
    getIncomingInteractions(continued).find(({ id }) => id === proposal.id)?.response,
    'engage'
  )

  const afternoon = advanceDayAftermath(offers, commandToken(offers))
  assert.equal(
    getIncomingInteractions(afternoon).find(({ id }) => id === proposal.id)?.response,
    undefined
  )
  const ignored = restore(advanceDayBeat(afternoon))
  assert.equal(ignored.phase, 'safety')
  assert.ok(
    ignored.social
      .slice(offers.social.length)
      .some(
        ({ actorId, recipientId, suspectId }) =>
          actorId === proposal.speaker.id &&
          recipientId !== 'me' &&
          suspectId === proposal.target.id
      )
  )
})

test('an invalidated vote pact and a direct shield request pause the corresponding phase', () => {
  const lunch = getToVotePlans(seed())
  const changed = {
    ...lunch,
    votePlans: {
      day: lunch.day,
      kind: 'change',
      previousTargetId: lunch.immunityId,
      contacts: [{ speakerId: 'noa', targetId: 'finn' }],
    },
  }
  const replacement = getIncomingInteractions(changed).find(({ kind }) => kind === 'vote-plan')
  assert.equal(replacement.required, true)
  assert.strictEqual(advanceDayAftermath(changed, commandToken(changed)), changed)
  const replied = restore(
    respondToIncomingInteraction(changed, commandToken(changed), replacement.id, 'listen')
  )
  assert.equal(advanceDayAftermath(replied, commandToken(replied)).phase, 'social')

  const deals = getToShields(lunch)
  const requested = {
    ...deals,
    private: {
      ...deals.private,
      safetyStandings: { ...deals.private.safetyStandings, requestId: 'noa' },
    },
  }
  const request = getIncomingInteractions(requested).find(({ kind }) => kind === 'shield-request')
  assert.equal(request.required, true)
  assert.strictEqual(advanceDayAftermath(requested, commandToken(requested)), requested)
  const kept = restore(
    respondToIncomingInteraction(requested, commandToken(requested), request.id, 'dismiss')
  )
  assert(kept.private.nightShieldIds.includes('me'))
  assert.equal(advanceDayAftermath(kept, commandToken(kept)).phase, 'round-table')
})

test('a lunch save from before the new Public Mode can still award the existing shield', () => {
  const lunch = getToVotePlans(seed({ publicMode: true }))
  const legacy = restore({ ...lunch, audience: undefined })
  assert.strictEqual(advanceDayAftermath(legacy, commandToken(legacy)), legacy)
  const revealed = restore(awardPublicShield(legacy, commandToken(legacy), { noa: 100 }))
  assert.equal(revealed.publicShieldDecisionDay, legacy.day)
  assert(revealed.publicShield?.id)
  assert.equal(advanceDayAftermath(revealed, commandToken(revealed)).phase, 'social')
})

test('the Vote Promise follows the first ballot and deposits to the pot only once', () => {
  const before = getToVotePlans(seed({ publicMode: true }))
  assert.equal(before.audience.episode.kind, 'wager')
  assert.strictEqual(awardPublicShield(before, commandToken(before), { noa: 100 }), before)
  const wager = restore(
    resolveAudienceDecision(before, commandToken(before), { kind: 'wager', targetId: 'finn' })
  )
  const ready = { ...wager, phase: 'round-table' }
  const kept = restore(recordAudienceBallot(ready, [{ voterId: 'me', targetId: 'finn' }], []))
  const switched = restore(recordAudienceBallot(ready, [{ voterId: 'me', targetId: 'pax' }], []))
  assert.equal(kept.pot, ready.pot + WAGER_BONUS)
  assert.equal(switched.pot, ready.pot)
  assert.equal(switched.audience.episode.decision.result, 'switched')
  assert.strictEqual(recordAudienceBallot(kept, [{ voterId: 'me', targetId: 'pax' }], []), kept)
  assert.deepEqual(
    ready.audience.events.filter(({ kind }) => kind === 'wager').map(({ targetId }) => targetId),
    ['finn']
  )
})

test('Hot Seat requires a public contradiction and the player’s public reply changes the relationship', () => {
  const start = seed({ publicMode: true, day: 2 })
  const prior = {
    ...start,
    day: 1,
    audience: { ...start.audience, episode: { day: 1, kind: 'wager' } },
  }
  const aired = addAudienceEvents(prior, [
    { kind: 'defend', actorId: 'finn', targetId: 'pax' },
    { kind: 'ballot', actorId: 'finn', targetId: 'pax' },
    { kind: 'case', actorId: 'noa', targetId: 'pax' },
  ])
  const tomorrow = openAudienceEpisode({ ...start, audience: aired.audience })
  assert.equal(tomorrow.audience.episode.kind, 'hot-seat')
  const before = { ...tomorrow, phase: 'after-immunity' }
  const backing = restore(
    resolveAudienceDecision(before, commandToken(before), { kind: 'hot-seat', reply: 'back' })
  )
  const challenging = restore(
    resolveAudienceDecision(before, commandToken(before), { kind: 'hot-seat', reply: 'challenge' })
  )
  assert.equal(backing.social.at(-1).reaction, 'repaired')
  assert.equal(challenging.social.at(-1).reaction, 'backfired')
  assert.equal(challenging.audience.episode.hotSeat.influenceId, 'noa')
})

test('an on-camera endorsement can decide the Save without seeing any shield holders or roles', () => {
  const start = seed({ publicMode: true, day: 3 })
  const prior = {
    ...start,
    day: 2,
    audience: { ...start.audience, episode: { day: 2, kind: 'wager' } },
  }
  const aired = addAudienceEvents(prior, [
    { kind: 'defend', actorId: 'noa', targetId: 'finn' },
    { kind: 'defend', actorId: 'pax', targetId: 'finn' },
    { kind: 'defend', actorId: 'rey', targetId: 'finn' },
    { kind: 'wager', actorId: 'noa', targetId: 'finn' },
  ])
  const current = openAudienceEpisode({ ...start, audience: aired.audience })
  assert.equal(current.audience.episode.kind, 'save')
  const before = { ...current, phase: 'after-immunity', immunityId: 'rey' }
  const alone = resolveAudienceDecision(before, commandToken(before), { kind: 'save' })
  const endorse = (run) =>
    restore(resolveAudienceDecision(run, commandToken(run), { kind: 'save', guestId: 'pax' }))
  const backed = endorse(before)
  const differentSecrets = {
    ...before,
    private: { ...before.private, betrayers: ['pax', 'noa', 'me'], nightShieldIds: ['finn'] },
  }
  assert.deepEqual(endorse(differentSecrets).audience, backed.audience)
  assert.equal(alone.publicShield.id, 'noa')
  assert.equal(backed.publicShield.id, 'pax')
  assert.equal(eligibleBanishmentTargets(backed, 'me').includes('pax'), false)
  const { shares, reasons } = backed.audience.episode.decision
  assert.equal(Math.round(shares.reduce((sum, entry) => sum + entry.percent, 0) * 10), 1000)
  assert.equal(
    shares.some(({ guestId }) => guestId === 'rey'),
    false
  )
  assert.ok(
    reasons.every((event) =>
      backed.audience.events.some((aired) => JSON.stringify(aired) === JSON.stringify(event))
    )
  )
})

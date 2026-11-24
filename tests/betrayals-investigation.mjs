import assert from 'node:assert/strict'
import { test } from 'node:test'
import { advanceDayBeat } from '../src/betrayals/daySocial.ts'
import { applyGeneralSocialMove } from '../src/betrayals/generalSocial.ts'
import { applyInvestigationAction, observationsRemaining } from '../src/betrayals/investigation.ts'
import {
  caseReports,
  compareReportAccounts,
  investigationPressure,
} from '../src/betrayals/investigationEvidence.ts'
import { investigationFor, isVoteClaim } from '../src/betrayals/investigationRecords.ts'
import { restoreRun, saveRun } from '../src/betrayals/persistence.ts'
import { profileForGuest, pulseView } from '../src/betrayals/pulseView.ts'
import { commandToken, startRun } from '../src/betrayals/run.ts'
import { socialWalletFor } from '../src/betrayals/socialResources.ts'
import {
  recordTableSway,
  resolveTable,
  revealTable,
  tableArgumentPressure,
  tableDiscussion,
  tableSwayResponse,
} from '../src/betrayals/table.ts'

function dawn() {
  const cast = Array.from({ length: 24 }, (_, index) => ({
    id: `guest-${index}`,
    name: `Guest ${index}`,
  }))
  return {
    ...startRun(
      { id: 'human', name: 'Player' },
      cast,
      { publicMode: false, realityMode: 'off' },
      {
        id: 'social-investigation',
        publicSeed: 823,
        roleSeed: 73,
      }
    ),
    phase: 'dawn',
  }
}

function act(run, action) {
  return applyInvestigationAction(run, commandToken(run), action)
}

function restore(run) {
  const stored = new Map()
  const storage = {
    getItem: (key) => stored.get(key),
    setItem: (key, value) => stored.set(key, value),
  }
  saveRun(storage, 'investigation', run)
  const result = restoreRun(storage, 'investigation')
  assert.equal(result.status, 'ready')
  return result.run
}

function friends(run, peerId) {
  const entry = { day: run.day, actorId: run.humanId, recipientId: peerId, kind: 'rapport' }
  return {
    ...run,
    social: [
      ...run.social,
      ...Array(5).fill(entry),
      { ...entry, kind: 'alliance', accepted: true },
    ],
  }
}

test('Social commits stable events and attention drops without replacing the event or revealing private facts', () => {
  const opening = dawn()
  const run = advanceDayBeat(opening)
  assert.equal(run.phase, 'social')
  assert.deepEqual(run.investigation, advanceDayBeat(opening).investigation)
  assert.equal(run.investigation.incidents.length, 24)
  assert.equal(pulseView(run).accounts.length, 0)
  const [first, second, third] = run.investigation.incidents.filter(({ fact }) => isVoteClaim(fact))
  const firstAction = { kind: 'observe', guestId: first.guestId, focus: 'actions' }
  const observed = act(run, firstAction)
  const report = observed.investigation.reports[0]
  assert.equal(report.claim.topicId, first.fact.topicId)
  assert.equal(report.claim.contactId, first.fact.contactId)
  assert.equal(report.nearbyId, first.witnessId)
  assert.equal(
    socialWalletFor(observed, run.humanId).energy,
    socialWalletFor(run, run.humanId).energy - 1
  )
  assert.equal(act(observed, firstAction), observed)
  assert.equal(
    applyInvestigationAction(observed, commandToken(run), {
      ...firstAction,
      guestId: second.guestId,
    }),
    observed
  )
  const reduced = act(observed, { ...firstAction, guestId: second.guestId })
  assert.equal(reduced.investigation.reports[1].claim.behavior, second.fact.behavior)
  assert.equal(reduced.investigation.reports[1].claim.topicId, undefined)
  const brief = restore(act(reduced, { ...firstAction, guestId: third.guestId }))
  assert.equal(brief.investigation.reports[2].claim.behavior, undefined)
  assert.equal(brief.investigation.reports[2].claim.room, third.fact.room)
  assert.equal(observationsRemaining(brief), 0)
  assert.equal(act(brief, { ...firstAction, guestId: first.fact.contactId }), brief)
  assert.ok(pulseView(brief).accounts.every((item) => !Object.hasOwn(item, 'incidentId')))
  const profile = profileForGuest(brief, first.guestId)
  assert.equal(
    profile.metrics.find(({ id }) => id === 'strategy')?.value,
    'Has worked on the vote in private'
  )
})

test('a corroborated observation can reach the table as testimony and influence a ballot', () => {
  let run = advanceDayBeat(dawn())
  const scene = run.investigation.incidents.find(
    ({ fact, witnessId }) => isVoteClaim(fact) && witnessId
  )
  const { guestId, witnessId } = scene
  run = friends(run, witnessId)
  run = act(run, { kind: 'observe', guestId, focus: 'actions' })
  const observed = run.investigation.reports.at(-1)
  run = act(run, { kind: 'ask', guestId, speakerId: witnessId, referenceId: observed.id })
  const testimony = run.investigation.reports.at(-1)
  assert.equal(testimony.access, 'firsthand')
  assert.equal(testimony.claim.topicId, observed.claim.topicId)
  const unstaged = { ...run, phase: 'round-table' }
  const choice = {
    targetId: guestId,
    tone: 'careful',
    investigation: { reportId: testimony.id, witness: true },
  }
  assert.equal(recordTableSway(unstaged, commandToken(unstaged), choice), unstaged)
  assert.equal(
    recordTableSway(unstaged, commandToken(unstaged), { ...choice, targetId: scene.fact.topicId }),
    unstaged
  )
  run = act(unstaged, { kind: 'witness', reportId: testimony.id })
  assert.equal(caseReports(run, guestId)[0].witnessAsked?.accepted, true)
  const ready = restore(recordTableSway(run, commandToken(run), choice))
  const withoutWitness = recordTableSway(run, commandToken(run), {
    ...choice,
    investigation: { reportId: testimony.id },
  })
  assert.ok(
    tableDiscussion(ready).some(
      ({ speakerId, argument }) => speakerId === witnessId && argument.includes('I was there')
    )
  )
  assert.ok(tableSwayResponse(ready).includes(run.seats.find(({ id }) => id === witnessId).name))
  assert.ok(
    !tableDiscussion(withoutWitness).some(({ argument }) => argument.includes('I was there'))
  )
  const strength = (scene, listener) =>
    tableArgumentPressure(scene, listener, [scene.tableArguments.at(-1)]).get(guestId) ?? 0
  const listeners = run.seats.filter(({ id }) => ![run.humanId, guestId, witnessId].includes(id))
  assert.ok(listeners.some(({ id }) => strength(ready, id) > strength(withoutWitness, id)))
  assert.ok(listeners.some(({ id }) => strength(ready, id) === 0))
})

test('comparison uses disclosed provenance and contradictory claims while NPCs use only their own evidence', () => {
  const run = advanceDayBeat(dawn())
  const event = run.investigation.incidents.find(
    ({ fact, witnessId, relayIds }) => isVoteClaim(fact) && witnessId && relayIds.length === 2
  )
  const [left, right] = event.relayIds
  const base = {
    day: run.day,
    method: 'ask',
    access: 'hearsay',
    incidentId: event.id,
    guestId: event.guestId,
    claim: event.fact,
  }
  const a = { ...base, id: 'intel:1', speakerId: left }
  const b = { ...base, id: 'intel:2', speakerId: right }
  assert.match(compareReportAccounts(a, b), /source of at least one account is still unknown/)
  assert.match(
    compareReportAccounts({ ...a, sourceId: event.witnessId }, { ...b, sourceId: event.witnessId }),
    /same person/
  )
  assert.match(
    compareReportAccounts(a, { ...b, claim: { ...event.fact, denies: true } }),
    /disagree/
  )
  const bystander = run.seats.find(
    ({ id }) =>
      ![run.humanId, event.guestId, event.fact.contactId, event.witnessId, left, right].includes(id)
  ).id
  const withReports = { ...run, investigation: { ...run.investigation, reports: [a, b] } }
  assert.deepEqual(
    investigationPressure(withReports, bystander),
    investigationPressure(run, bystander)
  )
  const told = act(withReports, {
    kind: 'share',
    reportId: a.id,
    speakerId: bystander,
    mode: 'attribute',
  })
  const echoed = act(told, {
    kind: 'share',
    reportId: b.id,
    speakerId: bystander,
    mode: 'attribute',
  })
  assert.ok(
    investigationPressure(told, bystander).get(event.guestId) >
      (investigationPressure(run, bystander).get(event.guestId) ?? 0)
  )
  assert.deepEqual(investigationPressure(echoed, bystander), investigationPressure(told, bystander))
})

test('lookouts report once on the next Social phase and personal impressions stay private after a reload', () => {
  const before = advanceDayBeat(dawn())
  const [, { id: guestId }, { id: watcherId }] = before.seats
  let run = act(friends(before, watcherId), { kind: 'watch', guestId, speakerId: watcherId })
  assert.equal(run.investigation.watches[0].status, 'waiting')
  assert.equal(act(run, { kind: 'watch', guestId, speakerId: watcherId }), run)
  run = restore(
    act(run, {
      kind: 'note',
      guestId,
      note: { leaning: 'suspect', text: '  Check their vote.  ', traits: { strategy: 'high' } },
    })
  )
  assert.deepEqual(pulseView(run).notes[guestId], {
    leaning: 'suspect',
    text: 'Check their vote.',
    traits: { strategy: 'high' },
  })
  assert.deepEqual(profileForGuest(run, guestId).metrics, profileForGuest(before, guestId).metrics)
  assert.deepEqual(investigationPressure(before, watcherId), investigationPressure(run, watcherId))
  const next = restore(advanceDayBeat({ ...run, day: 2, phase: 'dawn' }))
  assert.equal(next.investigation.reports.length, 1)
  assert.equal(next.investigation.reports[0].method, 'watch')
  assert.ok(['firsthand', 'unavailable'].includes(next.investigation.reports[0].access))
  assert.equal(observationsRemaining(next), 3)
  assert.equal(
    act(next, { kind: 'share', reportId: 'unearned', speakerId: watcherId, mode: 'attribute' }),
    next
  )
})

test('legacy seasons can create a ledger in Social and only revealed public ballots enter Intel', () => {
  const initial = restore({ ...dawn(), phase: 'social' })
  assert.equal(initial.investigation, undefined)
  const ready = restore(
    act(initial, { kind: 'observe', guestId: initial.seats[1].id, focus: 'contacts' })
  )
  const target = ready.seats[2].id
  const alternate = ready.seats[3].id
  const ballots = ready.seats.map(({ id }) => ({
    voterId: id,
    targetId: id === target ? alternate : target,
  }))
  for (const phase of ['round-table', 'final-banishment']) {
    const table = { ...ready, phase }
    const pending = resolveTable(table, commandToken(table), ballots)
    assert.equal(pending.phase, 'table-reveal')
    assert.equal(pulseView(pending).votes.length, 0)
    const revealed = restore(revealTable(pending, commandToken(pending)))
    assert.equal(investigationFor(revealed).votes.length, phase === 'round-table' ? 1 : 0)
  }
})

test('eavesdropping can pick up the same castle conversations without using an observation slot', () => {
  let withFragment
  for (let publicSeed = 1; publicSeed < 12; publicSeed++) {
    const run = advanceDayBeat({ ...dawn(), publicSeed })
    const next = applyGeneralSocialMove(run, commandToken(run), 'eavesdrop')
    if (next.investigation.reports.length) {
      withFragment = next
      break
    }
  }
  assert.ok(withFragment)
  const run = restore(withFragment)
  const report = run.investigation.reports[0]
  const incident = run.investigation.incidents.find(({ id }) => id === report.incidentId)
  assert.equal(report.method, 'eavesdrop')
  assert.equal(report.claim.topicId, incident.fact.topicId)
  assert.equal(report.claim.contactId, undefined)
  assert.equal(run.social.at(-1).suspectId, report.claim.topicId)
  assert.equal(observationsRemaining(run), 3)
})

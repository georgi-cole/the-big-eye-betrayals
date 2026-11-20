import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  acknowledgeRole,
  advancePreparation,
  commandToken,
  startRun,
} from '../src/betrayals/run.ts'
import { resolveEndVote } from '../src/betrayals/settlement.ts'
import { awardPublicShield } from '../src/betrayals/publicShield.ts'
import { applySocialMove, getSocialView } from '../src/betrayals/social.ts'
import { recordSocialWallet, socialWalletFor } from '../src/betrayals/socialResources.ts'
import { tableTargets } from '../src/betrayals/table.ts'

function createRun() {
  const run = startRun(
    { id: 'human', name: 'Human' },
    Array.from({ length: 24 }, (_, i) => ({ id: 'ai-' + i, name: 'Player ' + i })),
    { publicMode: true, realityMode: 'tv' },
    { id: 'endgame', roleSeed: 133, publicSeed: 1142 }
  )
  const dawn = acknowledgeRole(run, commandToken(run))
  return advancePreparation(dawn, commandToken(dawn))
}

test('private social activity has a budget and accepted deals require rapport', () => {
  let run = createRun()
  const [actor, peer, suspect, bystander] = run.seats
  run = { ...run, socialWallets: recordSocialWallet(run, actor.id, { influence: 50, info: 100 }) }
  const rapport = { actorId: actor.id, recipientId: peer.id, kind: 'rapport' }
  const deal = { ...rapport, kind: 'vote-plan', suspectId: suspect.id }
  run = applySocialMove(run, commandToken(run), deal)
  assert.equal(getSocialView(run, peer.id)[0].accepted, false)
  run = applySocialMove(run, commandToken(run), rapport)
  run = applySocialMove(run, commandToken(run), deal)
  assert.equal(getSocialView(run, peer.id)[2].accepted, true)
  assert.deepEqual(getSocialView(run, bystander.id), [])
  assert.equal(socialWalletFor(run, actor.id).energy, 0)
  assert.strictEqual(applySocialMove(run, commandToken(run), deal), run)
})

test('full immunity and yesterday’s Public Shield both advance the award down the approval ranking', () => {
  const base = createRun()
  const [immune, priorWinner, nextWinner, other] = base.seats
  const run = {
    ...base,
    day: 2,
    phase: 'round-table',
    immunityId: immune.id,
    publicShield: { id: priorWinner.id, day: 1 },
  }
  const settled = awardPublicShield(run, commandToken(run), {
    [immune.id]: 100,
    [priorWinner.id]: 99,
    [nextWinner.id]: 98,
  })
  assert.equal(settled.publicShield.id, nextWinner.id)
  assert.ok(!tableTargets(settled, other.id).includes(nextWinner.id))
  assert.ok(tableTargets(settled, nextWinner.id).includes(other.id))
  assert.strictEqual(awardPublicShield(settled, commandToken(settled), {}), settled)
})

test('one banish vote continues and a unanimous mixed finish pays only the surviving Betrayers', () => {
  const base = createRun()
  const betrayers = base.private.betrayers.slice(0, 2)
  const loyals = base.seats.filter(({ id }) => !base.private.betrayers.includes(id)).slice(0, 2)
  const active = [...betrayers, ...loyals.map(({ id }) => id)]
  const endgame = {
    ...base,
    phase: 'end-vote',
    pot: 1451,
    seats: base.seats.map((seat) =>
      active.includes(seat.id) ? seat : { ...seat, exit: { cause: 'banished', day: 1 } }
    ),
  }
  const token = commandToken(endgame)
  const votes = active.map((voterId) => ({ voterId, choice: 'end' }))
  const continued = resolveEndVote(endgame, token, [
    { ...votes[0], choice: 'banish' },
    ...votes.slice(1),
  ])
  assert.equal(continued.phase, 'final-banishment')
  const settled = resolveEndVote(endgame, token, votes)
  assert.equal(settled.result.winningRole, 'betrayer')
  assert.deepEqual(new Set(Object.keys(settled.result.payouts)), new Set(betrayers))
  assert.equal(
    Object.values(settled.result.payouts).reduce((sum, payout) => sum + payout, 0),
    1451
  )
  assert.strictEqual(resolveEndVote(settled, token, votes), settled)
})

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { advanceDayAftermath } from '../src/betrayals/dayAftermath.ts'
import { CASTLE_ROLE_PLAYTEST } from '../src/betrayals/castleRoles.ts'
import {
  dayCastleRole,
  resolveDayCastleRole,
  resolveDeparturePower,
} from '../src/betrayals/castleRoleEvents.ts'
import { advanceDayBeat } from '../src/betrayals/daySocial.ts'
import { openDayFlow } from '../src/betrayals/dayFlow.ts'
import { challengeContestantIds, resolveChallenge } from '../src/betrayals/challenges.ts'
import {
  getConclaveView,
  nightCastleRoleFor,
  resolveConclave,
  resolveNightCastleRole,
  revealDawn,
} from '../src/betrayals/night.ts'
import { getIncomingInteractions, respondToIncomingInteraction } from '../src/betrayals/incoming.ts'
import { answerRecruitment, recruitmentFor } from '../src/betrayals/recruitment.ts'
import { acknowledgeRole, commandToken, startRun } from '../src/betrayals/run.ts'
import { resolveEndVote } from '../src/betrayals/settlement.ts'
import { restoreRun, saveRun } from '../src/betrayals/persistence.ts'
import {
  advanceTableRound,
  buildTableBallots,
  mayorChoiceFor,
  recordTableSway,
  resolveMayorChoice,
  resolveTable,
  revealTable,
  tableDiscussionOpen,
  tableTargets,
} from '../src/betrayals/table.ts'

const guests = Array.from({ length: 24 }, (_, index) => ({
  id: `ai-${index}`,
  name: `Guest ${index}`,
}))

function advance(run) {
  const token = commandToken(run)
  const incoming = getIncomingInteractions(run).find(
    ({ required, response }) => required && !response
  )
  if (incoming) return respondToIncomingInteraction(run, token, incoming.id, 'dismiss')
  const human = run.humanId
  if (run.private.departurePower) {
    return resolveDeparturePower(run, token, run.seats.find(({ exit }) => !exit)?.id)
  }
  switch (run.phase) {
    case 'role-reveal':
      return openDayFlow(acknowledgeRole(run, token))
    case 'dawn':
    case 'social': {
      const power = dayCastleRole(run, human)
      if (power) return resolveDayCastleRole(run, token, power.roleId, power.targets[0])
      return advanceDayBeat(run)
    }
    case 'immunity':
    case 'safety':
    case 'final-challenge':
      return resolveChallenge(
        run,
        token,
        challengeContestantIds(run).map((contestantId, index) => ({
          contestantId,
          score: 100 - index,
          potContribution: 0.5,
        }))
      )
    case 'after-immunity':
    case 'shield-deals':
    case 'cocktail':
      return advanceDayAftermath(run, token)
    case 'round-table':
    case 'final-banishment':
      if (run.tableCount) return advanceTableRound(run, token)
      if (tableDiscussionOpen(run)) return recordTableSway(run, token, null)
      if (mayorChoiceFor(run, human)) return resolveMayorChoice(run, token, true)
      return resolveTable(run, token, buildTableBallots(run, tableTargets(run, human)[0]))
    case 'table-reveal':
      return revealTable(run, token)
    case 'night': {
      const role = nightCastleRoleFor(run, human)
      if (role)
        return resolveNightCastleRole(
          run,
          token,
          role.roleId === 'columbus' ? role.targetIds.slice(0, 5) : (role.targetIds?.[0] ?? true)
        )
      const recruitment = recruitmentFor(run, human)
      if (recruitment?.kind === 'offer') return answerRecruitment(run, token, true)
      const targets =
        recruitment?.kind === 'choose'
          ? recruitment.targetIds
          : getConclaveView(run, human)?.targetIds
      return resolveConclave(run, token, targets?.[0])
    }
    case 'night-resolved':
      return openDayFlow(revealDawn(run, token))
    case 'end-vote':
      return resolveEndVote(
        run,
        token,
        run.seats.filter(({ exit }) => !exit).map(({ id }) => ({ voterId: id, choice: 'end' }))
      )
    default:
      return run
  }
}

for (const role of CASTLE_ROLE_PLAYTEST) {
  test(`a ${role} playtest season can be saved and played from role reveal to settlement`, () => {
    let run = openDayFlow(
      startRun(
        { id: 'human', name: 'Player' },
        guests,
        { publicMode: false, realityMode: 'off', castleRoles: true },
        { id: `preview-${role}`, publicSeed: 728, roleSeed: 11, previewCastleRole: role }
      )
    )
    for (let step = 0; step < 500 && !run.result; step++) {
      const next = advance(run)
      assert.notEqual(next, run, `Day ${run.day} stalled in ${run.phase}`)
      let saved
      const storage = { setItem: (_key, value) => (saved = value), getItem: () => saved }
      saveRun(storage, 'preview', next)
      const restored = restoreRun(storage, 'preview')
      assert.equal(restored.status, 'ready', `Day ${next.day} failed to restore in ${next.phase}`)
      run = restored.run
    }
    assert.equal(run.phase, 'settled')
    assert.equal(run.private.castleRoles.length, 3)
    const card = run.private.castleRoles.find(({ guestId }) => guestId === run.humanId)
    assert.equal(card.roleId, role)
  })
}

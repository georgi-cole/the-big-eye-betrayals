import { REALITY_PRESET_TUNING } from '../modes/realityMode'
import { mulberry32, seededPickN } from '../store/rng'
import { advancePreparation, commandToken, eligibleBanishmentTargets } from './run'
import type { Run } from './run'
import { applySocialMove, getSocialView, rapport } from './social'
import { chooseTarget, resolutionPerspective } from './strategy'

function prepareLead(run: Run): Run {
  if (run.phase !== 'social' || run.witnessLead?.day === run.day) return run
  if (run.seats.find((seat) => seat.id === run.humanId)?.exit) return run
  const guests = run.seats.filter(({ id, exit }) => !exit && id !== run.humanId)
  if (guests.length < 5) return run

  const random = mulberry32(run.publicSeed ^ Math.imul(run.day, 2347))
  // Leave room for ordinary vote planning and quieter days between disputes.
  if (run.witnessLead && (run.witnessLead.day === run.day - 1 || random() < 0.26)) return run
  const [speaker] = seededPickN(random, guests, 1)
  const targets = eligibleBanishmentTargets(run, speaker.id).filter((id) => id !== run.humanId)
  const pitchId = chooseTarget(resolutionPerspective(run, speaker.id, targets), 'table')
  if (!pitchId) return run
  const contacts = seededPickN(
    random,
    guests.filter(({ id }) => id !== speaker.id && id !== pitchId),
    guests.length - 2
  )
  contacts.sort(
    (a, b) =>
      rapport(run.social, speaker.id, b.id) +
      rapport(run.social, run.humanId, b.id) -
      rapport(run.social, speaker.id, a.id) -
      rapport(run.social, run.humanId, a.id)
  )
  const [source, witness, relay] = contacts
  return {
    ...run,
    revision: run.revision + 1,
    witnessLead: {
      day: run.day,
      suspectId: speaker.id,
      pitchId,
      sourceId: source.id,
      witnessId: witness.id,
      relayId: relay.id,
    },
  }
}

export function advanceDayBeat(run: Run): Run {
  if (run.phase === 'dawn') return prepareLead(advancePreparation(run, commandToken(run)))
  if (run.phase !== 'social') return run
  let active = run
  const preset = run.options.realityMode
  const rng = mulberry32(run.publicSeed ^ (run.day * 917))
  const seats = run.seats.filter(({ exit }) => !exit)
  const actors = seats.filter(({ id }) => id !== run.humanId)
  const count =
    preset === 'off' ? 1 : Math.round(3 * REALITY_PRESET_TUNING[preset].arcIntensityMultiplier)
  for (const actor of seededPickN(rng, actors, Math.min(actors.length, count))) {
    const conversations = getSocialView(active, actor.id)
    const contacts = seededPickN(rng, actors, actors.length).filter(({ id }) => id !== actor.id)
    const recipient = contacts.sort(
      (left, right) =>
        rapport(conversations, actor.id, right.id) - rapport(conversations, actor.id, left.id)
    )[0]
    if (!recipient) continue
    const targets = seats
      .filter(({ id }) => id !== actor.id && id !== recipient.id)
      .map(({ id }) => id)
    const suspectId = chooseTarget(resolutionPerspective(active, actor.id, targets), 'table')
    active = applySocialMove(active, commandToken(active), {
      actorId: actor.id,
      recipientId: recipient.id,
      kind: 'question',
      suspectId,
    })
  }
  return advancePreparation(active, commandToken(active))
}

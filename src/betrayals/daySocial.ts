import { REALITY_PRESET_TUNING } from '../modes/realityMode.ts'
import { getSocialPersonality } from '../social/socialPersonalityBank.ts'
import { mulberry32, seededPickN } from '../store/rng.ts'
import { openInvestigationDay } from './castleIncidents.ts'
import { advancePreparation, commandToken, eligibleBanishmentTargets } from './run.ts'
import type { Run } from './run.ts'
import { relationship } from './perception.ts'
import { applySocialMove, getSocialView, hasAlliance, hasSocialStrain } from './social.ts'
import type { SocialMove } from './social.ts'
import { chooseTarget, resolutionPerspective } from './strategy.ts'

export function advanceDayBeat(run: Run): Run {
  if (run.phase === 'dawn') return openInvestigationDay(advancePreparation(run, commandToken(run)))
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
    const personality = getSocialPersonality(actor.id)
    // Actors approach the human through their incoming conversations, where the player can answer.
    const contacts = actors
      .filter(({ id }) => id !== actor.id)
      .map(({ id }) => ({
        id,
        ...relationship(conversations, actor.id, id),
        chanceToTalk: rng() * 0.32,
      }))
    contacts.sort(
      (a, b) =>
        b.bond +
        b.reliability * 0.5 +
        b.chanceToTalk -
        a.bond -
        a.reliability * 0.5 -
        a.chanceToTalk
    )
    const contact = contacts[0]
    if (!contact) continue
    const recipientId = contact.id
    const targets = eligibleBanishmentTargets(active, actor.id).filter((id) => id !== recipientId)
    const perspective = resolutionPerspective(active, actor.id, targets)
    const suspectId = chooseTarget(perspective, 'case')
    const proposed = conversations
      .filter(
        (entry) =>
          entry.actorId === recipientId &&
          entry.recipientId === actor.id &&
          entry.suspectId &&
          targets.includes(entry.suspectId) &&
          entry.day >= active.day - 1 &&
          (entry.kind === 'share-suspicion' || entry.kind === 'question')
      )
      .at(-1)?.suspectId
    const defends = proposed && relationship(conversations, actor.id, proposed).bond > 0.24
    const roll = rng()
    const options: SocialMove[] = []
    const offer = (kind: SocialMove['kind'], subject?: string) =>
      options.push({ actorId: actor.id, recipientId, kind, suspectId: subject })

    if (hasSocialStrain(conversations, actor.id, recipientId) && roll < personality.forgiveness) {
      offer('mend-fences')
    }
    if (defends && roll < personality.loyalty) offer('defend-guest', proposed)
    if (contact.bond > 0.15 && roll < 0.2 + personality.strategicCalculation * 0.35) {
      const targetId = chooseTarget(perspective, 'table')
      if (targetId) offer('vote-plan', targetId)
    }
    if (contact.bond >= 0.12 && !hasAlliance(conversations, actor.id, recipientId) && roll < 0.48) {
      offer('alliance')
    }
    if (suspectId && contact.bond > 0 && roll < 0.22 + personality.gossipPropensity * 0.42) {
      offer('share-suspicion', suspectId)
    }
    if (contact.bond < 0.12 && roll < 0.24 + personality.warmth * 0.42) offer('rapport')
    if (suspectId) offer('question', suspectId)
    for (const move of options) {
      const next = applySocialMove(active, commandToken(active), move)
      if (next === active) continue
      active = next
      break
    }
  }
  return advancePreparation(active, commandToken(active))
}

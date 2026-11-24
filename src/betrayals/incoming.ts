import { getVoiceProfile, pickVariantText } from '../social/interactionVariantBank.ts'
import type { VariantFamily, VoiceTag } from '../social/interactionVariantBank.ts'
import { SOCIAL_RESOURCE_CALIBRATION as calibration } from '../social/socialResourceCalibration.ts'
import { mulberry32 } from '../store/rng.ts'
import {
  gaveNightShieldToday,
  nightShieldWindowOpen,
  reactionToShieldClaim,
} from './nightShields.ts'
import { INCOMING_ANSWERS, isCurrentCommand, publicNightShieldWinners } from './run.ts'
import type { CommandToken, Contestant, IncomingAnswer, Run, SocialEntry } from './run.ts'
import { respondToShieldFollowUp, shieldFollowUpFor } from './shieldSocial.ts'
import type { ShieldFollowUpAction } from './shieldSocial.ts'
import { getSocialView, hasAlliance, rapport } from './social.ts'
import { recordSocialWallet } from './socialResources.ts'
import { chooseTarget, resolutionPerspective } from './strategy.ts'
import { tableDiscussionOpen } from './table.ts'

type OrdinaryEncounter = 'confidence' | 'alliance' | 'vote-plan'
type EncounterKind = OrdinaryEncounter | 'shield-question' | 'shield-message' | 'shield-gift'
export type IncomingAction = IncomingAnswer | ShieldFollowUpAction

export type IncomingInteraction = {
  id: string
  kind: EncounterKind
  speaker: Contestant
  target?: Contestant
  text: string
  response?: IncomingAnswer
  shieldFollowUp?: ReturnType<typeof shieldFollowUpFor>
}

function family(
  id: string,
  voiceTags: VoiceTag[],
  texts: string[],
  isFollowUp = false
): VariantFamily {
  return { id, voiceTags, variants: texts.map((text) => ({ text, voiceTags })), isFollowUp }
}

const lines: Record<
  OrdinaryEncounter | 'shield-question' | 'public-shield-question',
  VariantFamily[]
> = {
  confidence: [
    family(
      'confidence-direct',
      ['direct', 'composed'],
      [
        'Can we take a turn around the gallery? I want to talk away from the rest of the room.',
        'Everyone talks louder when the doors open. I would rather hear what you think one on one.',
      ]
    ),
    family(
      'confidence-warm',
      ['emotional', 'sincere'],
      [
        'I could use a friendly face for a minute. Would you walk with me?',
        'I saw you across the room and figured we could both use a quieter conversation.',
      ]
    ),
    family(
      'confidence-followup',
      ['soft', 'indirect'],
      [
        'I thought about our last conversation. Come sit for a minute?',
        'I meant what I said last time. We should keep talking while we can.',
      ],
      true
    ),
  ],
  alliance: [
    family(
      'alliance-direct',
      ['direct', 'strategic'],
      [
        'I want someone to check my thinking before the next vote. If you can do that for me, I can do it for you.',
        'Let us compare notes before someone else writes our story for us.',
      ]
    ),
    family(
      'alliance-warm',
      ['sincere', 'soft'],
      [
        'It feels easier to talk to you than anyone else here. Would you be willing to look out for each other?',
        'I keep coming back to what you told me. I would like us to work together.',
      ]
    ),
  ],
  'vote-plan': [
    family(
      'vote-direct',
      ['direct', 'strategic'],
      [
        'I am leaning toward {target}. If you see the same thing I do, we can go into the vote together.',
        'I want to vote for {target}. I am telling you first because I could use a second voice.',
      ]
    ),
    family(
      'vote-warm',
      ['emotional', 'indirect'],
      [
        'I could be missing something, but I keep coming back to {target}. Would you put your name beside mine?',
        'I have not told anyone else this yet. I think we should look at {target} together.',
      ]
    ),
    family(
      'vote-followup',
      ['soft', 'indirect'],
      [
        'I kept turning over what we talked about. For me, it still comes down to {target}. Are you with me?',
        'We agreed to keep each other in the loop. The name I keep hearing is {target}. I am considering it.',
      ],
      true
    ),
  ],
  'shield-question': [
    family(
      'shield-direct',
      ['direct', 'strategic'],
      [
        'Before we vote, do you have a Night Shield?',
        'If things go badly tonight, are you covered? Did you get a Night Shield?',
      ]
    ),
    family(
      'shield-private',
      ['sincere', 'indirect'],
      [
        'Can I ask you something in private? Are you holding one of the Night Shields?',
        'It’s hard to tell who’s safe tonight. Do you have a Night Shield?',
      ]
    ),
  ],
  'public-shield-question': [
    family(
      'public-shield-direct',
      ['direct', 'strategic'],
      [
        'I saw you win a Night Shield. Are you keeping it for tonight?',
        'You won a shield out there. Do you still have it?',
      ]
    ),
    family(
      'public-shield-private',
      ['sincere', 'indirect'],
      [
        'Can I ask you something in private? Did you keep the Night Shield you won?',
        'I saw you win a shield. Between us, are you still covered tonight?',
      ]
    ),
  ],
}

function shieldInteractions(run: Run): IncomingInteraction[] {
  if (!['round-table', 'table-reveal', 'night', 'night-resolved'].includes(run.phase)) return []
  const guests = new Map(run.seats.map((seat) => [seat.id, seat]))
  const messages: IncomingInteraction[] = []
  for (const entry of run.social) {
    if (entry.day !== run.day || entry.recipientId !== run.humanId) continue
    const seat = guests.get(entry.actorId)
    if (!seat) continue
    let text: string
    switch (entry.kind) {
      case 'shield-gift':
        text = 'I’ve given you one of my Night Shields. It’s yours for tonight.'
        if (entry.reaction === 'uncertain' || entry.reaction === 'backfired') {
          text = 'I know I said I had no Night Shield earlier. Here. Take this one.'
        }
        break
      case 'shield-claim':
        text = 'Between us, I have a Night Shield.'
        break
      case 'shield-deny':
        text = 'I wanted you to know I don’t have a Night Shield.'
        break
      case 'shield-tip': {
        const subject = guests.get(entry.suspectId ?? '')
        if (!subject) continue
        text = `I heard ${subject.name} ${entry.shieldReply === 'has' ? 'might have' : 'might be without'} a Night Shield.`
        break
      }
      default:
        continue
    }
    const id = `${entry.day}:shield-note:${messages.length + 1}`
    messages.push({
      id,
      kind: entry.kind === 'shield-gift' ? 'shield-gift' : 'shield-message',
      speaker: { id: seat.id, name: seat.name, portrait: seat.portrait },
      text,
      response: run.incomingResponses?.[id],
      ...(entry.kind === 'shield-claim' && { shieldFollowUp: shieldFollowUpFor(run, seat.id) }),
    })
  }

  if (!nightShieldWindowOpen(run)) return messages
  const random = mulberry32(run.publicSeed ^ Math.imul(run.day, 6733))
  const earlier = run.social.filter(({ day }) => day < run.day)
  const contact = run.seats
    .filter(({ id, exit }) => !exit && id !== run.humanId)
    .map((seat) => ({ seat, initiative: random() + rapport(earlier, seat.id, run.humanId) * 0.55 }))
    .sort((a, b) => b.initiative - a.initiative)[0]?.seat
  if (!contact) return messages
  const id = `${run.day}:shield-question`
  if (
    !run.incomingResponses?.[id] &&
    gaveNightShieldToday(run.social, run.humanId, contact.id, run.day)
  )
    return messages
  const question = publicNightShieldWinners(run).includes(run.humanId)
    ? 'public-shield-question'
    : 'shield-question'
  const { text } = pickVariantText(
    lines[question],
    getVoiceProfile(contact.id),
    new Set(),
    0,
    random
  )
  return [
    ...messages,
    {
      id,
      kind: 'shield-question',
      speaker: { id: contact.id, name: contact.name, portrait: contact.portrait },
      text,
      response: run.incomingResponses?.[id],
    },
  ]
}

/** Rebuild a day's delivery slots from the same public state after a reload or response. */
export function getIncomingInteractions(run: Run): IncomingInteraction[] {
  if (!run.seats.some(({ id, exit }) => id === run.humanId && !exit)) return []
  const shields = shieldInteractions(run)
  if (run.phase !== 'social' && !tableDiscussionOpen(run)) return shields

  const atTable = run.phase === 'round-table'
  const random = mulberry32(
    run.publicSeed ^ Math.imul(run.day, 641) ^ (atTable ? 0x23456 : 0x86273)
  )
  const earlier = run.social.filter(({ day }) => day < run.day)
  const earlierRun = { ...run, social: earlier }
  const active = run.seats.filter(({ id, exit }) => id !== run.humanId && !exit)
  const speakers = active
    .map((speaker) => {
      const trust = rapport(earlier, run.humanId, speaker.id)
      return { speaker, trust, initiative: random() + trust * 0.4 }
    })
    .sort((first, second) => second.initiative - first.initiative)
  const count = atTable || run.options.realityMode === 'off' ? 1 : 2

  const ordinary = speakers.slice(0, count).map(({ speaker, trust }, index) => {
    const id = `${run.day}:${run.phase}:${index + 1}`
    const prior = getSocialView(earlierRun, speaker.id)
    const hasTalked = prior.some(
      ({ actorId, recipientId }) => actorId === run.humanId || recipientId === run.humanId
    )
    let kind: OrdinaryEncounter = 'confidence'
    if (!atTable && index === 1) kind = 'vote-plan'
    else if (!atTable && trust >= 0.12 && !hasAlliance(earlier, run.humanId, speaker.id))
      kind = 'alliance'

    const candidates = active.filter(({ id }) => id !== speaker.id)
    const targetId =
      kind === 'vote-plan' &&
      chooseTarget(
        {
          ...resolutionPerspective(
            earlierRun,
            speaker.id,
            candidates.map(({ id }) => id)
          ),
          ownConversations: prior,
        },
        'table'
      )
    const target = candidates.find(({ id }) => id === targetId)
    if (kind === 'vote-plan' && !target) kind = 'confidence'
    const voice = getVoiceProfile(speaker.id)
    const { text } = pickVariantText(lines[kind], voice, new Set(), Number(hasTalked), random)
    return {
      id,
      kind,
      speaker: { id: speaker.id, name: speaker.name, portrait: speaker.portrait },
      target: target && { id: target.id, name: target.name, portrait: target.portrait },
      text: text.replace('{target}', () => target?.name ?? 'that guest'),
      response: run.incomingResponses?.[id],
    }
  })
  return [...shields, ...ordinary]
}

function responseEntry(
  run: Run,
  encounter: IncomingInteraction,
  answer: IncomingAnswer
): SocialEntry | undefined {
  const { kind, speaker, target } = encounter
  const participants = { day: run.day, actorId: speaker.id, recipientId: run.humanId }
  if (kind === 'shield-question') {
    const entry: SocialEntry = {
      ...participants,
      kind: 'ask-shield',
      shieldReply: answer === 'engage' ? 'has' : answer === 'listen' ? 'none' : 'private',
    }
    const reaction = reactionToShieldClaim(run, entry)
    return reaction ? { ...entry, reaction } : entry
  }
  if (answer === 'dismiss' || kind === 'shield-message' || kind === 'shield-gift') return
  if (kind === 'vote-plan' && target) {
    return answer === 'engage'
      ? { ...participants, kind: 'vote-plan', suspectId: target.id, accepted: true }
      : { ...participants, kind: 'question', suspectId: target.id }
  }
  if (answer === 'listen') return
  if (kind === 'confidence') return { ...participants, kind: 'rapport' }
  if (!hasAlliance(run.social, speaker.id, run.humanId)) {
    return { ...participants, kind: 'alliance', accepted: true }
  }
}

export function respondToIncomingInteraction(
  run: Run,
  token: CommandToken,
  interactionId: string,
  answer: IncomingAction
): Run {
  if (!isCurrentCommand(run, token)) return run
  const encounter = getIncomingInteractions(run).find(({ id }) => id === interactionId)
  if (!encounter) return run
  if (answer === 'request-shield' || answer === 'ask-shield-plans') {
    if (!encounter.shieldFollowUp || encounter.response === 'dismiss') return run
    const next = respondToShieldFollowUp(run, encounter.speaker.id, answer)
    if (next === run || encounter.response) return next
    return {
      ...next,
      incomingResponses: { ...next.incomingResponses, [interactionId]: 'engage' },
    }
  }
  if (!INCOMING_ANSWERS.includes(answer) || encounter.response) return run
  const entry = responseEntry(run, encounter, answer)
  const socialWallets =
    entry?.kind === 'alliance'
      ? recordSocialWallet(run, run.humanId, {
          influence: calibration.relationships.allianceInfluence,
        })
      : entry?.kind === 'question'
        ? recordSocialWallet(run, run.humanId, { info: calibration.incoming.credibleInfo })
        : run.socialWallets
  return {
    ...run,
    revision: run.revision + 1,
    social: entry ? [...run.social, entry] : run.social,
    socialWallets,
    incomingResponses: { ...run.incomingResponses, [interactionId]: answer },
  }
}

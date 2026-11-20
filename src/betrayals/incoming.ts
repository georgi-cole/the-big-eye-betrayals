import { getVoiceProfile, pickVariantText } from '../social/interactionVariantBank.ts'
import type { VariantFamily, VoiceTag } from '../social/interactionVariantBank.ts'
import { mulberry32 } from '../store/rng.ts'
import { INCOMING_ANSWERS, isCurrentCommand } from './run.ts'
import type { CommandToken, Contestant, IncomingAnswer, Run, SocialEntry } from './run.ts'
import { getSocialView, hasAlliance, rapport } from './social.ts'
import { chooseTarget } from './strategy.ts'
import { tableDiscussionOpen, tableTargets } from './table.ts'

type EncounterKind = 'confidence' | 'alliance' | 'vote-plan'

export type IncomingInteraction = {
  id: string
  kind: EncounterKind
  speaker: Contestant
  target?: Contestant
  text: string
  response?: IncomingAnswer
}

function family(
  id: string,
  voiceTags: VoiceTag[],
  texts: string[],
  isFollowUp = false
): VariantFamily {
  return { id, voiceTags, variants: texts.map((text) => ({ text, voiceTags })), isFollowUp }
}

const lines: Record<EncounterKind, VariantFamily[]> = {
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
}

/** Rebuild a day's delivery slots from the same public state after a reload or response. */
export function getIncomingInteractions(run: Run): IncomingInteraction[] {
  if (
    (run.phase !== 'social' && !tableDiscussionOpen(run)) ||
    !run.seats.some(({ id, exit }) => id === run.humanId && !exit)
  )
    return []

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

  return speakers.slice(0, count).map(({ speaker, trust }, index) => {
    const id = `${run.day}:${run.phase}:${index + 1}`
    const prior = getSocialView(earlierRun, speaker.id)
    const hasTalked = prior.some(
      ({ actorId, recipientId }) => actorId === run.humanId || recipientId === run.humanId
    )
    let kind: EncounterKind = 'confidence'
    if (atTable || index === 1) kind = 'vote-plan'
    else if (trust >= 0.12 && !hasAlliance(earlier, run.humanId, speaker.id)) kind = 'alliance'

    const voteTargets = atTable ? new Set(tableTargets(run, speaker.id)) : undefined
    const candidates = active.filter(
      ({ id }) => id !== speaker.id && (!voteTargets || voteTargets.has(id))
    )
    const targetId =
      kind === 'vote-plan' &&
      chooseTarget(
        {
          actorId: speaker.id,
          role: 'loyal',
          teammates: [],
          day: run.day,
          phase: run.phase,
          seed: run.publicSeed,
          eligibleIds: candidates.map(({ id }) => id),
          ownConversations: prior,
          publicTally: run.lastTable?.tally ?? {},
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
}

function responseEntry(
  run: Run,
  encounter: IncomingInteraction,
  answer: IncomingAnswer
): SocialEntry | undefined {
  const { kind, speaker, target } = encounter
  if (answer === 'dismiss') return
  const participants = { day: run.day, actorId: speaker.id, recipientId: run.humanId }
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
  answer: IncomingAnswer
): Run {
  if (!isCurrentCommand(run, token) || !INCOMING_ANSWERS.includes(answer)) return run
  const encounter = getIncomingInteractions(run).find(({ id }) => id === interactionId)
  if (!encounter || encounter.response) return run
  const entry = responseEntry(run, encounter, answer)
  return {
    ...run,
    revision: run.revision + 1,
    social: entry ? [...run.social, entry] : run.social,
    incomingResponses: { ...run.incomingResponses, [interactionId]: answer },
  }
}

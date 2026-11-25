import { getVoiceProfile, pickVariantText } from '../social/interactionVariantBank.ts'
import type { VariantFamily, VoiceTag } from '../social/interactionVariantBank.ts'
import { mulberry32 } from '../store/rng.ts'
import { hashId } from './run.ts'
import type { Run, TableArgument } from './run.ts'

function pool(id: string, direct: string[], measured: string[], personal: string[]) {
  const family = (voice: string, voiceTags: VoiceTag[], lines: string[]): VariantFamily => ({
    id: `table-${id}-${voice}`,
    voiceTags,
    variants: lines.map((text) => ({ text, voiceTags })),
  })
  return [
    family('direct', ['direct', 'blunt'], direct),
    family('measured', ['composed', 'strategic'], measured),
    family('personal', ['sincere', 'soft', 'emotional'], personal),
  ]
}

const dialogue = {
  question: pool(
    'open-question',
    [
      '{target}, who would you put down right now? Give me the reason, too.',
      'What would actually make you write a name tonight, {target}?',
      'I keep hearing what everyone else thinks. {target}, where are you leaning?',
    ],
    [
      'Before we all get attached to one story, I want to hear {target}’s read of the room.',
      '{target}, what are you most sure of? And what could still change your mind?',
      'I haven’t settled my vote. {target}, what’s the strongest reason for yours?',
    ],
    [
      'I could be missing something, {target}. Tell me how you’ve seen today.',
      'I’d rather ask you here, {target}. Is there someone you’ve been worried about?',
      '{target}, you can disagree with me. I’d still like to hear where you’re at.',
    ]
  ),
  heardQuestion: pool(
    'heard-question',
    [
      '{target}’s name came up privately. Can anyone here give me something I can check?',
      'I heard a concern about {target}. Who can give us a reason to write that name?',
      'People are discussing {target} off the record. Which part are they willing to say here?',
    ],
    [
      'One private conversation put {target} on my list. I’d like a second account.',
      'Someone mentioned {target} to me. Is that a separate suspicion, or are we all hearing the same one?',
      'A concern about {target} came up earlier. Does anyone here share it?',
    ],
    [
      'I heard your name away from the table, {target}. I want to hear your side before I decide.',
      'I’m uneasy passing along something I only heard in private about {target}. Who can clear it up?',
      '{target}, I’ve heard a concern about you. What would you want this room to understand?',
    ]
  ),
  ballotQuestion: pool(
    'ballot-question',
    [
      '{target}, you had votes last time. What do you think people got wrong?',
      'For anyone who voted for {target}, what still holds up today?',
      'Before we vote again, can someone explain the last vote for {target}?',
    ],
    [
      'We saw names go down for {target}. I’d like to separate the reasons from the tally.',
      'The last ballot put {target} under pressure. Has anyone who voted that way reconsidered?',
      'Was the last vote about {target}, or was it about where everyone else was heading?',
    ],
    [
      '{target}, I’d like to hear how you felt about the last ballot before we do this again.',
      'It’s easy to read too much into the tally. {target}, what did it tell you?',
      'I don’t want you to have to guess, {target}. Would someone who voted for you tell us why?',
    ]
  ),
  votedForMe: pool(
    'voted-for-me',
    [
      'You wrote my name last time, {target}. What made you do it?',
      '{target}, I saw that ballot. I’d like you to put the reason on the table, too.',
      'Was that vote for me your call, {target}, or did someone bring you around?',
    ],
    [
      'I want to start with a vote I can point to. {target} voted for me. I’m asking what that was based on.',
      'The ballot tells me {target} voted for me. It doesn’t tell me the reasoning.',
      '{target}, if the reasoning behind your vote for me still stands, spell it out for everyone.',
    ],
    [
      'I was surprised to see you vote for me, {target}. I’d like to hear it from you.',
      'Your vote for me has been on my mind, {target}. Was there something I missed?',
      'I can take having my name written down, {target}. I want to understand why you did it.',
    ]
  ),
  defend: pool(
    'defence',
    [
      'I’m not putting {target} down on what we’ve heard so far.',
      'That’s a leap. Give me one solid reason to vote for {target}.',
      'I’m looking elsewhere tonight. Nothing I’ve heard puts {target} at the top for me.',
    ],
    [
      'I can see another explanation. I want to give {target} room to answer.',
      'The case against {target} still has a gap. What would make it stronger?',
      'Before we put {target} on the ballot, what part of this couldn’t fit a Loyal?',
    ],
    [
      'Hold on. I want {target} to be able to answer without everyone talking over them.',
      'I don’t like how quickly this has narrowed to {target}. Let’s hear them out.',
      '{target}, I’m listening. I can wait to make up my mind until you’ve spoken.',
    ]
  ),
  hunch: pool(
    'hunch',
    [
      'My first name is {target}. I’m putting it out there while there’s still time to talk.',
      'I’m leaning toward {target}. I’d rather say it here and let them answer.',
      '{target} is the name I keep coming back to. I’m willing to hear another one.',
    ],
    [
      'If I had to vote this minute, it would be {target}. I’m still looking for a clearer reason.',
      'I want us to look at {target} before we settle on a name. It’s a read, not proof.',
      'Of the people I’m unsure about, {target} is where I’d start.',
    ],
    [
      'I’ve tried to shake this feeling about {target}. I’d rather be honest about where I’m leaning.',
      'This might be unfair, {target}, but I’ve got doubts I want to talk through.',
      'I’m uneasy about {target}. I don’t want that to turn into a vote without a conversation.',
    ]
  ),
  heardCase: pool(
    'heard-case',
    [
      'Someone raised {target} in private. I think it belongs in this conversation now.',
      'I heard a concern about {target} earlier. I’m putting the name on the table myself.',
      'The talk about {target} is happening anyway. I’d rather have it here.',
    ],
    [
      'A private conversation changed where I rank {target}. I’d like an answer I can weigh here.',
      'I’ve heard concern about {target} outside this room. I won’t count a rumor as evidence.',
      'There’s enough talk about {target} for me to raise it, and I want the room to test the case.',
    ],
    [
      '{target}, I’ve heard a concern in private. I didn’t want you to find out on the ballot.',
      'I was going to keep this to myself, but I’ve heard your name, {target}. Can we talk about it?',
      'Someone I’ve spoken to is uneasy about {target}. I’m uneasy enough to ask about it here.',
    ]
  ),
  ballotCase: pool(
    'ballot-case',
    [
      '{target} took votes last time and I still want to look there.',
      '{target} drew votes before. Has anything changed since that count?',
      'The last ballot makes me want to revisit {target}. Say so if you’ve changed your mind.',
    ],
    [
      'The previous count puts {target} back in the conversation for me. Let’s compare the reasons.',
      'I’m carrying the vote on {target} into tonight’s discussion. The number alone isn’t the case.',
      'The votes for {target} showed real doubt. Has any of what caused it been cleared up?',
    ],
    [
      '{target}, I’d feel better hearing your side of what happened on the last ballot.',
      'I want to revisit {target}’s name, as hard as it is to be back in the same conversation.',
      'Some of us are still thinking about those votes for {target}. I’d like us to say why.',
    ]
  ),
}

const forcefulEndings = [
  'I want an answer before we go to the ballot.',
  'The room needs to reckon with this.',
  'There is still time for someone to change my mind.',
  'I want us to settle this while we can still talk.',
] as const

export function tableDialogue(run: Run, argumentsAtTable: readonly TableArgument[]) {
  const usedFamilies = new Set<string>()
  const usedLines = new Set<string>()
  const names = new Map(run.seats.map(({ id, name }) => [id, name]))
  let firmCount = 0
  return argumentsAtTable
    .filter(({ evidence }) => evidence === undefined)
    .map(({ speakerId, targetId, stance, tone, basis, broadcast }) => {
      if (broadcast)
        return {
          speakerId,
          targetId,
          verb:
            broadcast === 'wager'
              ? 'pledges to vote for'
              : broadcast === 'back'
                ? 'backs'
                : 'challenges',
          argument:
            broadcast === 'wager'
              ? `I named ${names.get(targetId)} on air. If I keep that vote, the audience adds to the pot.`
              : broadcast === 'back'
                ? 'I heard the answer on air. Changing your mind can be an honest move.'
                : 'I challenged that answer on air. I still want a clearer account of what happened.',
        }
      const votedForMe = run.lastTable?.revealedBallots?.some(
        ({ voterId, targetId: votedFor }) => voterId === targetId && votedFor === speakerId
      )
      const hasBallotRecord =
        run.lastTable?.blind === false && (run.lastTable.tally[targetId] ?? 0) >= 2
      let bank = dialogue.hunch
      if (stance === 'defend') bank = dialogue.defend
      else if (votedForMe) bank = dialogue.votedForMe
      else if (stance === 'question') {
        bank = hasBallotRecord
          ? dialogue.ballotQuestion
          : basis === 'conversation'
            ? dialogue.heardQuestion
            : dialogue.question
      } else if (hasBallotRecord) bank = dialogue.ballotCase
      else if (basis === 'conversation') bank = dialogue.heardCase

      const random = mulberry32(
        run.publicSeed ^ Math.imul(run.day, 1741) ^ hashId(`${speakerId}:${targetId}`)
      )
      const line = pickVariantText(
        bank,
        getVoiceProfile(speakerId),
        usedFamilies,
        0,
        random,
        usedLines
      )
      usedFamilies.add(line.familyId)
      usedLines.add(line.variantId)
      const forceful = !stance && tone === 'forceful'
      const ending = forceful
        ? forcefulEndings[(run.day + firmCount++) % forcefulEndings.length]
        : ''
      return {
        speakerId,
        targetId,
        verb:
          stance === 'defend'
            ? 'defends'
            : stance === 'question'
              ? 'questions'
              : forceful
                ? 'presses the case against'
                : 'names',
        argument: [
          line.text.replaceAll('{target}', () => names.get(targetId) ?? 'that guest'),
          ending,
        ]
          .filter(Boolean)
          .join(' '),
      }
    })
}

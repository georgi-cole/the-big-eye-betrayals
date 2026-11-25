export const CASTLE_PERIODS = ['breakfast', 'lunch', 'afternoon', 'supper', 'cocktail'] as const
export type CastlePeriod = (typeof CASTLE_PERIODS)[number]

export const CASTLE_CHOICES = [
  'rapport',
  'debrief',
  'mend-fences',
  'question',
  'ask-about',
  'defend-guest',
  'share-suspicion',
  'ask-shield',
  'ask',
  'observe',
] as const
export type CastleChoice = (typeof CASTLE_CHOICES)[number]
type Context =
  | 'routine'
  | 'opening'
  | 'absence'
  | 'vote'
  | 'tie'
  | 'rift'
  | 'meeting'
  | 'lead'
  | 'immunity'
  | 'vote-shift'
  | 'witness'
  | 'public-safety'
  | 'shield-promise'
  | 'full-house'
  | 'familiar'
  | 'after-vote'

type Choice = { action: CastleChoice; label: string; remembered: string }
type Scene = {
  period: CastlePeriod
  context: Context
  voice: 'warmth' | 'gossipPropensity' | 'composure' | 'assertiveness'
  glance: string
  opening: string
  choices: readonly [Choice, Choice, ...Choice[]]
}

export const CASTLE_SCENES = {
  'last-pour': {
    period: 'cocktail',
    context: 'after-vote',
    voice: 'warmth',
    glance: 'Glasses clink as the guests leave the Round Table.',
    opening: 'I could use a minute to think through that vote. Are you staying for a drink?',
    choices: [
      {
        action: 'rapport',
        label: 'Share a drink',
        remembered: '{guest} remembers who stayed with them after the vote.',
      },
      {
        action: 'debrief',
        label: 'Ask about their ballot',
        remembered: '{guest} remembers talking through their ballot with you.',
      },
    ],
  },
  'back-of-the-room': {
    period: 'cocktail',
    context: 'after-vote',
    voice: 'assertiveness',
    glance: 'Small groups form as the first drinks are poured.',
    opening:
      'Some people spoke up and others only showed their hand at the ballot. What are you thinking for tomorrow?',
    choices: [
      {
        action: 'debrief',
        label: 'Compare how the vote played out',
        remembered: '{guest} remembers the two of you going over the vote.',
      },
      {
        action: 'question',
        label: 'Hear where their suspicions go tomorrow',
        remembered: '{guest} is weighing the name they brought up over drinks.',
      },
    ],
  },
  'drinks-after-a-tie': {
    period: 'cocktail',
    context: 'tie',
    voice: 'composure',
    glance: 'Guests are still talking about the draw.',
    opening:
      'That could have gone either way. Would you trust the same people on a second night like this?',
    choices: [
      {
        action: 'debrief',
        label: 'Go over the tie together',
        remembered: '{guest} still talks about how close the ballot was.',
      },
      {
        action: 'rapport',
        label: 'Spend a quiet moment together',
        remembered: '{guest} remembers who came over after the draw.',
      },
    ],
  },
  'untouched-glass': {
    period: 'cocktail',
    context: 'rift',
    voice: 'composure',
    glance: '{guest} takes their glass away from the crowd.',
    opening:
      'I didn’t expect tonight to end with us barely looking at each other. Have you got a minute?',
    choices: [
      {
        action: 'mend-fences',
        label: 'Clear the air away from the others',
        remembered: '{guest} remembers that you made time to talk after the vote.',
      },
      {
        action: 'debrief',
        label: 'Hear their side of the vote',
        remembered: '{guest} remembers that you heard them out.',
      },
    ],
  },
  'first-kettle': {
    period: 'breakfast',
    context: 'opening',
    voice: 'warmth',
    glance: '{guest} finds the kettle before anyone else.',
    opening: 'Do you take yours strong? I am still learning where they keep everything.',
    choices: [
      {
        action: 'rapport',
        label: 'Make the first pot together',
        remembered: '{guest} keeps a mug free for you.',
      },
      {
        action: 'question',
        label: 'Ask who made the first impression',
        remembered: '{guest} remembers whose name came up over tea.',
      },
    ],
  },
  'late-riser': {
    period: 'breakfast',
    context: 'opening',
    voice: 'composure',
    glance: '{guest} lingers after the first breakfast call.',
    opening: 'I wanted a minute before facing a room full of strangers.',
    choices: [
      {
        action: 'rapport',
        label: 'Wait and walk in together',
        remembered: '{guest} gives you a nod across the room.',
      },
      {
        action: 'question',
        label: 'Compare first impressions',
        remembered: '{guest} has been thinking about what you asked earlier.',
      },
    ],
  },
  'window-seat': {
    period: 'breakfast',
    context: 'routine',
    voice: 'warmth',
    glance: '{guest} takes the cold seat by the window.',
    opening: 'The corner is quieter. I saved you the chair on the warm side.',
    choices: [
      {
        action: 'rapport',
        label: 'Sit by the window',
        remembered: '{guest} waves you over when the room fills again.',
      },
      {
        action: 'question',
        label: 'Ask who’s been on their mind',
        remembered: '{guest} recalls the quiet exchange by the window.',
      },
    ],
  },
  'burnt-toast': {
    period: 'breakfast',
    context: 'routine',
    voice: 'warmth',
    glance: '{guest} opens a window over burnt toast.',
    opening: 'My contribution to the castle this morning appears to be smoke.',
    choices: [
      {
        action: 'rapport',
        label: 'Stay and laugh it off',
        remembered: '{guest} asks whether you trust them with a second batch.',
      },
      {
        action: 'question',
        label: 'See who has been keeping their distance',
        remembered: '{guest} remembers who they spoke about while the room cleared.',
      },
    ],
  },
  'empty-place': {
    period: 'breakfast',
    context: 'absence',
    voice: 'warmth',
    glance: "{guest} pauses at {subject}'s empty place.",
    opening: 'I still set out too many plates. Give me a second.',
    choices: [
      {
        action: 'rapport',
        label: 'Help clear the extra place',
        remembered: '{guest} remembers who stayed to help.',
      },
      {
        action: 'debrief',
        label: 'Talk about how yesterday ended',
        remembered: "{guest} has had time to sit with yesterday's vote.",
      },
    ],
  },
  'missing-voice': {
    period: 'breakfast',
    context: 'absence',
    voice: 'composure',
    glance: "The room goes quiet when someone says {subject}'s name.",
    opening: "I keep expecting them to finish everyone else's sentences.",
    choices: [
      {
        action: 'rapport',
        label: 'Stay a while with {guest}',
        remembered: '{guest} takes the seat next to yours later.',
      },
      {
        action: 'debrief',
        label: 'Ask what changed around the Table',
        remembered: "{guest} is still weighing yesterday's conversation.",
      },
    ],
  },
  'paper-ballots': {
    period: 'breakfast',
    context: 'vote',
    voice: 'assertiveness',
    glance: "Yesterday's vote comes up before the plates are cleared.",
    opening: 'A slate has room for one name. There was more to it than that.',
    choices: [
      {
        action: 'debrief',
        label: 'Let {guest} explain the vote',
        remembered: '{guest} remembers you heard them out about the ballot.',
      },
      {
        action: 'defend-guest',
        label: 'Make the case for giving {subject} time',
        remembered: '{guest} remembers you stood up for {subject}.',
      },
    ],
  },
  'second-ballot': {
    period: 'breakfast',
    context: 'tie',
    voice: 'composure',
    glance: "Half the table seems to remember yesterday's tie differently.",
    opening: 'It is easy to call it a split room from here. It felt much closer at the time.',
    choices: [
      {
        action: 'debrief',
        label: 'Ask what would have broken the tie',
        remembered: '{guest} is listening for people who changed their account of the tie.',
      },
      {
        action: 'rapport',
        label: 'Leave the ballot alone over breakfast',
        remembered: '{guest} appreciates a conversation that did not come back to the vote.',
      },
    ],
  },
  'cool-tea': {
    period: 'breakfast',
    context: 'rift',
    voice: 'composure',
    glance: '{guest} waits for the table to thin out.',
    opening: 'We left things badly. We can at least have the conversation in daylight.',
    choices: [
      {
        action: 'mend-fences',
        label: 'Clear the air privately',
        remembered: '{guest} remembers you named the tension.',
      },
      {
        action: 'rapport',
        label: 'Start with a fresh cup',
        remembered: '{guest} has a little more time for you after breakfast.',
      },
    ],
  },
  'kept-seat': {
    period: 'breakfast',
    context: 'meeting',
    voice: 'warmth',
    glance: '{guest} has kept the seat you agreed on.',
    opening:
      'You made it. I thought we should talk before everyone starts asking where the day is going.',
    choices: [
      {
        action: 'rapport',
        label: 'Keep the breakfast appointment',
        remembered: '{guest} remembers you turned up when you said you would.',
      },
      {
        action: 'ask-about',
        label: 'Ask for an early read on {subject}',
        remembered: '{guest} remembers what you asked over breakfast.',
      },
    ],
  },
  'breakfast-whisper': {
    period: 'breakfast',
    context: 'lead',
    voice: 'gossipPropensity',
    glance: '{guest} waits until the breakfast room empties.',
    opening:
      'There was a conversation near the {room} before breakfast. I only know what I was there to hear.',
    choices: [
      {
        action: 'ask',
        label: 'Ask what was said about the vote',
        remembered: '{guest} remembers the account you asked for before breakfast.',
      },
      {
        action: 'observe',
        label: 'Watch the room for a moment',
        remembered: 'The morning observation is still in Intel.',
      },
    ],
  },
  'unwashed-cups': {
    period: 'breakfast',
    context: 'lead',
    voice: 'composure',
    glance: 'An early conversation breaks up when the hall fills.',
    opening: 'I saw {subject} by the {room}. I would ask people separately if it matters to you.',
    choices: [
      {
        action: 'observe',
        label: 'Keep an eye on who speaks to whom',
        remembered: 'The breakfast sighting is still in Intel if you want to compare stories.',
      },
      {
        action: 'ask',
        label: 'Ask {guest} for their side',
        remembered: '{guest} remembers you asked them directly.',
      },
    ],
  },
  'courtyard-lap': {
    period: 'afternoon',
    context: 'routine',
    voice: 'warmth',
    glance: '{guest} takes the long way around the courtyard.',
    opening: 'One lap without rankings or promises. Then we can talk if you still want to.',
    choices: [
      {
        action: 'rapport',
        label: 'Take a lap together',
        remembered: '{guest} still takes the long way when they want a word with you.',
      },
      {
        action: 'ask-about',
        label: 'Ask where {subject} stands',
        remembered: '{guest} remembers who you were curious about on the walk.',
      },
    ],
  },
  'library-ladder': {
    period: 'afternoon',
    context: 'routine',
    voice: 'composure',
    glance: '{guest} stands on a library ladder, dusting their sleeves.',
    opening:
      'I was looking for five minutes of silence. I found a book nobody has opened in years instead.',
    choices: [
      {
        action: 'rapport',
        label: 'Stay and help with the shelves',
        remembered: '{guest} leaves the book you found together on the side table.',
      },
      {
        action: 'ask-about',
        label: 'Ask why {subject} keeps their own company',
        remembered: "{guest} remembers talking over {subject}'s habits.",
      },
    ],
  },
  'courtyard-game': {
    period: 'afternoon',
    context: 'routine',
    voice: 'assertiveness',
    glance: '{guest} starts a game with a pair of worn coins.',
    opening: 'No score sheet for this one. I promise.',
    choices: [
      {
        action: 'rapport',
        label: 'Play a round with {guest}',
        remembered: '{guest} is still asking for a rematch.',
      },
      {
        action: 'ask-about',
        label: 'Bring up {subject} between throws',
        remembered: '{guest} remembers the name you raised over the game.',
      },
    ],
  },
  'immunity-toast': {
    period: 'lunch',
    context: 'immunity',
    voice: 'warmth',
    glance: '{guest} raises a glass to the Immunity winner.',
    opening:
      'Good for {subject}. I wonder who can still afford to say what they were planning to say.',
    choices: [
      {
        action: 'rapport',
        label: 'Share a glass and hear them out',
        remembered: '{guest} raises another glass in your direction.',
      },
      {
        action: 'ask-about',
        label: 'Ask how the win changes their read on {subject}',
        remembered: '{guest} remembers the question you raised while everyone was toasting.',
      },
    ],
  },
  'behind-the-applause': {
    period: 'lunch',
    context: 'immunity',
    voice: 'gossipPropensity',
    glance: 'The applause for Immunity fades into small groups.',
    opening: "We all applauded {subject}. I don't think everybody meant the same thing by it.",
    choices: [
      {
        action: 'ask-about',
        label: 'Ask for a private read on {subject}',
        remembered: '{guest} remembers how you read the room after the challenge.',
      },
      {
        action: 'defend-guest',
        label: 'Defend {subject} from the talk',
        remembered: '{guest} remembers that you spoke up for the winner.',
      },
    ],
  },
  'rewritten-slate': {
    period: 'lunch',
    context: 'vote-shift',
    voice: 'assertiveness',
    glance: 'The talk has changed since the Immunity result.',
    opening: "We had a plan this morning. With {subject} safe, I'm listening again.",
    choices: [
      {
        action: 'ask-about',
        label: 'Find out why {subject} was in the plan',
        remembered: '{guest} remembers that you asked how the original plan started.',
      },
      {
        action: 'rapport',
        label: 'Give {guest} room to regroup',
        remembered: "{guest} is glad you didn't demand a new name on the spot.",
      },
    ],
  },
  'changed-company': {
    period: 'lunch',
    context: 'vote-shift',
    voice: 'composure',
    glance: '{guest} changes seats twice during lunch.',
    opening: '{subject} winning made a few people look for new company.',
    choices: [
      {
        action: 'ask-about',
        label: 'Ask what they made of {subject} before Immunity',
        remembered: '{guest} remembers who was watching the room at lunch.',
      },
      {
        action: 'defend-guest',
        label: 'Push back on the talk about {subject}',
        remembered: '{guest} knows where you stood when the plan changed.',
      },
    ],
  },
  'interrupted-lunch': {
    period: 'lunch',
    context: 'rift',
    voice: 'assertiveness',
    glance: '{guest} leaves the lunch table before dessert.',
    opening: "I wasn't going to get into it in front of them. Have you got a minute now?",
    choices: [
      {
        action: 'mend-fences',
        label: 'Settle it away from the group',
        remembered: '{guest} remembers you made time to talk away from the others.',
      },
      {
        action: 'rapport',
        label: 'Offer to walk it off together',
        remembered: '{guest} slows down to meet you in the hall.',
      },
    ],
  },
  'library-door': {
    period: 'afternoon',
    context: 'lead',
    voice: 'gossipPropensity',
    glance: 'A low conversation stops when a door opens.',
    opening: 'Ask me somewhere quiet. I heard part of an exchange near the {room} after Immunity.',
    choices: [
      {
        action: 'ask',
        label: 'Ask what they actually heard',
        remembered: '{guest} remembers you asked them to stick to what they heard.',
      },
      {
        action: 'observe',
        label: 'Watch who leaves the {room}',
        remembered: 'The afternoon sighting is still in your Intel.',
      },
    ],
  },
  'stairs-at-two': {
    period: 'afternoon',
    context: 'lead',
    voice: 'composure',
    glance: '{guest} doubles back when the stairwell gets busy.',
    opening: 'I can tell you who was at the {room}. I would be careful about the rest.',
    choices: [
      {
        action: 'observe',
        label: 'Mark the sighting in Intel',
        remembered: 'The sighting gives you something to compare against other accounts.',
      },
      {
        action: 'ask',
        label: 'Ask what {guest} can vouch for',
        remembered: '{guest} remembers being asked to give their own account.',
      },
    ],
  },
  'closed-shutters': {
    period: 'afternoon',
    context: 'lead',
    voice: 'assertiveness',
    glance: 'The shutters close before the room empties.',
    opening:
      '{subject} was in the {room}. I have my impression. You ought to make up your own mind.',
    choices: [
      {
        action: 'ask',
        label: "Hear {guest}'s account",
        remembered: '{guest} remembers giving you a chance to hear their side.',
      },
      {
        action: 'observe',
        label: 'Look for a separate trace',
        remembered: 'Your own observation is available alongside the accounts you collect.',
      },
    ],
  },
  'tea-tray': {
    period: 'afternoon',
    context: 'vote',
    voice: 'warmth',
    glance: '{guest} carries an untouched tray back from the terrace.',
    opening: 'We were talking about {subject}, and suddenly nobody wanted a second cup.',
    choices: [
      {
        action: 'ask-about',
        label: 'Ask what bothered them about {subject}',
        remembered: '{guest} remembers whose name stopped the conversation.',
      },
      {
        action: 'defend-guest',
        label: 'Give {subject} a fair hearing',
        remembered: '{guest} remembers you asked them to reconsider {subject}.',
      },
      {
        action: 'share-suspicion',
        label: 'Share your own doubt about {subject}',
        remembered: '{guest} remembers you went on the record about {subject}.',
      },
    ],
  },
  'wet-coats': {
    period: 'lunch',
    context: 'routine',
    voice: 'warmth',
    glance: 'A heap of challenge coats is left drying in the hall.',
    opening: 'The fastest way to start an argument in here is to tell everyone this coat is yours.',
    choices: [
      {
        action: 'rapport',
        label: 'Help {guest} sort the coats',
        remembered: '{guest} hands you your coat before you have to look for it.',
      },
      {
        action: 'ask-about',
        label: 'Ask how {subject} reacted after the challenge',
        remembered: '{guest} remembers the question you asked while you worked.',
      },
    ],
  },
  'bread-basket': {
    period: 'lunch',
    context: 'routine',
    voice: 'warmth',
    glance: 'The first food out is gone before everyone sits down.',
    opening: 'I hid a heel of bread under this napkin. Some of us were still getting changed.',
    choices: [
      {
        action: 'rapport',
        label: 'Share the bread with {guest}',
        remembered: '{guest} checks that you got something to eat next time.',
      },
      {
        action: 'ask-about',
        label: 'Ask who sat with {subject}',
        remembered: '{guest} remembers the question about who shared a table.',
      },
    ],
  },
  'cold-soup': {
    period: 'lunch',
    context: 'routine',
    voice: 'assertiveness',
    glance: '{guest} reaches lunch after the first bowls are cold.',
    opening:
      'They were already halfway through the story when I got here. It is a bad place to start listening.',
    choices: [
      {
        action: 'rapport',
        label: 'Get {guest} a warm bowl',
        remembered: '{guest} waits for you to catch up after the meal.',
      },
      {
        action: 'ask-about',
        label: 'Ask what they heard about {subject}',
        remembered: '{guest} remembers that you wanted their own read.',
      },
    ],
  },
  'second-helping': {
    period: 'breakfast',
    context: 'full-house',
    voice: 'warmth',
    glance: 'A second pot is needed. Every chair filled this morning.',
    opening: 'I was counting the chairs before the doors opened. Now I can taste my tea again.',
    choices: [
      {
        action: 'rapport',
        label: 'Stay for a second cup',
        remembered: '{guest} waves you over when the kettle goes on again.',
      },
      {
        action: 'question',
        label: 'Ask what the relief changed for them',
        remembered: '{guest} remembers you asked where they stood after everyone came back.',
      },
    ],
  },
  'fresh-place': {
    period: 'breakfast',
    context: 'full-house',
    voice: 'composure',
    glance: '{guest} runs out of room at the busy breakfast table.',
    opening: 'Everyone made it down. Somehow that makes it harder to get a word in.',
    choices: [
      {
        action: 'rapport',
        label: 'Make space beside you',
        remembered: '{guest} remembers you moved up to make space.',
      },
      {
        action: 'question',
        label: 'Ask who changed seats when the room filled',
        remembered: '{guest} is still interested in who chooses to sit together.',
      },
    ],
  },
  'second-walk': {
    period: 'afternoon',
    context: 'familiar',
    voice: 'warmth',
    glance: '{guest} catches your eye on the stairs.',
    opening: 'Thanks for making time earlier. Shall we finish that conversation somewhere quieter?',
    choices: [
      {
        action: 'rapport',
        label: 'Go back for the rest of the conversation',
        remembered: '{guest} remembers you came back when you could have kept walking.',
      },
      {
        action: 'question',
        label: 'Hear what they’ve noticed since you talked',
        remembered: '{guest} remembers who they brought up on the second walk.',
      },
    ],
  },
  'end-of-the-bench': {
    period: 'supper',
    context: 'familiar',
    voice: 'composure',
    glance: '{guest} shifts over on the supper bench.',
    opening:
      'You made it easier to say what I meant earlier. I want to go into the room with that much, at least.',
    choices: [
      {
        action: 'rapport',
        label: 'Sit together until the bell',
        remembered: '{guest} remembers the quiet before you both walked in.',
      },
      {
        action: 'question',
        label: 'Ask whom they’re still uncertain about',
        remembered: '{guest} remembers you asked instead of trying to steer them.',
      },
    ],
  },
  'last-jugs': {
    period: 'supper',
    context: 'routine',
    voice: 'warmth',
    glance: '{guest} brings the last of the water before the bell.',
    opening:
      'I know how this looks. It is just water. Unless you want to tell me where everybody stands.',
    choices: [
      {
        action: 'rapport',
        label: 'Help fill the last glasses',
        remembered: '{guest} sets a glass out for you when you meet again.',
      },
      {
        action: 'question',
        label: 'Ask who still looks undecided',
        remembered: '{guest} remembers looking around the supper table with you.',
      },
    ],
  },
  'before-the-bell': {
    period: 'supper',
    context: 'routine',
    voice: 'composure',
    glance: '{guest} waits near the end of the supper table.',
    opening: 'The bell will ring soon. I can give you one honest minute before it does.',
    choices: [
      {
        action: 'rapport',
        label: 'Sit down before the Table',
        remembered: '{guest} remembers you checked in before the vote.',
      },
      {
        action: 'ask-about',
        label: 'Get a last read on {subject}',
        remembered: '{guest} remembers your final question before the bell.',
      },
    ],
  },
  candles: {
    period: 'supper',
    context: 'routine',
    voice: 'warmth',
    glance: '{guest} lights the candles along the supper table.',
    opening: 'A minute ago we were eating. Now everyone is practising what to say.',
    choices: [
      {
        action: 'rapport',
        label: 'Help with the last candles',
        remembered: '{guest} remembers you kept them company before the Table.',
      },
      {
        action: 'ask-shield',
        label: 'Quietly ask if they are covered tonight',
        remembered: '{guest} remembers you kept the question private.',
      },
    ],
  },
  'shield-congratulations': {
    period: 'supper',
    context: 'public-safety',
    voice: 'warmth',
    glance: '{guest} gets a public congratulations for winning Safety.',
    opening: "They all saw the result. That doesn't make the next conversation any easier.",
    choices: [
      {
        action: 'rapport',
        label: 'Congratulate {guest} quietly',
        remembered: '{guest} remembers what you said after the Safety results.',
      },
      {
        action: 'ask-shield',
        label: 'Ask if they are still holding it',
        remembered: '{guest} remembers you waited until you were alone to ask.',
      },
    ],
  },
  'quiet-favour': {
    period: 'supper',
    context: 'shield-promise',
    voice: 'composure',
    glance: '{guest} waits by the door before people go in.',
    opening: 'We spoke about looking out for each other earlier. Did you still want to talk?',
    choices: [
      {
        action: 'ask-shield',
        label: 'Talk privately about protection',
        remembered: '{guest} remembers your conversation about the arrangement.',
      },
      {
        action: 'rapport',
        label: 'Check in without making another promise',
        remembered: '{guest} remembers you came to talk even with the bell about to ring.',
      },
    ],
  },
  'last-rehearsal': {
    period: 'supper',
    context: 'witness',
    voice: 'composure',
    glance: '{guest} walks the hall before the Table opens.',
    opening: 'We both know what I told you. It will feel different with everyone watching.',
    choices: [
      {
        action: 'rapport',
        label: 'Hear them out before the bell',
        remembered: '{guest} remembers you let them talk through what the Table would feel like.',
      },
      {
        action: 'ask-shield',
        label: 'Ask what cover they have for tonight',
        remembered: '{guest} remembers the quiet talk about cover.',
      },
    ],
  },
  'two-stories': {
    period: 'supper',
    context: 'lead',
    voice: 'gossipPropensity',
    glance: 'Two conversations stop as the Table bell is tested.',
    opening: 'What I heard near the {room} might sound different in another mouth.',
    choices: [
      {
        action: 'ask',
        label: 'Hear their version before the Table',
        remembered: 'You can return to that account in Intel if the story changes.',
      },
      {
        action: 'observe',
        label: 'Keep a separate note of the sighting',
        remembered: 'Your sighting is still available for a comparison.',
      },
    ],
  },
  'last-word': {
    period: 'supper',
    context: 'vote',
    voice: 'assertiveness',
    glance: '{guest} hangs back as people gather for the Table.',
    opening:
      'We keep circling {subject}. I want to hear a reason someone is prepared to say out loud.',
    choices: [
      {
        action: 'share-suspicion',
        label: 'Explain your concern about {subject}',
        remembered: '{guest} remembers you were willing to state your concern.',
      },
      {
        action: 'defend-guest',
        label: 'Ask them to give {subject} a chance',
        remembered: '{guest} remembers you spoke for {subject} before the Table.',
      },
      {
        action: 'ask-about',
        label: 'Hear their case first',
        remembered: '{guest} remembers you asked what would convince them.',
      },
    ],
  },
  'straighten-chairs': {
    period: 'supper',
    context: 'rift',
    voice: 'composure',
    glance: '{guest} straightens a chair near the Table doors.',
    opening:
      'If we have a problem, I would rather it came from us than from someone reading our faces.',
    choices: [
      {
        action: 'mend-fences',
        label: 'Try to clear the air before voting',
        remembered: '{guest} remembers that you tried to speak directly.',
      },
      {
        action: 'rapport',
        label: 'Walk in together',
        remembered: "{guest} remembers you didn't leave them at the door.",
      },
    ],
  },
  'service-stairs': {
    period: 'supper',
    context: 'lead',
    voice: 'composure',
    glance: 'A pair of guests come back by different doors.',
    opening:
      'I was near the {room} when they spoke. I would rather tell you before anybody does it for me.',
    choices: [
      {
        action: 'ask',
        label: 'Listen before the story goes around',
        remembered: '{guest} remembers whose account you heard first.',
      },
      {
        action: 'observe',
        label: 'Make a note of where they were',
        remembered: 'The note can still help when someone gives you a different version.',
      },
    ],
  },
} satisfies Record<string, Scene>

export type CastleSceneId = keyof typeof CASTLE_SCENES
export type CastleMoment = {
  day: number
  scene: CastleSceneId
  contactId: string
  subjectId?: string
  incidentId?: string
  response?: {
    choice?: CastleChoice
    result: 'shared' | 'guarded' | 'firsthand' | 'hearsay' | 'observed' | 'passed'
    reportId?: string
  }
}

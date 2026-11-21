import type { SocialActionDefinition } from '../social/socialActions'
import { CASTLE_EXPLORATION_INFO } from './generalSocial'
import type { GeneralSocialMove } from './generalSocial'

export const generalActionCards = [
  {
    id: 'group-chat',
    title: 'Group Chat',
    category: 'friendly',
    icon: '💬',
    description: 'Build rapport with two to four guests. Costs one Energy per guest.',
  },
  {
    id: 'lay-low',
    title: 'Lay Low',
    category: 'strategic',
    icon: '🌙',
    description: 'Sit out the conversation and keep your Energy for later.',
  },
  {
    id: 'explore-castle',
    title: 'Explore the Castle',
    category: 'strategic',
    icon: '🕯️',
    description: `Listen around the castle and pick up ${CASTLE_EXPLORATION_INFO} Info.`,
  },
  {
    id: 'eavesdrop',
    title: 'Eavesdrop',
    category: 'strategic',
    icon: '👂',
    description:
      'Listen for a private conversation. You might catch a rumor or pick up a little Info.',
  },
  {
    id: 'found-alliance',
    title: 'Found an alliance',
    category: 'alliance',
    icon: '🛡️',
    description: 'Invite at least two guests. Everyone must agree before the alliance forms.',
  },
  {
    id: 'consult-alliance',
    title: 'Consult Alliance',
    category: 'alliance',
    icon: '💬',
    description: 'Ask your allies privately what they make of another guest.',
  },
] satisfies (Omit<SocialActionDefinition, 'baseCost'> & { id: GeneralSocialMove })[]

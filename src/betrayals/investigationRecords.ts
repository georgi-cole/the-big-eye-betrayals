import type { Ballot, Run, Seat } from './run.ts'

export const OBSERVATION_FOCI = ['contacts', 'actions', 'demeanor'] as const
export type ObservationFocus = (typeof OBSERVATION_FOCI)[number]
export const CASTLE_ROOMS = [
  'Gallery',
  'Library',
  'Courtyard',
  'Drawing Room',
  'Great Hall',
] as const
export const SOCIAL_BEHAVIORS = [
  'met',
  'lobbied',
  'defended',
  'avoided',
  'checked-in',
  'alone',
] as const
export const DEMEANORS = ['at ease', 'guarded', 'restless', 'hurried', 'subdued'] as const
export const GUEST_READS = ['open', 'trust', 'suspect'] as const
export const PERSONAL_NOTE_LIMIT = 240
export const PROFILE_TRAITS = {
  sociability: 'Sociability',
  openness: 'Openness',
  influence: 'Influence',
  impulsiveness: 'Impulsiveness',
  strategy: 'Strategic play',
  composure: 'Composure',
} as const
export type ProfileTrait = keyof typeof PROFILE_TRAITS
export const TRAIT_READS = ['low', 'mixed', 'high'] as const
export const IMPRESSIONS = [
  'open with me',
  'keeps to a close circle',
  'careful about votes',
  'hard to read',
] as const

/** A claim describes what the speaker says happened, even when they are wrong. */
export type SocialClaim = {
  day: number
  period?: 'afternoon'
  behavior?: (typeof SOCIAL_BEHAVIORS)[number]
  room?: (typeof CASTLE_ROOMS)[number]
  mood?: (typeof DEMEANORS)[number]
  contactId?: string
  topicId?: string
  denies?: true
}

export type CastleIncident = {
  id: string
  guestId: string
  fact: SocialClaim & Required<Pick<SocialClaim, 'behavior' | 'room' | 'mood'>>
  witnessId?: string
  relayIds: string[]
}

export const REPORT_METHODS = [
  'observe',
  'eavesdrop',
  'ask',
  'source',
  'confront',
  'watch',
] as const
export const REPORT_ACCESSES = [
  'observed',
  'firsthand',
  'hearsay',
  'impression',
  'withheld',
  'unavailable',
  'statement',
] as const
export type IntelReport = {
  id: string
  day: number
  guestId: string
  method: (typeof REPORT_METHODS)[number]
  access: (typeof REPORT_ACCESSES)[number]
  speakerId?: string
  sourceId?: string
  /** Internal correlation. The journal can only compare provenance that was disclosed. */
  incidentId?: string
  referenceId?: string
  nearbyId?: string
  claim?: SocialClaim
  impression?: (typeof IMPRESSIONS)[number]
}

export const WATCH_STATUSES = ['waiting', 'declined', 'reported', 'missed'] as const
export type WatchRequest = {
  day: number
  guestId: string
  watcherId: string
  status: (typeof WATCH_STATUSES)[number]
}

export type WitnessRequest = {
  day: number
  reportId: string
  accepted: boolean
  shield?: 'pending' | 'met' | 'unmet'
}

export function witnessReply(request: WitnessRequest) {
  if (request.shield === 'pending') return 'Will speak if protected at Night'
  if (request.shield === 'unmet') return 'Withheld testimony without Night protection'
  return request.accepted ? 'Agreed to speak' : 'Declined to speak'
}

export function waitingShieldWitnesses(run: Run): string[] {
  const { reports, witnesses } = investigationFor(run)
  const ids = witnesses.flatMap(({ day, reportId, shield }) => {
    if (day !== run.day || shield !== 'pending') return []
    const source = reports.find(({ id }) => id === reportId)?.speakerId
    return source && isActiveGuest(run, source) ? [source] : []
  })
  const legacy = run.dayFlow?.witness
  if (legacy?.needsShield && legacy.ready === undefined) ids.push(legacy.guestId)
  return Array.from(new Set(ids))
}

export type PersonalRead = {
  leaning: (typeof GUEST_READS)[number]
  text: string
  traits?: Partial<Record<ProfileTrait, (typeof TRAIT_READS)[number]>>
}
export const SHARING_MODES = ['attribute', 'private-source', 'challenge'] as const
export type SharedReport = {
  day: number
  reportId: string
  listenerId: string
  mode: (typeof SHARING_MODES)[number]
}

export type Investigation = {
  incidents: CastleIncident[]
  reports: IntelReport[]
  watches: WatchRequest[]
  witnesses: WitnessRequest[]
  shares: SharedReport[]
  notes: Record<string, PersonalRead>
  saved: string[]
  votes: { day: number; ballots: Ballot[] }[]
}

const empty: Investigation = {
  incidents: [],
  reports: [],
  watches: [],
  witnesses: [],
  shares: [],
  notes: {},
  saved: [],
  votes: [],
}

export function investigationFor(run: Pick<Run, 'investigation'>): Investigation {
  return run.investigation ?? empty
}

export function isActiveGuest(run: Pick<Run, 'seats'>, id: string) {
  return run.seats.some((seat) => seat.id === id && !seat.exit)
}

export function addIntelReport(
  state: Investigation,
  report: Omit<IntelReport, 'id'>
): Investigation {
  return {
    ...state,
    reports: [...state.reports, { ...report, id: `intel:${state.reports.length + 1}` }],
  }
}

export function firsthandAt(incident: CastleIncident, id: string) {
  return incident.witnessId === id || incident.fact.contactId === id
}

export function isVoteClaim(
  claim: SocialClaim | undefined
): claim is SocialClaim & { topicId: string } {
  return Boolean(claim?.topicId && (claim.behavior === 'lobbied' || claim.behavior === 'defended'))
}

export function archiveInvestigationVotes(run: Run, blind: boolean, ballots?: Ballot[]) {
  if (blind || !ballots?.length) return run.investigation
  const state = investigationFor(run)
  if (state.votes.some(({ day }) => day === run.day)) return state
  return { ...state, votes: [...state.votes, { day: run.day, ballots }] }
}

export function guestName(seats: readonly Seat[], id: string) {
  return seats.find((seat) => seat.id === id)?.name ?? 'a guest'
}

export function describeClaim(claim: SocialClaim, guest: string, name: (id: string) => string) {
  const contact = claim.contactId ? name(claim.contactId) : 'another guest'
  const topic = claim.topicId ? name(claim.topicId) : 'another name'
  const where = claim.room ? ` in the ${claim.room}` : ''
  if (claim.denies && claim.behavior === 'lobbied')
    return `${guest} says they did not ask for a vote against ${topic} that day.`
  if (claim.denies && claim.behavior === 'defended')
    return `${guest} says they did not make a case to keep ${topic} that day.`
  switch (claim.behavior) {
    case 'lobbied':
      return claim.topicId
        ? `${guest} asked ${contact} to consider voting for ${topic}${where}.`
        : `${guest} talked about where the vote might go${where}.`
    case 'defended':
      return claim.topicId
        ? `${guest} made a case to ${contact} for keeping ${topic}${where}.`
        : `${guest} urged caution about a name being discussed${where}.`
    case 'avoided':
      return `${guest} cut the conversation short when ${contact} approached${where}.`
    case 'met':
      return `${guest} spoke with ${contact}${where}.`
    case 'checked-in':
      return `${guest} checked in with ${contact}${where}.`
    case 'alone':
      return `${guest} spent some time on their own${where}.`
    default:
      return claim.mood
        ? `${guest} seemed ${claim.mood}${where}.`
        : `${guest} passed through${where}.`
  }
}

import { castleAlliances } from './allianceRecords.ts'
import {
  describeClaim,
  guestName,
  investigationFor,
  isVoteClaim,
  PROFILE_TRAITS,
} from './investigationRecords.ts'
import type { IntelReport, ProfileTrait } from './investigationRecords.ts'
import { between, getSocialView, hasPersonalAlliance } from './perception.ts'
import type { Run } from './run.ts'

export type PlayerAccount = Omit<IntelReport, 'incidentId'>

function knownAccounts(run: Run): PlayerAccount[] {
  return investigationFor(run)
    .reports.map(({ incidentId: _internal, ...account }) => account)
    .reverse()
}

export function accountLabel(account: PlayerAccount) {
  switch (account.access) {
    case 'observed':
      return account.method === 'eavesdrop' ? 'You overheard' : 'You observed'
    case 'firsthand':
      return 'Firsthand account'
    case 'hearsay':
      return 'Secondhand account'
    case 'statement':
      return 'Their own account'
    case 'impression':
      return 'Personal impression'
    case 'withheld':
      return 'Held back'
    case 'unavailable':
      return 'Could not say'
  }
}

export function accountText(account: PlayerAccount, name: (id: string) => string) {
  const speaker = account.speakerId ? name(account.speakerId) : 'You'
  if (account.claim) return describeClaim(account.claim, name(account.guestId), name)
  if (account.impression)
    return `${speaker}'s impression of ${name(account.guestId)}: “${account.impression}”.`
  if (account.access === 'withheld')
    return account.method === 'source'
      ? `${speaker} kept their source to themselves.`
      : `${speaker} chose to keep the conversation private.`
  if (account.method === 'watch')
    return `${speaker} did not get a clear look at ${name(account.guestId)}.`
  return account.speakerId
    ? `${speaker} had nothing specific to share about ${name(account.guestId)}.`
    : 'The moment passed before you could see what happened.'
}

function observedShare(count: number, total: number) {
  return total ? Math.round((count / total) * 100) : undefined
}

export function profileForGuest(run: Run, guestId: string) {
  const state = investigationFor(run)
  const accounts = knownAccounts(run).filter((report) => report.guestId === guestId)
  const observed = accounts.flatMap(({ access, claim }) =>
    access === 'observed' && claim ? [claim] : []
  )
  const others = accounts.filter(({ access }) => access !== 'observed')
  const exchanges = getSocialView(run, run.humanId).filter((entry) =>
    between(entry, run.humanId, guestId)
  )
  const theirMoves = exchanges.filter(({ actorId }) => actorId === guestId)
  const relationships = [
    ...new Set(observed.flatMap(({ contactId }) => (contactId ? [contactId] : []))),
  ]
  const visits = observed.filter(
    ({ behavior }) => behavior && behavior !== 'alone' && behavior !== 'avoided'
  ).length
  const behaviorCount = observed.filter(({ behavior }) => behavior).length
  const alone = observed.filter(({ behavior }) => behavior === 'alone').length
  const openedUp = others.filter(
    ({ access, claim }) => access === 'statement' && claim && !claim.denies
  ).length
  const turnedAway = others.filter(
    ({ method, access }) => method === 'confront' && access === 'withheld'
  ).length
  const votePacts = theirMoves.filter(({ kind }) => kind === 'vote-plan')
  const support = votePacts.filter(({ accepted }) => accepted).length
  const voteTalk = observed.filter(
    ({ behavior }) => behavior === 'defended' || behavior === 'lobbied'
  ).length
  const reactions = observed.filter(({ behavior, mood }) => behavior || mood)
  const quickReactions = reactions.filter(
    ({ behavior, mood }) => behavior === 'avoided' || mood === 'hurried'
  ).length
  const moods = observed.filter(({ mood }) => mood)
  const calm = moods.filter(({ mood }) => mood === 'at ease').length
  const firstMood = moods[0]
  const pastMood = moods.find(({ day }) => day < (firstMood?.day ?? 0))
  const heard = others.filter(({ speakerId }) => speakerId && speakerId !== guestId)
  const otherEvidence: Record<ProfileTrait, PlayerAccount | undefined> = {
    sociability: heard.find(({ claim, impression }) =>
      Boolean(claim?.contactId || impression === 'keeps to a close circle')
    ),
    openness: heard.find(
      ({ impression }) => impression === 'open with me' || impression === 'keeps to a close circle'
    ),
    influence: heard.find(({ claim }) => isVoteClaim(claim) && !claim.denies),
    impulsiveness: heard.find(
      ({ claim }) => claim?.behavior === 'avoided' || claim?.mood === 'hurried'
    ),
    strategy: heard.find(
      ({ claim, impression }) => isVoteClaim(claim) || impression === 'careful about votes'
    ),
    composure: heard.find(({ claim }) => Boolean(claim?.mood)),
  }
  const metrics = (
    [
      {
        id: 'sociability',
        level: observedShare(visits, visits + alone),
        value: visits
          ? `${visits} contact${visits === 1 ? '' : 's'} observed`
          : alone
            ? 'Seen spending time alone'
            : undefined,
        detail: relationships.length
          ? `Seen with ${relationships.map((id) => guestName(run.seats, id)).join(', ')}.`
          : undefined,
      },
      {
        id: 'openness',
        level: observedShare(openedUp, openedUp + turnedAway),
        value: openedUp
          ? 'Discussed their own choices'
          : turnedAway
            ? 'Kept their side private'
            : undefined,
        detail:
          openedUp || turnedAway
            ? `From ${openedUp + turnedAway} private conversation${openedUp + turnedAway === 1 ? '' : 's'}.`
            : undefined,
      },
      {
        id: 'influence',
        level: observedShare(support, votePacts.length),
        value: support
          ? 'Has secured support'
          : votePacts.length
            ? 'Has tried to organise support'
            : undefined,
        detail: votePacts.length
          ? `${support} of ${votePacts.length} proposals made to you were accepted.`
          : undefined,
      },
      {
        id: 'impulsiveness',
        level: observedShare(quickReactions, reactions.length),
        value: quickReactions
          ? 'Seen reacting quickly'
          : reactions.length
            ? 'No quick reactions seen'
            : undefined,
        detail: quickReactions
          ? `Observed in ${quickReactions} moment${quickReactions === 1 ? '' : 's'}.`
          : undefined,
      },
      {
        id: 'strategy',
        level: observedShare(voteTalk + votePacts.length, behaviorCount + votePacts.length),
        value:
          voteTalk || votePacts.length
            ? 'Has worked on the vote in private'
            : behaviorCount
              ? 'No vote work seen'
              : undefined,
        detail: voteTalk
          ? `You saw ${voteTalk} voting discussion${voteTalk === 1 ? '' : 's'}.`
          : undefined,
      },
      {
        id: 'composure',
        level: observedShare(calm, moods.length),
        value: firstMood?.mood ? `Seemed ${firstMood.mood}` : undefined,
        detail: firstMood
          ? `Day ${firstMood.day}${pastMood?.mood ? ` · Previously ${pastMood.mood}` : ''}`
          : undefined,
      },
    ] as const
  ).map((metric) => ({
    ...metric,
    label: PROFILE_TRAITS[metric.id],
    reported: otherEvidence[metric.id],
  }))
  return {
    guestId,
    name: guestName(run.seats, guestId),
    metrics,
    accounts,
    saved: state.saved,
    watches: state.watches.filter(({ guestId: id }) => id === guestId),
    witnessRequests: state.witnesses.filter(({ day }) => day === run.day),
    shares: state.shares.filter(({ reportId }) => accounts.some(({ id }) => reportId === id)),
  }
}

export type GuestProfile = ReturnType<typeof profileForGuest>

export function pulseView(run: Run) {
  const state = investigationFor(run)
  const social = getSocialView(run, run.humanId)
  const guests = run.seats.filter(({ id }) => id !== run.humanId)
  const activePacts = guests.filter(
    ({ id, exit }) => !exit && hasPersonalAlliance(social, run.humanId, id)
  )
  const alliances = castleAlliances(social).filter(({ memberIds }) =>
    memberIds.includes(run.humanId)
  )
  const commitments = social
    .filter(
      (entry) =>
        entry.kind === 'vote-plan' &&
        entry.accepted &&
        (entry.actorId === run.humanId || entry.recipientId === run.humanId)
    )
    .reverse()
  return {
    guests,
    activePacts,
    alliances,
    commitments,
    accounts: knownAccounts(run),
    saved: state.saved,
    watches: state.watches.slice().reverse(),
    witnesses: state.witnesses.slice().reverse(),
    notes: state.notes,
    votes: state.votes.slice().reverse(),
  }
}

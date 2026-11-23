import type { Run, SocialEntry } from './run.ts'

export type GameLogEntry = {
  day: number
  text: string
  kind: 'season' | 'vote' | 'departure' | 'conversation'
}

function guestName(run: Run, id: string) {
  return run.seats.find((seat) => seat.id === id)?.name ?? 'A guest'
}

function departure(seat: Run['seats'][number]): GameLogEntry[] {
  const exit = seat.exit
  if (!exit) return []
  const role = exit.revealedRole === 'betrayer' ? 'Betrayer' : 'Loyal'
  return [
    {
      day: exit.day,
      kind: 'departure',
      text:
        exit.cause === 'night'
          ? `${seat.name} did not return at dawn.`
          : `${seat.name} was banished.${exit.revealedRole ? ` Their role was revealed as ${role}.` : ''}`,
    },
  ]
}

function personalActivity(run: Run, entries: readonly SocialEntry[]): GameLogEntry[] {
  return entries.flatMap(({ day, actorId, recipientId, kind, accepted, alliance, shieldPlan }) => {
    if (actorId !== run.humanId && recipientId !== run.humanId) return []
    const guest = guestName(run, actorId === run.humanId ? recipientId : actorId)
    if (kind === 'lay-low') return [{ day, text: 'You laid low.', kind: 'conversation' }]
    if (kind === 'eavesdrop')
      return [{ day, text: 'You listened in on a castle conversation.', kind: 'conversation' }]
    if (kind === 'found-alliance')
      return [
        {
          day,
          text: accepted
            ? `You founded ${alliance?.name}.`
            : 'Your alliance invitation fell through.',
          kind: 'conversation',
        },
      ]
    if (kind === 'alliance-update')
      return [{ day, text: `You followed up on ${alliance?.name}.`, kind: 'conversation' }]
    if (kind === 'explore-castle')
      return [{ day, text: 'You explored the castle and gathered Info.', kind: 'conversation' }]
    if (kind === 'group-chat')
      return [{ day, text: `You caught up with ${guest} in a group chat.`, kind: 'conversation' }]
    if (kind === 'shield-request') {
      return accepted
        ? []
        : [
            {
              day,
              text: `${guest} declined your request for a Night Shield.`,
              kind: 'conversation',
            },
          ]
    }
    if (kind === 'shield-plans') {
      const text =
        shieldPlan === 'keep'
          ? `${guest} said they planned to keep the Night Shield.`
          : shieldPlan === 'open-to-gift'
            ? `${guest} said they might pass on the Night Shield.`
            : `${guest} kept their shield plans private.`
      return [{ day, text, kind: 'conversation' }]
    }
    const text =
      kind === 'alliance' && accepted
        ? `You and ${guest} formed an alliance.`
        : kind === 'vote-plan' && accepted
          ? `You and ${guest} agreed on a voting plan.`
          : kind === 'shield-gift'
            ? actorId === run.humanId
              ? `You gave ${guest} a Night Shield.`
              : `${guest} gave you a Night Shield.`
            : `You spoke privately with ${guest}.`
    return [{ day, text, kind: 'conversation' }]
  })
}

export function gameLogFor(run: Run): GameLogEntry[] {
  if (run.activity) return run.activity
  const opening: GameLogEntry = {
    day: 1,
    kind: 'season',
    text: `The season began with ${run.seats.length} guests.`,
  }
  return [opening, ...run.seats.flatMap(departure), ...personalActivity(run, run.social)].sort(
    (a, b) => a.day - b.day
  )
}

export function recordGameActivity(previous: Run | null, next: Run): Run {
  if (!previous || previous.id !== next.id) return { ...next, activity: gameLogFor(next) }
  const entries: GameLogEntry[] = []
  const add = (text: string, kind: GameLogEntry['kind'] = 'season') => {
    entries.push({ day: next.day, kind, text })
  }
  if (next.day > previous.day) add('The castle opened for a new day.')
  const shieldSave = next.private.lastShieldSave
  if (next.day > previous.day && shieldSave?.day === next.day && shieldSave.id === next.humanId) {
    add('Your Night Shield stopped the Conclave’s attempt.')
  }
  if (next.immunityId && next.immunityId !== previous.immunityId) {
    add(`${guestName(next, next.immunityId)} won immunity.`)
  }
  if (next.publicShield && next.publicShield.day !== previous.publicShield?.day) {
    add(`${guestName(next, next.publicShield.id)} received the Public Shield.`)
  }
  if (next.pot > previous.pot) {
    add(`${(next.pot - previous.pot).toLocaleString()} was added to the pot.`)
  }
  if (next.tableSway?.investigation && next.tableSway !== previous.tableSway) {
    add(
      `You brought an account about ${guestName(next, next.tableSway.targetId)} to the Round Table.`,
      'conversation'
    )
  }
  if (previous.tableCount && next.runoffIds && next.tableRound !== previous.tableRound) {
    add(`A tie sent ${next.runoffIds.length} guests to a runoff.`, 'vote')
  }
  if (next.lastTable && next.lastTable !== previous.lastTable) {
    const { banishedId, tally, tiedByDraw } = next.lastTable
    const guest = guestName(next, banishedId)
    const votes = tally[banishedId] ?? 0
    add(
      tiedByDraw
        ? `The tied ballot went to a draw. ${guest} was drawn.`
        : `${guest} received ${votes} ${votes === 1 ? 'vote' : 'votes'} at the Round Table.`,
      'vote'
    )
  }
  entries.push(
    ...next.seats.flatMap((seat, index) =>
      seat.exit && !previous.seats[index]?.exit ? departure(seat) : []
    )
  )
  entries.push(...personalActivity(next, next.social.slice(previous.social.length)))
  if (next.result && !previous.result) {
    add(
      next.result.winningRole === 'loyal'
        ? 'The Loyals won the season.'
        : 'The Betrayers won the season.'
    )
  }
  return entries.length ? { ...next, activity: [...gameLogFor(previous), ...entries] } : next
}

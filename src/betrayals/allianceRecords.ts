import type { CastleAlliance, SocialEntry } from './run.ts'

export function socialEntryVisibleTo(entry: SocialEntry, actorId: string): boolean {
  return (
    entry.actorId === actorId ||
    entry.recipientId === actorId ||
    Boolean(entry.accepted && entry.alliance?.memberIds.includes(actorId))
  )
}

export function castleAlliances(entries: readonly SocialEntry[]): CastleAlliance[] {
  const latest = new Map<string, CastleAlliance>()
  for (const entry of entries) {
    if (
      entry.accepted &&
      entry.alliance &&
      (entry.kind === 'found-alliance' || entry.kind === 'alliance-update')
    ) {
      latest.set(entry.alliance.id, entry.alliance)
    }
  }
  return [...latest.values()].filter((alliance) => !alliance.closed)
}

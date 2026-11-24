import type { ConclaveLine, ConclaveProposal } from './night.ts'

export type ConclaveReport = ConclaveLine & { aboutId: string }

export function composeConclaveConversation(
  proposals: readonly ConclaveProposal[],
  reports: readonly ConclaveReport[]
): ConclaveLine[] {
  // Let a nomination with a reply open the scene when the room has one.
  const opening = proposals.find((proposal) =>
    reports.some(
      (report) => report.aboutId === proposal.nomineeId && report.speakerId !== proposal.speakerId
    )
  )
  const nominations = opening
    ? [opening, ...proposals.filter((proposal) => proposal !== opening)]
    : proposals
  const lines: ConclaveLine[] = []
  const covered = new Map<string, Set<string>>()
  const given = new Set<ConclaveReport>()

  for (const { nomineeId, nomineeName, ...proposal } of nominations) {
    const cases = covered.get(nomineeId) ?? new Set<string>()
    if (!cases.has(proposal.argument)) {
      const last = lines.at(-1)
      const continues = last?.speakerId === proposal.speakerId && !last.nomineeName
      const lead = continues
        ? `I'd go with ${nomineeName}.`
        : cases.size
          ? `I'd keep ${nomineeName} on the table.`
          : lines.length
            ? `What about ${nomineeName}?`
            : `${nomineeName}.`
      const argument = lead + ' ' + proposal.argument
      if (continues && last.argument.length + argument.length < 164) {
        lines[lines.length - 1] = {
          ...proposal,
          nomineeName,
          argument: last.argument + ' ' + argument,
        }
      } else {
        lines.push({ ...proposal, nomineeName, argument })
      }
      cases.add(proposal.argument)
      covered.set(nomineeId, cases)
    }
    for (const report of reports) {
      if (
        given.has(report) ||
        report.aboutId !== nomineeId ||
        report.speakerId === proposal.speakerId
      ) {
        continue
      }
      lines.push(report)
      given.add(report)
    }
  }

  // Reports on the other ballot options can still matter to the player.
  return [...lines, ...reports.filter((report) => !given.has(report))]
}

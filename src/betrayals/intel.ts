import { getSocialPersonality } from '../social/socialPersonalityBank.ts'
import { mulberry32 } from '../store/rng.ts'
import { relationship } from './perception.ts'
import { CAST_SIZE, eligibleBanishmentTargets, hashId, isCurrentCommand } from './run.ts'
import type { CommandToken, Run, TableArgument } from './run.ts'
import { recordSocialWallet, socialWalletFor } from './socialResources.ts'

export type WitnessLead = {
  day: number
  suspectId: string
  pitchId: string
  sourceId: string
  witnessId: string
  relayId: string
  promised?: true
}

export type TableEvidence = 'call-witness' | 'name-source'

const WITNESS_COST = 1

export function activeLead(run: Run): WitnessLead | undefined {
  const lead = run.witnessLead
  return lead?.day === run.day ? lead : undefined
}

function isPresent(run: Run, id: string) {
  return run.seats.some((seat) => seat.id === id && !seat.exit)
}

/** A firsthand witness can decide to speak for themselves. A promised witness waits to be called. */
export function voluntaryWitness(run: Run): TableArgument | undefined {
  const lead = activeLead(run)
  if (
    !lead ||
    lead.promised ||
    run.phase !== 'round-table' ||
    !isPresent(run, lead.witnessId) ||
    !eligibleBanishmentTargets(run, lead.witnessId).includes(lead.suspectId)
  )
    return
  const { bond } = relationship(run.social, lead.witnessId, lead.suspectId)
  const personality = getSocialPersonality(lead.witnessId)
  const roll = mulberry32(run.publicSeed ^ hashId(lead.witnessId) ^ Math.imul(run.day, 2549))()
  if (roll > 0.08 + personality.publicConflictComfort * 0.3 - bond * 0.27) return
  return {
    speakerId: lead.witnessId,
    targetId: lead.suspectId,
    tone: 'careful',
    basis: 'conversation',
    evidence: 'call-witness',
  }
}

export function leadForPlayer(run: Run) {
  const lead = activeLead(run)
  if (
    !lead ||
    !isPresent(run, run.humanId) ||
    !isPresent(run, lead.suspectId) ||
    voluntaryWitness(run)
  )
    return
  const name = (id: string) => run.seats.find((seat) => seat.id === id)?.name ?? 'A guest'
  return {
    suspectId: lead.suspectId,
    suspect: name(lead.suspectId),
    pitch: name(lead.pitchId),
    source: name(lead.sourceId),
    relay: name(lead.relayId),
    witness: name(lead.witnessId),
    promised: lead.promised === true && isPresent(run, lead.witnessId),
    canAsk:
      (run.phase === 'social' || run.phase === 'round-table') &&
      run.tableSway === undefined &&
      eligibleBanishmentTargets(run, run.humanId).includes(lead.suspectId) &&
      !run.tableCount &&
      !run.runoffIds &&
      !lead.promised &&
      isPresent(run, lead.witnessId) &&
      socialWalletFor(run, run.humanId).energy >= WITNESS_COST,
  }
}

export function askWitness(run: Run, token: CommandToken): Run {
  const lead = activeLead(run)
  if (!isCurrentCommand(run, token) || !lead || !leadForPlayer(run)?.canAsk) return run
  return {
    ...run,
    revision: run.revision + 1,
    witnessLead: { ...lead, promised: true },
    socialWallets: recordSocialWallet(run, run.humanId, { energy: -WITNESS_COST }, WITNESS_COST),
  }
}

export function canPresentEvidence(run: Run, targetId: string, evidence: TableEvidence) {
  const lead = activeLead(run)
  if (!lead || lead.suspectId !== targetId || !leadForPlayer(run)) return false
  if (evidence === 'call-witness') return lead.promised === true && isPresent(run, lead.witnessId)
  return evidence === 'name-source' && isPresent(run, lead.sourceId)
}

/** A single vote pitch can travel by several routes. Treat it as one incident. */
export function incidentPressure(run: Run, observerId: string): ReadonlyMap<string, number> {
  const lead = activeLead(run)
  const pressure = new Map<string, number>()
  if (!lead || observerId === lead.suspectId) return pressure

  const firsthand = observerId === lead.sourceId || observerId === lead.witnessId
  const knowsRelay = observerId === lead.relayId || observerId === run.humanId
  const atTable = run.phase === 'round-table' || run.phase === 'final-banishment'
  const evidence = atTable ? publicEvidence(run)?.evidence : undefined
  const hasPublicWitness = evidence === 'call-witness'
  const namedPublicly = evidence === 'name-source'
  const confidence =
    firsthand || hasPublicWitness ? 0.94 : knowsRelay ? 0.38 : namedPublicly ? 0.13 : 0
  // A single contradiction can swing a close table. It carries less weight in a large,
  // fragmented room where most guests barely know either side of the story.
  const activeCount = run.seats.filter(({ exit }) => !exit).length
  const roleRelevance = atTable ? Math.min(0.65, 0.09 + (CAST_SIZE - activeCount) * 0.024) : 0.18

  if (confidence) pressure.set(lead.suspectId, confidence * roleRelevance)
  return pressure
}

function publicEvidence(run: Run) {
  return (
    run.tableArguments?.find(({ evidence }) => evidence) ??
    (run.tableSway?.evidence ? { ...run.tableSway, speakerId: run.humanId } : undefined)
  )
}

export function evidenceSpeech(run: Run) {
  const lead = activeLead(run)
  if (!lead) return []
  const name = (id: string) => run.seats.find((seat) => seat.id === id)?.name ?? 'that guest'
  const denial = {
    speakerId: lead.suspectId,
    targetId: lead.pitchId,
    verb: 'on',
    argument: `I never asked anyone to vote for ${name(lead.pitchId)}.`,
  }
  const statement = publicEvidence(run)
  if (!statement) return [denial]
  const callingWitness = statement.evidence === 'call-witness'
  const responseId = callingWitness ? lead.witnessId : lead.sourceId
  const response = {
    speakerId: responseId,
    targetId: lead.suspectId,
    verb: 'on',
    argument: callingWitness
      ? `I heard you ask for a vote against ${name(lead.pitchId)}. I was there.`
      : 'I told you that in confidence. I’m leaving it there.',
  }
  if (statement.speakerId === responseId) return [denial, response]
  return [
    denial,
    {
      speakerId: statement.speakerId,
      targetId: lead.suspectId,
      verb: 'questions',
      argument: callingWitness
        ? `${name(responseId)}, can you tell the room what you heard?`
        : `${name(responseId)} told me you made that exact pitch.`,
    },
    response,
  ]
}

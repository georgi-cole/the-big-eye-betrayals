import { createContext, useCallback, useContext, useEffect, useLayoutEffect } from 'react'
import type { CompetitionResult } from './competitionResult'

/** Absent in standalone games, demos, native overlays and the minigame lab. */
export const CompetitionResultContext = createContext<
  ((result: CompetitionResult) => Promise<boolean>) | null
>(null)

/** A host can replace the game's final screen before it paints. */
export const HostResultsContext = createContext(false)

export function useCompetitionResultCheckpoint(
  result: CompetitionResult | (() => CompetitionResult | null) | null
): void {
  const checkpoint = useContext(CompetitionResultContext)
  const hostResults = useContext(HostResultsContext)
  const saveResult = useCallback(() => {
    if (!checkpoint) return
    const completed = typeof result === 'function' ? result() : result
    if (completed) void checkpoint(completed)
  }, [checkpoint, result])

  useLayoutEffect(() => {
    if (hostResults) saveResult()
  }, [hostResults, saveResult])

  useEffect(() => {
    if (!hostResults) saveResult()
  }, [hostResults, saveResult])
}

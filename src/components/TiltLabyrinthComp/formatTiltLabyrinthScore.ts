export function formatTiltLabyrinthScore(timeMs: number): string {
  const totalSeconds = timeMs / 1000
  if (totalSeconds < 60) return `${totalSeconds.toFixed(2)}s`
  const minutes = Math.floor(totalSeconds / 60)
  return `${minutes}:${(totalSeconds % 60).toFixed(2).padStart(5, '0')}`
}

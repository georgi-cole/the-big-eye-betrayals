import { legacyMinigameColor, minigameToneProperty } from './minigamePalette'

export type MinigameCanvasPaint = (color: string) => string

export function minigameCanvasPaint(canvas: HTMLCanvasElement): MinigameCanvasPaint {
  if (!canvas.closest?.('[data-minigame-theme="betrayals"]')) return (color) => color

  const style = getComputedStyle(canvas)
  const tones = Object.fromEntries(
    (['shadow', 'base', 'surface', 'raised', 'edge', 'bronze', 'gold', 'ivory'] as const).map(
      (tone) => [tone, style.getPropertyValue(minigameToneProperty(tone)).trim()]
    )
  )
  // Most canvas paint repeats each frame. Cap the cache because glow alpha varies over time.
  const recentColors = new Map<string, string>()
  return (color) => {
    const cached = recentColors.get(color)
    if (cached !== undefined) return cached
    const original = legacyMinigameColor(color)
    const channels = original ? tones[original.tone] : ''
    const paint = original && channels ? `rgb(${channels} / ${original.alpha ?? 1})` : color
    if (recentColors.size >= 64) recentColors.clear()
    recentColors.set(color, paint)
    return paint
  }
}

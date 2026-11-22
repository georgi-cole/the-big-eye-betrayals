const themePrefix = '--betrayals-game-'

// Only the legacy violet/indigo chrome is exchanged. Reds, greens, cyans
// and other gameplay colors keep their original channels.
function legacyTone(red: number, green: number, blue: number) {
  const delta = blue - Math.min(red, green)
  if (blue < Math.max(red, green) || delta < 4) return
  const hue = 240 + (60 * (red - green)) / delta
  const lightness = (blue + Math.min(red, green)) / 510
  if (hue < 219 || hue > 300 || (hue < 234 && lightness > 0.35)) return
  if (lightness < 0.04) return 'shadow'
  if (lightness < 0.08) return 'base'
  if (lightness < 0.15) return 'surface'
  if (lightness < 0.24) return 'raised'
  if (lightness < 0.39) return 'edge'
  if (lightness < 0.62) return 'bronze'
  if (lightness < 0.86) return 'gold'
  return 'ivory'
}

type PaintColor = {
  tone: NonNullable<ReturnType<typeof legacyTone>>
  channels: string
  alpha: string | undefined
}

export function legacyMinigameColor(value: string): PaintColor | undefined {
  let channels: number[]
  let alpha: string | undefined
  if (/^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(value)) {
    const hex = value.slice(1)
    const expanded = hex.length <= 4 ? Array.from(hex, (digit) => digit.repeat(2)).join('') : hex
    const bytes = (expanded.match(/../g) ?? []).map((byte) => parseInt(byte, 16))
    channels = bytes.slice(0, 3)
    if (bytes.length === 4) alpha = (bytes[3] / 255).toFixed(4)
  } else {
    const match =
      /^rgba?\(\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(
        value
      )
    if (!match) return
    channels = match
      .slice(1, 4)
      .map((part) =>
        part.endsWith('%') ? Math.round((parseFloat(part) * 255) / 100) : Number(part)
      )
    alpha = match[4]
  }
  const tone = legacyTone(channels[0], channels[1], channels[2])
  if (tone) return { tone, channels: channels.join(' '), alpha }
}

export function minigameToneProperty(tone: PaintColor['tone']) {
  return themePrefix + tone
}

import type { CSSProperties } from 'react'
import './sleep-mask.css'

const maskArt = import.meta.env.BASE_URL + 'assets/betrayals/sleep-mask.webp'

// Eye midpoint and mask width as percentages of the original square portrait.
type MaskFit = [eyeX: number, eyeY: number, width: number, angle?: number]

const portraitFits: Partial<Record<string, MaskFit>> = {
  aria: [50, 34, 43],
  ash: [50, 33, 42],
  bea: [50.5, 43, 42],
  blue: [50, 34.5, 39],
  dex: [49, 32, 41],
  echo: [49.5, 36, 42],
  finn: [49.5, 31.5, 42],
  ivy: [49, 33, 40],
  jax: [50, 33.5, 42],
  kai: [50, 37.5, 44],
  kian: [50.5, 34.5, 46],
  lux: [50, 32.5, 39],
  mimi: [51, 37.5, 43],
  nico: [50, 39.5, 43],
  noa: [50.5, 34.5, 47],
  nova: [51.5, 36.5, 42],
  pax: [50, 39.5, 47],
  quinn: [50, 36.5, 41],
  rae: [50, 38, 45],
  remy: [50, 37.5, 43],
  rey: [51.5, 37, 45],
  rune: [50, 37, 40],
  sol: [49.5, 36.5, 44],
  vee: [49, 37.5, 45],
  zed: [50, 38, 44],
  5: [48, 32.5, 45],
  15: [52, 33.5, 43, -4],
  25: [50.5, 30, 42, -9],
}

function fitForPortrait(portrait?: string) {
  const source = portrait?.toLowerCase()
  const id =
    source?.match(/(?:^|\/)assets\/skins\/([a-z]+)_avatar\.webp(?:[?#].*)?$/)?.[1] ??
    source?.match(
      /(?:^|\/)assets\/player_characters\/character(?:%20| )(\d+)\/main\.webp(?:[?#].*)?$/
    )?.[1]
  return id && Object.hasOwn(portraitFits, id) ? portraitFits[id] : undefined
}

export function SleepMask({ portrait }: { portrait?: string }) {
  const fit = fitForPortrait(portrait)
  const style = fit
    ? ({
        '--sleep-eye-x': (fit[0] - 50) / 100,
        '--sleep-eye-y': fit[1] / 100,
        '--sleep-mask-width': fit[2] / 100,
        '--sleep-mask-angle': (fit[3] ?? 0) + 'deg',
      } as CSSProperties)
    : undefined
  return (
    <span
      className="betrayals-sleep-mask"
      data-symbolic={!fit || undefined}
      style={style}
      aria-hidden="true"
    >
      {fit && <img src={maskArt} alt="" draggable={false} />}
    </span>
  )
}

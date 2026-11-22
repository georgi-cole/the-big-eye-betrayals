import postcss from 'postcss'
import { describe, expect, it } from 'vitest'
import { betrayalsMinigameCss } from '../../../scripts/lib/betrayals-minigame-css'
import { minigameCanvasPaint } from '../../../src/minigames/minigameCanvasPaint'

const css = `
.cm__card { background: url("/studio.svg#abcdef"), linear-gradient(#120d1e, rgba(124, 92, 255, .5)); }
.cm__swatch { background: var(--target); color: #36df9f; }
.cm__slider-row--b .cm__slider { accent-color: #818cf8; }
`

describe('Betrayals minigame palette', () => {
  it('themes shared chrome and keeps original CSS color channels as fallbacks', () => {
    const styled = postcss([betrayalsMinigameCss]).process(css, {
      from: '/src/components/ColorMatchComp/ColorMatchComp.css',
    }).css
    expect(styled).toContain('rgb(var(--betrayals-game-surface, 18 13 30))')
    expect(styled).toContain('rgb(var(--betrayals-game-gold, 124 92 255) / .5)')
    expect(styled).toContain('url("/studio.svg#abcdef")')
    expect(styled).toContain('background: var(--target); color: #36df9f')
    expect(styled).toContain('accent-color: #818cf8')
  })

  it('leaves unrelated app styles untouched', () => {
    const styled = postcss([betrayalsMinigameCss]).process(css, { from: '/src/index.css' }).css
    expect(styled).toBe(css)
  })

  it('uses scoped tones for canvas rendering while preserving warning colors', () => {
    const stage = document.createElement('div')
    const canvas = document.createElement('canvas')
    stage.append(canvas)
    document.body.append(stage)
    try {
      expect(minigameCanvasPaint(canvas)('#7c3aed')).toBe('#7c3aed')
      stage.dataset.minigameTheme = 'betrayals'
      // JSDOM does not resolve inherited custom properties.
      canvas.style.setProperty('--betrayals-game-bronze', '160 115 71')
      const paint = minigameCanvasPaint(canvas)
      expect(paint('rgba(124, 58, 237, 0.7)')).toBe('rgb(160 115 71 / 0.7)')
      expect(paint('#f43f5e')).toBe('#f43f5e')
    } finally {
      stage.remove()
    }
  })
})

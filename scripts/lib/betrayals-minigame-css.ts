import type { Plugin } from 'postcss'
import { legacyMinigameColor, minigameToneProperty } from '../../src/minigames/minigamePalette'

const gameStyles = new Set([
  'BoxedOut',
  'Capitalization',
  'ChainOfGreed',
  'ClosestWithoutGoingOverComp',
  'CodeBreakerComp',
  'ColorMatchComp',
  'EstimationGame',
  'FamousFiguresComp',
  'GatesOfTheEye',
  'GlassBridgeComp',
  'GridOfLuck',
  'HoldTheWallComp',
  'HouseOfCardsComp',
  'HouseOfDarknessComp',
  'MajorityRulesComp',
  'MinigameHost',
  'MinigameRules',
  'MinigameUtilityDock',
  'NumberTrivia',
  'PercentagePanic',
  'PressurePlank',
  'QuickTapRace',
  'RiskWheelComp',
  'TiltLabyrinthComp',
  'TimingBar',
  'TrapAuction',
  'VaultVerdict',
])
const sharedStyles = /\/src\/styles\/(?:minigame\w+|majorityRulesFinalDuel|houseOfCards\w+)\.css$/

function isMinigameStylesheet(file: string) {
  const path = file.replaceAll('\\', '/').split('?')[0]
  const component = /\/src\/components\/([^/.]+)/.exec(path)?.[1]
  return (
    (component !== undefined && gameStyles.has(component)) ||
    /\/src\/(?:minigames\/(?:quickTapRace|crystalPathShattered|socialChallenges)|screens\/QuickTapSeasons)\//.test(
      path
    ) ||
    sharedStyles.test(path)
  )
}

// CSS is parsed by PostCSS. Within a declaration, skip strings and URL
// values so the palette can touch gradient/shadow stops without touching art.
const paintToken =
  /url\((?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\\.|[^)])*\)|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|#[\da-f]{3,8}\b|\brgba?\([^()]*\)/gi

export const betrayalsMinigameCss: Plugin = {
  postcssPlugin: 'betrayals-minigame-css',
  Once(root) {
    if (!isMinigameStylesheet(root.source?.input.file ?? '')) return

    root.walkDecls((declaration) => {
      const rule = declaration.parent
      const selector = rule?.type === 'rule' ? rule.selector : ''
      // The blue channel is part of the RGB puzzle. The violet door color
      // distinguishes an option in Bigg Gates.
      if (selector.includes('.cm__slider-row--b') || declaration.prop === '--gate-violet') return

      declaration.value = declaration.value.replace(paintToken, (value) => {
        const color = legacyMinigameColor(value)
        if (!color) return value
        const opacity = color.alpha === undefined ? '' : ` / ${color.alpha}`
        return `rgb(var(${minigameToneProperty(color.tone)}, ${color.channels})${opacity})`
      })
    })
  },
}

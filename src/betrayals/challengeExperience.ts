import type { ReactMinigameCompletion } from '../minigames/competitionResult'
import { getGame, type GameRegistryEntry } from '../minigames/registryBase'
import {
  quickTapVipDurationMs,
  type QuickTapVipMode,
} from '../minigames/quickTapRace/vip/quickTapVipLogic'
import type { ChallengeGame } from './challengeRotation'

export function betrayalsChallengeExperience(game: GameRegistryEntry, premiumGames: boolean) {
  const current = getGame(game.key) ?? game
  const quickTapVariant: QuickTapVipMode | undefined = !premiumGames
    ? undefined
    : game.key === 'quickTap'
      ? 'race'
      : game.key === 'quickTapSeasons'
        ? 'seasons'
        : undefined
  return {
    // Majority Rules exposes its premium studio/content treatment separately
    // from the shared registry flag. Edition artwork remains available to all.
    premiumPresentation:
      premiumGames &&
      (current.premiumExperience === 'presentation' || game.key === 'majorityRules'),
    quickTapVariant,
  }
}

export function betrayalsChallengeInstructions(game: GameRegistryEntry, premiumGames: boolean) {
  const { quickTapVariant } = betrayalsChallengeExperience(game, premiumGames)
  if (!quickTapVariant) return game.instructions
  return quickTapVariant === 'race'
    ? [
        'Race through three 25-second rounds, with a short break between rounds.',
        'Tap to score and decide which timed mystery boosts to grab. Every contestant uses the same rules.',
        'Your scores carry across all three rounds. The highest final score wins.',
      ]
    : [
        'Play three 28-second rounds. The season changes every seven seconds and changes the value of your taps.',
        'Winter taps lose points. Watch the current season and any active mystery-box effects.',
        'You can reroll the current season once per round. All contestants face the same seasonal rules.',
        'Your scores carry across all three rounds. The highest final score wins.',
      ]
}

/** Edition rules must not be replaced by a standard variant's translation keys. */
export function betrayalsChallengeRules(game: GameRegistryEntry, premiumGames: boolean) {
  const { quickTapVariant } = betrayalsChallengeExperience(game, premiumGames)
  if (!quickTapVariant) return game
  return {
    ...game,
    instructionKeys: undefined,
    descriptionKey: undefined,
    instructions: betrayalsChallengeInstructions(game, premiumGames),
    timeLimitMs: quickTapVipDurationMs(quickTapVariant),
  }
}

/** Keep the longer VIP race from multiplying the season pot merely through duration. */
export function betrayalsChallengePotTarget(
  game: ChallengeGame,
  completion?: ReactMinigameCompletion
): ChallengeGame['potTarget'] {
  const variant = completion?.betrayalsQuickTapVariant
  const expected =
    game.key === 'quickTap' ? 'race' : game.key === 'quickTapSeasons' ? 'seasons' : undefined
  return variant &&
    variant === expected &&
    typeof game.potTarget === 'number' &&
    game.timeLimitMs > 0
    ? (game.potTarget * quickTapVipDurationMs(variant)) / game.timeLimitMs
    : game.potTarget
}

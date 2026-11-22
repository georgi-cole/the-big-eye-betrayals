import { configureStore } from '@reduxjs/toolkit'
import { lazy, useRef, useState } from 'react'
import { Provider } from 'react-redux'
import { rankTiltLabyrinthResults } from '../components/TiltLabyrinthComp/tiltLabyrinthCollision'
import cwgo from '../features/cwgo/cwgoCompetitionSlice'
import famousFigures from '../features/famousFigures/famousFiguresSlice'
import glassBridge from '../features/glassBridge/glassBridgeSlice'
import houseOfCards from '../features/houseOfCards/houseOfCardsSlice'
import holdTheWall from '../features/holdTheWall/holdTheWallSlice'
import majorityRules from '../features/majorityRules/majorityRulesSlice'
import riskWheel from '../features/riskWheel/riskWheelSlice'
import tiltLabyrinth from '../features/tiltLabyrinth/tiltLabyrinthSlice'
import type { CompetitionResult, ReactMinigameCompletion } from '../minigames/competitionResult'
import { CompetitionResultContext, HostResultsContext } from '../minigames/competitionResultContext'
import reactComponents from '../minigames/reactComponents'
import { type ChallengeGame, challengePlayers, challengeSeed } from './challengeRotation'
import { challengeRelationships } from './challengeRelationships'
import { isSocialChallengeGameKey } from '../minigames/socialChallenges/shared'
import type { Run } from './run'

const QuickTap = lazy(() => import('../minigames/quickTapRace/QuickTapRaceCanvasGame'))
const ColorMatch = lazy(() => import('../components/ColorMatchComp/ColorMatchComp'))
const MajorityRules = lazy(() => import('../components/MajorityRulesComp/MajorityRulesComp'))
const DeckOfLight = lazy(() => import('../components/HouseOfCardsComp/HouseOfCardsComp'))
const RiskWheel = lazy(() => import('../components/RiskWheelComp/RiskWheelComp'))
const DontGoOver = lazy(() => import('../components/ClosestWithoutGoingOverComp'))
const HoldTheWall = lazy(() => import('../components/HoldTheWallComp/HoldTheWallComp'))
const FamousFigures = lazy(() => import('../components/FamousFiguresComp/FamousFiguresComp'))
const PercentagePanic = lazy(() => import('../components/PercentagePanic/PercentagePanic'))
const TiltLabyrinth = lazy(() => import('../components/TiltLabyrinthComp/TiltLabyrinthComp'))
const VaultCracker = lazy(() => import('../minigames/vaultCracker/VaultCrackerCanvasGame'))
const CrystalPath = lazy(() => import('../components/GlassBridgeComp/GlassBridgeComp'))
const CrystalPathInfinity = lazy(
  () => import('../minigames/crystalPathShattered/CrystalPathShatteredGame')
)
const TrapAuction = lazy(() => import('../components/TrapAuction/TrapAuction'))
const ChainOfGreed = lazy(() => import('../components/ChainOfGreed/ChainOfGreed'))
const DeckOfDarkness = lazy(() => import('../components/HouseOfDarknessComp/HouseOfDarknessComp'))

type Props = {
  run: Run
  game: ChallengeGame
  onFinish: (
    score?: number,
    tieBreak?: number,
    completion?: ReactMinigameCompletion
  ) => Promise<boolean>
}

export default function BetrayalsChallengeGame({ run, game, onFinish }: Props) {
  const [participants] = useState(() => challengePlayers(run, game))
  const [savingResults, setSavingResults] = useState(false)
  const pendingResult = useRef<Promise<boolean> | null>(null)
  const [participantIds] = useState(() => participants.map(({ id }) => id))
  const [store] = useState(() => {
    const gameState = {
      players: participants.map(({ id, name, avatar, isHuman, competitionProfile }) => ({
        id,
        name,
        avatar,
        isUser: isHuman,
        competitionProfile,
      })),
    }
    return configureStore({
      reducer: {
        game: () => gameState,
        social: () => ({ relationships: {} }),
        cwgo,
        famousFigures,
        glassBridge,
        holdTheWall,
        houseOfCards,
        majorityRules,
        riskWheel,
        tiltLabyrinth,
      },
    })
  })
  const seed = challengeSeed(run)
  const field = { participantIds, participants, seed }
  const usesSocialChoices = isSocialChallengeGameKey(game.key) || game.key === 'riskWheelAbyss'
  const prizeType: 'LOH' | 'POS' = run.phase === 'safety' ? 'POS' : 'LOH'

  function finishField(completion?: ReactMinigameCompletion, score?: number) {
    if (game.reactComponentKey === 'GlassBridge') {
      const { placements, progress } = store.getState().glassBridge
      completion = {
        ...completion,
        authoritativeRankedIds: placements,
        rawResults: Object.fromEntries(
          placements.map((id) => [id, progress[id]?.furthestRowReached ?? 0])
        ),
      }
    } else if (game.reactComponentKey === 'ClosestWithoutGoingOver') {
      const { aliveIds, eliminationOrder } = store.getState().cwgo
      completion = {
        ...completion,
        authoritativeRankedIds: [...aliveIds, ...[...eliminationOrder].reverse()],
      }
    }
    return onFinish(
      completion?.rawResults?.[run.humanId] ?? completion?.rawValue ?? score ?? 0,
      completion?.tiebreakerMs,
      completion
    )
  }

  function collectSafetyResult(result: CompetitionResult) {
    if (!pendingResult.current) {
      setSavingResults(true)
      pendingResult.current = result.partial
        ? onFinish()
        : finishField(result.completion, result.rawValue)
    }
    return pendingResult.current
  }

  if (savingResults) return <p role="status">Saving challenge results.</p>

  const hosted = {
    ...field,
    prizeType,
    onComplete: (completion?: ReactMinigameCompletion) => void finishField(completion),
  }
  let minigame
  switch (game.reactComponentKey) {
    case 'QuickTapRace':
      minigame = <QuickTap autoStart onFinish={onFinish} />
      break
    case 'ColorMatch':
      minigame = <ColorMatch seed={seed} onFinish={onFinish} />
      break
    case 'MajorityRules':
      minigame = (
        <MajorityRules
          {...field}
          prizeType={prizeType}
          simultaneousFinish
          onComplete={hosted.onComplete}
        />
      )
      break
    case 'HouseOfCards':
      minigame = (
        <DeckOfLight
          {...field}
          prizeType={prizeType}
          parallelBoards
          onComplete={hosted.onComplete}
        />
      )
      break
    case 'RiskWheel':
      minigame = <RiskWheel {...hosted} />
      break
    case 'HoldTheWall':
      minigame = (
        <HoldTheWall
          {...hosted}
          competitionTitle={run.phase === 'immunity' ? 'Full Immunity' : undefined}
        />
      )
      break
    case 'FamousFigures':
      minigame = <FamousFigures {...hosted} avoidRecentFigures={false} />
      break
    case 'PercentagePanic':
      minigame = <PercentagePanic {...hosted} />
      break
    case 'CodeBreaker':
      minigame = (
        <VaultCracker {...field} prizeType={prizeType} reportStandings onFinish={onFinish} />
      )
      break
    case 'TiltLabyrinth':
      minigame = (
        <TiltLabyrinth
          {...hosted}
          onComplete={(result) => {
            const { finalScores, runDetails } = store.getState().tiltLabyrinth
            const ranked = rankTiltLabyrinthResults(
              Object.entries(finalScores).map(([id, adjustedTimeMs]) => ({
                id,
                adjustedTimeMs,
                rawTimeMs: runDetails[id]?.rawTimeMs ?? adjustedTimeMs,
                hazardHits: runDetails[id]?.hazardHits ?? 0,
              }))
            )
            void finishField({ ...result, authoritativeRankedIds: ranked.map(({ id }) => id) })
          }}
        />
      )
      break
    case 'ClosestWithoutGoingOver':
      minigame = <DontGoOver {...hosted} />
      break
    case 'GlassBridge':
      minigame = <CrystalPath {...hosted} />
      break
    case 'CrystalPathShattered':
      minigame = <CrystalPathInfinity {...hosted} />
      break
    case 'TrapAuction':
      minigame = <TrapAuction {...hosted} autoStart />
      break
    case 'ChainOfGreed':
      minigame = <ChainOfGreed {...field} soloRushOnly onFinish={onFinish} />
      break
    case 'HouseOfDarkness':
      minigame = <DeckOfDarkness {...field} reportLifespan onFinish={onFinish} />
      break
    default: {
      if (!game.reactComponentKey || !reactComponents[game.reactComponentKey]) {
        throw new Error(`Missing Betrayals minigame: ${game.key}`)
      }
      const Minigame = reactComponents[game.reactComponentKey]
      minigame = (
        <Minigame
          {...field}
          autoStart
          vipQuickTap={false}
          voteEffectsEnabled={false}
          relationships={
            usesSocialChoices ? challengeRelationships(run, participantIds) : undefined
          }
          challengeArtwork={usesSocialChoices ? 'betrayals' : undefined}
          onFinish={onFinish}
        />
      )
      break
    }
  }

  return (
    <Provider store={store}>
      {run.phase === 'safety' ? (
        <HostResultsContext.Provider value>
          <CompetitionResultContext.Provider value={collectSafetyResult}>
            {minigame}
          </CompetitionResultContext.Provider>
        </HostResultsContext.Provider>
      ) : (
        minigame
      )}
    </Provider>
  )
}

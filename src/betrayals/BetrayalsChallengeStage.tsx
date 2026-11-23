import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { MinigamePortalContext } from '../components/MinigameHost/minigamePortal'
import { MinigameReadyCountdown } from '../components/MinigameHost/MinigameReadyCountdown'
import MinigameRules from '../components/MinigameRules/MinigameRules'
import MinigameUtilityDock from '../components/MinigameUtilityDock/MinigameUtilityDock'
import type { GameRegistryEntry } from '../minigames/registryBase'
import { BetrayalsChallengeAccessContext } from './challengeAccessContext'
import { betrayalsChallengeRules } from './challengeExperience'
import './challengeTheme.css'

type Props = {
  title: string
  game: GameRegistryEntry
  premiumGames?: boolean
  motion?: 'reduced'
  onForfeit: () => void
  children: ReactNode
}

export function BetrayalsChallengeStage({
  title,
  game,
  premiumGames = false,
  motion,
  onForfeit,
  children,
}: Props) {
  const [phase, setPhase] = useState<'rules' | 'countdown' | 'playing'>('rules')
  const [committedAccess, setCommittedAccess] = useState<boolean | null>(null)
  const [utilityView, setUtilityView] = useState<'menu' | 'rules' | 'forfeit' | null>(null)
  const [portalTarget] = useState(() => {
    const element = document.createElement('div')
    element.className = 'betrayals-challenge-portal'
    return element
  })
  const attachPortal = useCallback(
    (element: HTMLDivElement | null) => {
      if (element) element.appendChild(portalTarget)
      else portalTarget.remove()
    },
    [portalTarget]
  )
  const overlayOpen = utilityView === 'rules' || utilityView === 'forfeit'
  const challengeAccess = committedAccess ?? premiumGames
  const rulesGame = betrayalsChallengeRules(game, challengeAccess)

  useEffect(() => {
    if (!utilityView) return
    function dismiss(event: KeyboardEvent) {
      if (event.key === 'Escape') setUtilityView(null)
    }
    window.addEventListener('keydown', dismiss)
    return () => window.removeEventListener('keydown', dismiss)
  }, [utilityView])

  return (
    <main
      className="betrayals-layout betrayals-layout--challenge"
      data-betrayals-motion={motion}
      data-minigame-theme="betrayals"
    >
      <header className="betrayals-challenge-header">
        <h1>{title}</h1>
      </header>
      {phase === 'rules' && !overlayOpen && (
        <MinigameRules
          game={rulesGame}
          onConfirm={() => {
            setCommittedAccess(premiumGames)
            setPhase('countdown')
          }}
        />
      )}
      {phase === 'countdown' && (
        <div className="betrayals-challenge-ready" inert={utilityView !== null}>
          <MinigameReadyCountdown
            title={game.title}
            paused={utilityView !== null}
            onComplete={() => setPhase('playing')}
          />
        </div>
      )}
      {phase === 'playing' && (
        <div inert={utilityView !== null} className="betrayals-challenge-game" ref={attachPortal}>
          <MinigamePortalContext.Provider value={portalTarget}>
            <BetrayalsChallengeAccessContext.Provider value={challengeAccess}>
              {children}
            </BetrayalsChallengeAccessContext.Provider>
          </MinigamePortalContext.Provider>
        </div>
      )}
      {!overlayOpen && (
        <MinigameUtilityDock
          phase={phase}
          theme="betrayals"
          menuOpen={utilityView === 'menu'}
          onToggleMenu={() => setUtilityView((view) => (view === 'menu' ? null : 'menu'))}
          onCloseMenu={() => setUtilityView(null)}
          onOpenRules={() => setUtilityView('rules')}
          onRequestExit={() => setUtilityView('forfeit')}
          exitLabel="Forfeit challenge"
        />
      )}
      {overlayOpen &&
        createPortal(
          <div className="betrayals-challenge-utility" data-minigame-theme="betrayals">
            {utilityView === 'rules' ? (
              <MinigameRules
                game={rulesGame}
                mode="reference"
                confirmLabel={phase === 'countdown' ? 'Return to countdown' : 'Return to game'}
                onConfirm={() => setUtilityView(null)}
              />
            ) : (
              <div
                className="minigame-exit-confirm-overlay minigame-exit-confirm-overlay--obsidian"
                role="dialog"
                aria-modal="true"
                aria-labelledby="betrayals-forfeit-title"
              >
                <div className="minigame-exit-confirm">
                  <h2 id="betrayals-forfeit-title" className="minigame-exit-confirm__title">
                    Forfeit {game.title}?
                  </h2>
                  <p className="minigame-exit-confirm__copy">
                    Your score will be recorded as zero. The rest of the cast will complete the
                    challenge.
                  </p>
                  <div className="minigame-exit-confirm__actions">
                    <button
                      type="button"
                      className="minigame-exit-confirm__button minigame-exit-confirm__button--keep"
                      onClick={() => setUtilityView(null)}
                      autoFocus
                    >
                      Keep playing
                    </button>
                    <button
                      type="button"
                      className="minigame-exit-confirm__button minigame-exit-confirm__button--exit"
                      onClick={onForfeit}
                    >
                      Confirm forfeit
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>,
          document.body
        )}
    </main>
  )
}

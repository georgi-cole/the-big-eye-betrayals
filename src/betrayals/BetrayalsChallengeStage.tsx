import { type ReactNode, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import MinigameRules from '../components/MinigameRules/MinigameRules'
import MinigameUtilityDock from '../components/MinigameUtilityDock/MinigameUtilityDock'
import type { GameRegistryEntry } from '../minigames/registryBase'

type Props = {
  title: string
  game: GameRegistryEntry
  motion?: 'reduced'
  onForfeit: () => void
  children: ReactNode
}

export function BetrayalsChallengeStage({ title, game, motion, onForfeit, children }: Props) {
  const [utilityView, setUtilityView] = useState<'menu' | 'rules' | 'forfeit' | null>(null)
  const overlayOpen = utilityView === 'rules' || utilityView === 'forfeit'

  useEffect(() => {
    if (!utilityView) return
    function dismiss(event: KeyboardEvent) {
      if (event.key === 'Escape') setUtilityView(null)
    }
    window.addEventListener('keydown', dismiss)
    return () => window.removeEventListener('keydown', dismiss)
  }, [utilityView])

  return (
    <main className="betrayals-layout betrayals-layout--challenge" data-betrayals-motion={motion}>
      <header className="betrayals-challenge-header">
        <h1>{title}</h1>
      </header>
      <div inert={utilityView !== null}>{children}</div>
      {!overlayOpen && (
        <MinigameUtilityDock
          phase="playing"
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
          <div className="betrayals-challenge-utility">
            {utilityView === 'rules' ? (
              <MinigameRules game={game} mode="reference" onConfirm={() => setUtilityView(null)} />
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

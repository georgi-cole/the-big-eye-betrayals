import type { CSSProperties } from 'react'
import type { ConclaveView } from './night'
import './BetrayalsConclave.css'

export function BetrayalsConclave({
  view,
  selectedName,
}: {
  view: ConclaveView
  selectedName?: string
}) {
  return (
    <section className="betrayals-conclave" aria-label="Private conclave">
      {view.proposals.length > 0 && (
        <ol className="betrayals-conclave__voices" aria-label="Nominations" tabIndex={0}>
          {view.proposals.map(({ speakerName, portrait, nomineeName, argument }, index) => (
            <li
              key={`${speakerName}-${index}`}
              className="betrayals-conclave__voice"
              style={{ '--conclave-delay': `${index * 560}ms` } as CSSProperties}
            >
              {portrait ? (
                <img src={portrait} alt="" loading="lazy" />
              ) : (
                <span className="betrayals-conclave__hood" aria-hidden="true" />
              )}
              <div>
                <p className="betrayals-conclave__nomination">
                  <strong>{speakerName}</strong> nominates <strong>{nomineeName}</strong>
                </p>
                <p>{argument}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
      {view.targetIds.length > 0 && (
        <div className="betrayals-conclave__choice">
          <p>
            {selectedName ? (
              <>
                You nominate <strong>{selectedName}</strong>.
              </>
            ) : (
              'Choose your nominee from the roster.'
            )}
          </p>
          {selectedName && view.ownArgument && <p>{view.ownArgument}</p>}
        </div>
      )}
    </section>
  )
}

import type { IncomingInteraction } from './incoming'
import type { IncomingAnswer } from './run'
import './betrayals-incoming.css'

type Props = {
  interactions: readonly IncomingInteraction[]
  onRespond: (id: string, answer: IncomingAnswer) => void
}

const choices: Record<IncomingInteraction['kind'], { engage: string; listen?: string }> = {
  confidence: { engage: 'Take a walk' },
  alliance: { engage: 'Work together', listen: 'Stay friendly' },
  'vote-plan': { engage: 'Agree to the plan', listen: 'Hear them out' },
}

function outcome({ response, kind, speaker, target }: IncomingInteraction) {
  if (response === 'dismiss') return `You let ${speaker.name} go.`
  if (response === 'listen') {
    return target
      ? `${speaker.name} shared their suspicion of ${target.name}.`
      : `You hear ${speaker.name} out and leave the offer open.`
  }
  if (target) return `You and ${speaker.name} agreed to back a vote for ${target.name}.`
  return kind === 'alliance'
    ? `You and ${speaker.name} agreed to look out for each other.`
    : `Your quiet conversation with ${speaker.name} earned some trust.`
}

export function BetrayalsIncomingInteractions({ interactions, onRespond }: Props) {
  const pending = interactions.find(({ response }) => !response)
  const lastReply = interactions.filter(({ response }) => response).at(-1)
  if (!pending && !lastReply) return null

  const options = pending && choices[pending.kind]
  return (
    <section className="betrayals-incoming" aria-label="Incoming interactions">
      <p className="betrayals-incoming__receipt" role="status">
        {lastReply && outcome(lastReply)}
      </p>
      {pending && options && (
        <article key={pending.id} className="betrayals-incoming__encounter">
          <div className="betrayals-incoming__speaker">
            {pending.speaker.portrait && <img src={pending.speaker.portrait} alt="" />}
            <div>
              <span>Private approach</span>
              <h3>{pending.speaker.name}</h3>
            </div>
          </div>
          <blockquote>{pending.text}</blockquote>
          <div className="betrayals-incoming__choices">
            <button type="button" onClick={() => onRespond(pending.id, 'engage')}>
              {options.engage}
            </button>
            {options.listen && (
              <button type="button" onClick={() => onRespond(pending.id, 'listen')}>
                {options.listen}
              </button>
            )}
            <button type="button" onClick={() => onRespond(pending.id, 'dismiss')}>
              Pass
            </button>
          </div>
        </article>
      )}
    </section>
  )
}

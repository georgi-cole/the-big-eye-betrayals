import { useState } from 'react'
import ActionCard from '../components/SocialPanelV2/ActionCard'
import type { SocialActionDefinition } from '../social/socialActions'
import type { SocialEntry } from './run'

const options: SocialActionDefinition[] = [
  {
    id: 'rapport',
    title: 'Build trust',
    category: 'friendly',
    kind: 'rapport',
    baseCost: 1,
    description: 'Strengthen your relationship before voting.',
  },
  {
    id: 'question',
    title: 'Compare stories',
    category: 'strategic',
    kind: 'intel_gain',
    baseCost: 1,
    description: 'Hear who this contestant is considering for the Round Table.',
  },
  {
    id: 'alliance',
    title: 'Propose an alliance',
    category: 'alliance',
    kind: 'political_spend',
    baseCost: 1,
    description: 'Ask this contestant to work with you across days.',
  },
  {
    id: 'vote-plan',
    title: 'Agree a vote',
    category: 'strategic',
    kind: 'political_spend',
    baseCost: 1,
    description: 'Ask them to support your target at this Round Table.',
  },
]

type Person = { id: string; name: string }
type Props = {
  actorId: string
  contact: Person
  prospects: readonly Person[]
  actionsLeft: number
  onMove: (kind: SocialEntry['kind'], suspectId?: string) => void
}

export function BetrayalsSocialPanel({ actorId, contact, prospects, actionsLeft, onMove }: Props) {
  const [target, setTarget] = useState('')
  const eligible = prospects.filter(({ id }) => id !== actorId && id !== contact.id)
  const availableTarget = eligible.some(({ id }) => id === target)

  return (
    <section className="betrayals-social" aria-label="Social actions">
      <h2>Talk to {contact.name}</h2>
      <label>
        Vote target
        <select
          value={availableTarget ? target : ''}
          onChange={(event) => setTarget(event.target.value)}
        >
          <option value="">Choose a contestant</option>
          {eligible.map(({ id, name }) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <div className="betrayals-social__actions">
        {options.map((action) => (
          <ActionCard
            key={action.id}
            action={action}
            description={action.description}
            disabled={actionsLeft === 0 || (action.id === 'vote-plan' && !availableTarget)}
            disabledMessage={
              actionsLeft === 0 ? 'No social actions left today' : 'Choose a vote target'
            }
            onClick={() =>
              onMove(
                action.id as SocialEntry['kind'],
                action.id === 'vote-plan' ? target : undefined
              )
            }
          />
        ))}
      </div>
    </section>
  )
}

import type { RelationshipsMap } from '../social/types'
import { getSocialView, hasAlliance, relationship } from './perception'
import type { Run } from './run'
import { resolutionPerspective } from './strategy'

export function challengeRelationships(run: Run, ids: readonly string[]): RelationshipsMap {
  return Object.fromEntries(
    ids.map((actor) => {
      const perspective = resolutionPerspective(run, actor, ids)
      const visible = getSocialView(run, actor)
      return [
        actor,
        Object.fromEntries(
          ids
            .filter((id) => id !== actor)
            .map((id) => {
              const { bond, reliability } = relationship(visible, actor, id)
              return [
                id,
                {
                  affinity: bond,
                  tags: hasAlliance(visible, actor, id) ? ['alliance'] : [],
                  reality: {
                    trust: Math.max(0, reliability),
                    loyalty: 0,
                    resentment: 0,
                    suspicion: Math.max(0, perspective.evidence?.get(id) ?? 0),
                    fear: 0,
                  },
                },
              ]
            })
        ),
      ]
    })
  )
}

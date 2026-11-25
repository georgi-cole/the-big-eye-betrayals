import {
  BETRAYALS_RESOURCE_ICONS as socialResourceIcons,
  BETRAYALS_RESOURCE_NAMES as socialResourceNames,
} from './socialResourcePresentation'
import type { SocialResources } from './socialResources'

const resources = ['energy', 'influence', 'info'] as const

export function BetrayalsResourceCosts({ cost }: { cost: SocialResources }) {
  const charged = resources.filter((resource) => cost[resource] > 0)
  if (!charged.length) return null
  return (
    <span className="betrayals-resource-costs">
      {charged.map((resource) => (
        <span
          key={resource}
          role="img"
          aria-label={`${cost[resource]} ${socialResourceNames[resource]}`}
        >
          {socialResourceIcons[resource]} {cost[resource]}
        </span>
      ))}
    </span>
  )
}

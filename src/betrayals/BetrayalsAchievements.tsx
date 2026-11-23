import { useState } from 'react'
import { formatEyeoleans } from '../economy/eyeoleans'
import { CastSigil } from './CastSigil'
import {
  BETRAYALS_REWARD_AMOUNTS,
  type BetrayalsRewardCode,
  type BetrayalsRewardEvent,
} from './economy'
import type { BetrayalsWallet } from './profileWallet'
import './betrayalsAchievements.css'

export type BetrayalsMilestones = {
  runId: string
  dayReached: number
  won: boolean
  rewards: readonly BetrayalsRewardEvent[]
}

const amounts = BETRAYALS_REWARD_AMOUNTS
const rewards = [
  ['Make an eligible social move', amounts.socialAction],
  ['Finish a challenge', amounts.challengeParticipation],
  ['Win immunity', amounts.immunityWin],
  ['Win a Night Shield', amounts.safetyWin],
  ['Survive the night', amounts.survivedNight],
  ['Win the final challenge', amounts.finalChallengeWin],
  ['Reach the finale', amounts.finalist],
  ['Reach the season result as a survivor', amounts.seasonCompleted],
  ['Win the season', amounts.seasonWinner],
] as const

const trophyArt = import.meta.env.BASE_URL + 'assets/intro_hub_icons/hall_of_fame.svg'
const rewardReceipt = /^betrayals:.+:reward:(?:day:\d+:)?([a-z-]+)(?::\d+)?$/

export function BetrayalsAchievements({
  milestones,
  wallet,
  name,
}: {
  milestones?: BetrayalsMilestones
  wallet?: BetrayalsWallet
  name?: string
}) {
  const [tab, setTab] = useState<'case' | 'rewards'>('case')
  const receipts = new Set([
    ...(wallet?.recordedTransactionIds ?? []),
    ...(wallet?.transactions ?? [])
      .filter(({ source }) => source === 'season_reward')
      .map(({ id }) => id),
    ...(milestones?.rewards ?? []).map(({ id }) => id),
  ])
  const counts = new Map<string, number>()
  for (const id of receipts) {
    const code = rewardReceipt.exec(id)?.[1]
    if (code) counts.set(code, (counts.get(code) ?? 0) + 1)
  }
  const count = (code: BetrayalsRewardCode) => counts.get(code) ?? 0
  const victories =
    count('season-winner') +
    Number(!!milestones?.won && !receipts.has(`betrayals:${milestones.runId}:reward:season-winner`))
  const nights = count('survived-night')
  const immunities = count('immunity-win')
  const finales = count('finalist')
  const stats = [
    { label: 'Season victories', value: victories, icon: 'trophy' },
    { label: 'Nights survived', value: nights, icon: 'loyal' },
    { label: 'Immunity wins', value: immunities, icon: 'immunity' },
    { label: 'Finales reached', value: finales, icon: 'public' },
  ] as const
  const badges = [
    { label: 'Enter the castle', earned: !!milestones || counts.size > 0, icon: 'banished' },
    {
      label: 'First dawn',
      earned: nights > 0 || (milestones?.dayReached ?? 0) >= 2,
      icon: 'loyal',
    },
    { label: 'Immune', earned: immunities > 0, icon: 'immunity' },
    { label: 'Night Shield', earned: count('safety-win') > 0, icon: 'shield-night' },
    { label: 'Finalist', earned: finales > 0, icon: 'public' },
    { label: 'Castle champion', earned: victories > 0, icon: 'trophy' },
  ] as const
  const icon = (kind: (typeof badges)[number]['icon']) =>
    kind === 'trophy' ? <img src={trophyArt} alt="" /> : <CastSigil kind={kind} />

  return (
    <div className="betrayals-honors">
      <div className="betrayals-honors__tabs" role="group" aria-label="Hall of Fame views">
        <button type="button" aria-pressed={tab === 'case'} onClick={() => setTab('case')}>
          Trophy case
        </button>
        <button type="button" aria-pressed={tab === 'rewards'} onClick={() => setTab('rewards')}>
          Eyeros rewards
        </button>
      </div>
      {tab === 'case' ? (
        <>
          <section className="betrayals-honors__display" aria-label="Career stats">
            <h3>{name ? `${name}’s trophy case` : 'Your trophy case'}</h3>
            <dl className="betrayals-honors__stats">
              {stats.map(({ label, value, icon: mark }) => (
                <div key={label}>
                  <dt>
                    <span className="betrayals-honors__medallion" aria-hidden="true">
                      {icon(mark)}
                    </span>
                    {label}
                  </dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="betrayals-honors__badges" aria-label="Castle badges">
            <h3>Castle badges</h3>
            <span>
              {badges.filter(({ earned }) => earned).length} of {badges.length} earned
            </span>
            <ul>
              {badges.map(({ label, earned, icon: mark }) => (
                <li key={label} data-earned={earned}>
                  <span className="betrayals-honors__medallion" aria-hidden="true">
                    {icon(mark)}
                  </span>
                  <strong>{label}</strong>
                  <small>{earned ? 'Earned' : 'Locked'}</small>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : (
        <section className="betrayals-honors__rewards" aria-label="Eyeros rewards">
          <p>Earned Eyeros go to your Wallet.</p>
          <dl>
            {rewards.map(([label, amount]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{formatEyeoleans(amount)} Eyeros</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  )
}

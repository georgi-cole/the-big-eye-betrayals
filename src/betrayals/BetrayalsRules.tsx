import { useId, useState, type ReactNode } from 'react'
import { MIN_BETRAYERS, phaseLabel } from './seasonPhases'
import { SOCIAL_RECHARGE_ENERGY } from './socialResources'
import './betrayalsRules.css'

type HandbookChapter = {
  key: string
  bookmark: string
  title: string
  illustration: string
  body: ReactNode
}

const chapters: readonly HandbookChapter[] = [
  {
    key: 'loyal',
    bookmark: 'Loyals',
    title: 'The Loyal',
    illustration: 'loyal-wings.webp',
    body: (
      <>
        <p>
          You know your own role. The other guests must earn your trust. Listen in{' '}
          {phaseLabel.social}, compare stories, and decide whose actions match their words.
        </p>
        <p>
          <strong>What you can do.</strong> Speak and vote at the {phaseLabel['round-table']} to
          banish someone you suspect. Compete to build the pot and earn protection. A Night Shield
          can save you if the Betrayers choose you after dark.
        </p>
        <p>
          If you receive a private offer from the Conclave, you can accept and become a Betrayer.
          Declining takes you out of the game unless a Night Shield protects you.
        </p>
        <p className="betrayals-rules__oath">
          <strong>How you win.</strong> Survive until every Betrayer is out of the castle.
        </p>
      </>
    ),
  },
  {
    key: 'betrayer',
    bookmark: 'Betrayers',
    title: 'The Betrayer',
    illustration: 'conclave-mantle.png',
    body: (
      <>
        <p>
          The season starts with at least {MIN_BETRAYERS} Betrayers. Keep your role secret. By day,
          you talk, compete and vote alongside the Loyals.
        </p>
        <p>
          <strong>What you can do.</strong> At night, meet in the secret Conclave. You can propose
          an eligible Loyal and vote on whom to eliminate. By morning, you’re back among the guests.
          What you tell them is up to you.
        </p>
        <p>
          The Conclave may call on a lone Betrayer to recruit an eligible Loyal in place of the
          regular Night vote. Full Immunity protects guests from the offer that night.
        </p>
        <p className="betrayals-rules__oath">
          <strong>How you win.</strong> If a Betrayer is still in the castle at the end, the
          surviving Betrayers share the pot.
        </p>
      </>
    ),
  },
  {
    key: 'season',
    bookmark: 'The Season',
    title: 'A Day in the Castle',
    illustration: 'council.jpg',
    body: (
      <>
        <p>
          At breakfast, find out who returned and check the Inbox for guests who want to talk. Play
          the {phaseLabel.immunity}, then catch up at lunch and spend the afternoon speaking
          privately, comparing accounts, or arranging cover for the {phaseLabel.safety}.
        </p>
        <p>
          The {phaseLabel.immunity} is a chance to earn protection from both banishment and the
          Conclave. The {phaseLabel.safety} offers Night Shields. Your performances help build the
          shared pot.
        </p>
        <p>
          Messages marked Reply required pause the day until you answer or decline. Ordinary
          conversations can carry on among other guests while you spend your time elsewhere.
        </p>
        <p>
          At the {phaseLabel['round-table']}, hear the cases and cast your vote. Over cocktails,
          review the public ballot, talk through the result, and make plans with your allies before
          the Conclave meets. In the finale, the remaining guests decide whether to end the season
          or banish again.
        </p>
      </>
    ),
  },
  {
    key: 'notes',
    bookmark: 'Castle Notes',
    title: 'Notes for Your Stay',
    illustration: 'wax-envelope.webp',
    body: (
      <>
        <p>
          The Public Shield protects its holder at the Round Table. Night Shields protect against
          the Conclave. The game shows which protection you hold.
        </p>
        <p>
          Social cards show what each move costs. Each morning restores some Energy. Check in for
          Influence, or hear a suspicion and explore the castle for Info. You can still vote when
          your reserves are empty. At zero Energy, an available optional ad can grant{' '}
          {SOCIAL_RECHARGE_ENERGY} Energy once per real day.
        </p>
        <p>
          With Reality Mode, choose a guest in Social to observe them, ask around, or set a lookout.
          My Pulse keeps your accounts, commitments and votes together.
        </p>
        <p>
          If you’re eliminated, you can watch the season play out or return to a checkpoint when
          Rewind is offered. Eyeros you earn go to your Wallet. The season pot is shared by the
          surviving winners.
        </p>
      </>
    ),
  },
]

export function BetrayalsRules() {
  const [selected, setSelected] = useState(0)
  const spreadId = useId()
  const titleId = useId()
  const chapter = chapters[selected]

  return (
    <div className="betrayals-rules">
      <nav className="betrayals-rules__bookmarks" aria-label="Handbook chapters">
        {chapters.map(({ key, bookmark }, index) => (
          <button
            key={key}
            type="button"
            aria-controls={spreadId}
            aria-pressed={index === selected}
            onClick={() => setSelected(index)}
          >
            {bookmark}
          </button>
        ))}
      </nav>
      <article
        id={spreadId}
        aria-labelledby={titleId}
        className="betrayals-rules__spread"
        data-chapter={chapter.key}
      >
        <figure className="betrayals-rules__plate" aria-hidden="true">
          <img src={import.meta.env.BASE_URL + 'assets/betrayals/' + chapter.illustration} alt="" />
        </figure>
        <div className="betrayals-rules__leaf">
          <h3 id={titleId}>{chapter.title}</h3>
          {chapter.body}
        </div>
      </article>
    </div>
  )
}

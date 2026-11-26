import { useId, useState, type ReactNode } from 'react'
import {
  CLAIRVOYANT_MAX_USES,
  INFLUENCE_ROLE_MAX_USES,
  MAYOR_LAST_DAY,
  MAYOR_MAX_USES,
  CHANGE_OF_HEART_CAST,
  DRAMA_ROLE_ODDS,
  SECRET_BETRAYER_CAST,
} from './castleRoles'
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
          the Conclave. The game shows which protection you hold. A guest who gives you a Night
          Shield won't ask you for one that evening.
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
          Enable Drama Mode in Settings before starting a season to deal three Castle Roles. You
          have an {DRAMA_ROLE_ODDS.special}% chance of a Castle Role, a {DRAMA_ROLE_ODDS.betrayer}%
          chance of being a regular Betrayer, and a {DRAMA_ROLE_ODDS.loyal}% chance of being a
          regular Loyal.
        </p>
        <p>
          The Doctor can protect one guest per night and can choose themselves once per season. The
          Mayor can double their first ballot at up to {MAYOR_MAX_USES} Round Tables through Day{' '}
          {MAYOR_LAST_DAY}. Extrasense can check one other guest for a special role each night. The
          Doctor and Mayor powers close with seven guests remaining. All role powers expire when the
          Final Five begins.
        </p>
        <p>
          The Good Witch can stop one murder before the Conclave. The Illusionist can redirect one
          letter to a random different guest, including a Betrayer. Immunity and shields protect the
          final recipient. A Cursed guest joins the Betrayers at dawn if the Conclave's original
          letter would have killed them. These three powers close with seven guests remaining.
        </p>
        <p>
          Columbus can check a group of five other guests once per season and learn whether the
          group includes a Betrayer. The Clairvoyant automatically sees the winners on the first{' '}
          {CLAIRVOYANT_MAX_USES} hidden Shield Trial results. Public results use no charge. Shields
          can still change hands afterward.
        </p>
        <p>
          After Nightfall, the Secret Betrayer opens a private portrait gallery and chooses the
          murder target from the Conclave's shortlist. They join the regular Conclave when{' '}
          {SECRET_BETRAYER_CAST} guests remain. Alpha Betrayer can double an opening vote at up to{' '}
          {INFLUENCE_ROLE_MAX_USES} Conclaves. Bad Witch plays for the Betrayers and can cast a
          sleep spell when the Round Table opens, cancelling that ballot. The Politician can direct
          another guest’s first ballot at up to {INFLUENCE_ROLE_MAX_USES} Round Tables. The Dark
          Angel stops a secretly bound Betrayer from targeting them at one Conclave. Change of Heart
          can choose to join the Betrayers at dawn once {CHANGE_OF_HEART_CAST} or fewer guests
          remain. These active powers close when seven guests remain.
        </p>
        <p>
          The Medium can speak to one murdered guest and bring them back at dawn. Last Will can
          reveal one guest’s allegiance and Castle Role after leaving. Kamikaze can try to take a
          guest with them when they leave. Immunity and shields protect the target. Those three
          powers close when seven guests remain.
        </p>
        <p>
          On even-numbered days, the Introvert can answer messages and vote while Social is closed.
          The Fatigued must sit out either Immunity or the Shield Trial each day. The Diva can ask
          one guest per day for a private, truthful answer about their shield or most recent vote.
        </p>
        <p>
          When a role prompts you to act, select the portraits or ready the power with its on-screen
          control, then confirm with Play. Tap your choice again to clear it. Press Play with no
          choice to skip optional powers. Open the Castle Role card to see how and when your power
          works.
        </p>
        <p>
          If you hold a Loyal Castle Role in Drama Mode, choose a guest in Social and use Reveal
          role to tell them privately. They may pass on what you tell them. Clairvoyant and Diva
          keep their powers secret.
        </p>
        <p>
          If you're eliminated and Rewind is offered, you can watch an ad to return to the
          checkpoint or leave the castle. If advertising privacy needs setup, you can open it from
          the rewind prompt. Eyeros you earn go to your Wallet. The season pot is shared by the
          surviving winners.
        </p>
        <p>
          Open Home and choose Save for later to resume the same season. Abandon the castle ends
          your current season. The next season starts at Day 1.
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

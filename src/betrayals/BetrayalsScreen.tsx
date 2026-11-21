import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { REALITY_MODE_PRESETS } from '../modes/realityMode'
import {
  flushDurablePersistence,
  getDurableItem,
  setDurableItem,
} from '../store/durablePersistence'
import { currentAudienceApproval } from './audience'
import { BetrayalsBroadcast } from './BetrayalsBroadcast'
import { BetrayalsChallengeStage } from './BetrayalsChallengeStage'
import { BetrayalsConclave } from './BetrayalsConclave'
import { BetrayalsDock } from './BetrayalsDock'
import { BetrayalsGameLog } from './BetrayalsGameLog'
import { gameLogFor, recordGameActivity } from './gameLog'
import { BetrayalsIncomingInteractions } from './BetrayalsIncomingInteractions'
import { BetrayalsSocialPanel } from './BetrayalsSocialPanel'
import {
  applyCastleAllianceChange,
  applyGeneralSocialMove,
  generalSocialOpen,
} from './generalSocial'
import { BetrayalsUtilityChips, BetrayalsUtilityPanel } from './BetrayalsUtilities'
import { getBetrayalsPortrait, useBetrayalsUtilities } from './betrayalsPreferences'
import type { Run, Phase, RealityPreset } from './run'
import { acknowledgeRole, commandToken, eligibleBanishmentTargets, startRun, viewFor } from './run'
import { BETRAYALS_AI_POOL } from './cast'
import { challengeContestantIds, resolveChallenge, safetyResultsFor } from './challenges'
import { challengeBriefing, challengeGame, challengeSeed, scoreField } from './challengeRotation'
import { CinematicScene } from './CinematicScene'
import { getIncomingInteractions, respondToIncomingInteraction } from './incoming'
import { getConclaveView, resolveConclave, revealDawn } from './night'
import { cinematicFor, presentationAfter } from './presentation'
import { chooseTarget, resolutionPerspective } from './strategy'
import { advanceDayBeat } from './daySocial'
import { askWitness, leadForPlayer } from './intel'
import { WitnessLeadCard } from './WitnessLeadCard'
import {
  advanceTableRound,
  buildTableBallots,
  recordTableSway,
  resolveTable,
  revealTable,
  tableDiscussionOpen,
  tableRoundNumber,
  tableTargets,
} from './table'
import { awardPublicShield } from './publicShield'
import { RoundTableDiscussion } from './RoundTableDiscussion'
import { RoundTableFeed } from './RoundTableFeed'
import { SafetyResults } from './SafetyResults'
import { intendsToEnd, resolveEndVote } from './settlement'
import { applySocialMove, getSocialView, socialMoveKinds } from './social'
import { socialWalletFor } from './socialResources'
import { restoreRun, saveRun } from './persistence'
import { Roster } from './Roster'
import './season.css'

const ColorMatch = lazy(() => import('../components/ColorMatchComp/ColorMatchComp'))
const QuickTap = lazy(() => import('../minigames/quickTapRace/QuickTapRaceCanvasGame'))
const saveId = 'edition-local'
const artBase = import.meta.env.BASE_URL + 'assets/betrayals/'
const hero = artBase + 'observatory.jpg'
const castleExterior = artBase + 'castle-exterior.jpg'
const finaleEnding = {
  'last-betrayer': 'The last Betrayer was banished at the Round Table.',
  unanimous: 'Every remaining guest voted to end the season.',
  'final-two': 'The season ended automatically when two guests remained.',
} as const
const saveStorage = {
  getItem: getDurableItem,
  setItem(key: string, value: string) {
    if (!setDurableItem(key, value)) throw new Error('Betrayals save was unavailable.')
  },
}
const phaseLabel: Record<Phase, string> = {
  'role-reveal': 'Your role',
  dawn: 'Dawn',
  social: 'Social',
  immunity: 'Immunity Challenge',
  safety: 'Safety Challenge',
  'final-challenge': 'Final challenge',
  'round-table': 'Round Table',
  'final-banishment': 'Final banishment',
  'table-reveal': 'Vote result',
  night: 'Night',
  'night-resolved': 'Daybreak',
  'end-vote': 'End Season',
  settled: 'Season result',
}
const phaseGroupLabel: Record<Phase, string> = {
  'role-reveal': 'Opening',
  dawn: 'Day',
  social: 'Day',
  immunity: 'Day',
  safety: 'Day',
  'final-challenge': 'Finale',
  'round-table': 'Council',
  'table-reveal': 'Council',
  night: 'Night',
  'night-resolved': 'Night',
  'final-banishment': 'Finale',
  'end-vote': 'Finale',
  settled: 'Finale',
}

function begin(
  name: string,
  publicMode: boolean,
  realityMode: RealityPreset,
  portrait?: string
): Run {
  const [roleSeed, publicSeed] = crypto.getRandomValues(new Uint32Array(2))
  return startRun(
    { id: 'human', name: name.trim() || 'You', portrait },
    BETRAYALS_AI_POOL,
    { publicMode, realityMode },
    { id: crypto.randomUUID(), roleSeed, publicSeed }
  )
}

function restore(saveId: string): Run | null {
  const snapshot = restoreRun(saveStorage, saveId)
  return snapshot.status === 'ready' ? snapshot.run : null
}

type InboxReads = { runId: string; ids: readonly string[] }

function restoreInboxReads(key: string): InboxReads | undefined {
  try {
    const saved = JSON.parse(getDurableItem(key) ?? 'null')
    if (
      typeof saved?.runId === 'string' &&
      Array.isArray(saved.ids) &&
      saved.ids.every((id: unknown) => typeof id === 'string')
    )
      return saved
  } catch {
    // A missing or invalid read receipt should never prevent opening the inbox.
  }
}

export default function BetrayalsScreen() {
  const [run, setRun] = useState<Run | null>(() => restore(saveId))
  const current = useRef(run)
  const [name, setName] = useState('')
  const [publicMode, setPublicMode] = useState(false)
  const [realityMode, setRealityMode] = useState<RealityPreset>('off')
  const [selected, setSelected] = useState<string>()
  const [socialOpen, setSocialOpen] = useState(false)
  const [incomingOpen, setIncomingOpen] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const [homeOpen, setHomeOpen] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [countReady, setCountReady] = useState<string>()
  const [voteActionsTarget, setVoteActionsTarget] = useState<HTMLDivElement | null>(null)
  const [closedDiscussion, setClosedDiscussion] = useState<string>()
  const [saveIssue, setSaveIssue] = useState(false)
  const inboxReadsKey = 'big-eye:betrayals:inbox:' + saveId
  const [inboxReads, setInboxReads] = useState(() => restoreInboxReads(inboxReadsKey))
  const runId = run?.id
  const markIncomingRead = useCallback(
    (id: string) => {
      if (!runId) return
      setInboxReads((previous) => {
        const ids = previous?.runId === runId ? previous.ids : []
        return ids.includes(id) ? previous : { runId, ids: [...ids, id] }
      })
    },
    [runId]
  )
  useEffect(() => {
    if (inboxReads) setDurableItem(inboxReadsKey, JSON.stringify(inboxReads))
  }, [inboxReads, inboxReadsKey])

  const utilities = useBetrayalsUtilities(homeOpen ? undefined : run?.phase, playing)
  const motion = utilities.preferences.reducedMotion ? 'reduced' : undefined
  const portrait = getBetrayalsPortrait(utilities.preferences.lookId)

  function openIncoming() {
    utilities.playEffect('ui:navigate', 0.45)
    setSocialOpen(false)
    setIncomingOpen(true)
  }

  async function commit(updated: Run) {
    const before = current.current
    if (before !== run) return
    const cues = before ? presentationAfter(before, updated) : []
    const next = recordGameActivity(
      before,
      cues.length ? { ...updated, presentation: cues } : updated
    )
    current.current = next
    let saved = false
    try {
      saveRun(saveStorage, saveId, next)
      // A reload must resume a beat as soon as it is visible.
      saved = await flushDurablePersistence()
    } catch {
      // The current visit can continue when device storage is unavailable.
    }
    setRun(next)
    if (before?.id !== next.id) setHomeOpen(false)
    setSaveIssue(!saved)
    const phaseChanged = before?.phase !== next.phase || next.id !== before?.id
    if (phaseChanged || before?.runoffIds !== next.runoffIds) setSelected(undefined)
    if (phaseChanged) {
      if (
        next.phase !== 'settled' &&
        (before?.phase === 'table-reveal' || before?.phase === 'night-resolved')
      ) {
        utilities.playEffect('tv:ceremony_reveal', 0.72)
      } else if (next.phase === 'table-reveal' || next.phase === 'night-resolved') {
        utilities.playEffect('tv:ceremony_impact', 0.57)
      } else if (next.phase !== 'settled') {
        utilities.playEffect('tv:ceremony_transition', 0.4)
      }
      setSocialOpen(false)
      setIncomingOpen(false)
    }
    setPlaying(false)
  }

  if (!run || homeOpen) {
    const resumable = run && run.phase !== 'settled'
    return (
      <main className="betrayals-layout betrayals-entry" data-betrayals-motion={motion}>
        <img className="betrayals-entry__art" src={hero} alt="" fetchPriority="high" />
        <div className="betrayals-entry__utilities">
          <BetrayalsUtilityChips utilities={utilities} />
        </div>
        <div className="betrayals-entry__identity">
          <span className="betrayals-eye" aria-hidden="true" />
          <p className="betrayals-franchise">The Big Eye</p>
          <h1>Betrayals</h1>
        </div>
        {resumable ? (
          <section className="betrayals-entry__form" aria-label="Current season">
            <p className="betrayals-entry__progress">
              Day {run.day} · {phaseLabel[run.phase]}
            </p>
            <button className="betrayals-primary" type="button" onClick={() => setHomeOpen(false)}>
              Continue season
            </button>
          </section>
        ) : (
          <form
            className="betrayals-entry__form"
            onSubmit={(event) => {
              event.preventDefault()
              void commit(begin(name, publicMode, realityMode, portrait))
            }}
          >
            <label>
              Your name
              <input
                value={name}
                maxLength={24}
                autoComplete="nickname"
                placeholder="Enter the observatory"
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <div className="betrayals-entry__options">
              <label className="betrayals-entry__toggle">
                <input
                  type="checkbox"
                  checked={publicMode}
                  onChange={(event) => setPublicMode(event.target.checked)}
                />
                Public Mode
              </label>
              <label className="betrayals-entry__preset">
                <span>Reality Mode</span>
                <select
                  value={realityMode}
                  onChange={(event) => setRealityMode(event.target.value as RealityPreset)}
                >
                  <option value="off">Off</option>
                  {REALITY_MODE_PRESETS.filter(({ minimumAge }) => minimumAge === undefined).map(
                    ({ value, label }) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    )
                  )}
                </select>
              </label>
            </div>
            <button type="submit" className="betrayals-primary">
              Start season
            </button>
            {run && (
              <button
                className="betrayals-inline-action"
                type="button"
                onClick={() => setHomeOpen(false)}
              >
                View season result
              </button>
            )}
          </form>
        )}
        <BetrayalsUtilityPanel utilities={utilities} />
      </main>
    )
  }

  const token = commandToken(run)
  const human = run.seats.find(({ id }) => id === run.humanId)
  const participating = Boolean(human && !human.exit)
  const viewerId = participating ? run.humanId : null
  const view = viewFor(run, viewerId)
  const labels = new Map(run.seats.map(({ id, name }) => [id, name]))
  const label = (id: string) => labels.get(id) ?? 'Contestant'
  const stage = run.phase
  const votePhase = stage === 'round-table' || stage === 'final-banishment'
  const audiencePending =
    stage === 'round-table' && run.options.publicMode && run.publicShieldDecisionDay !== run.day
  const discussion = !audiencePending && tableDiscussionOpen(run)
  const counting = Boolean(run.tableCount)
  const conclave = getConclaveView(run, viewerId, selected)
  const targets =
    votePhase && !audiencePending && !discussion && !counting
      ? tableTargets(run, run.humanId)
      : (conclave?.targetIds ?? [])
  const field = challengeContestantIds(run)
  const canPlay = field.includes(run.humanId)
  const gameId = challengeGame(run)
  const briefing = challengeBriefing[gameId]
  const challengeName = briefing.title
  const activeCast = view.seats.filter(({ exit }) => !exit)
  const countKey = [run.id, run.day, stage, activeCast.length, run.tableCount?.round].join(':')
  const selectedSeat = view.seats.find(({ id }) => id === selected)
  const isTarget = !!selected && targets.includes(selected)
  const gameLogEntries = logOpen ? [...gameLogFor(run)].reverse().sort((a, b) => b.day - a.day) : []
  const conversation = participating ? getSocialView(run, run.humanId) : []
  const lead = leadForPlayer(run)
  const recent = conversation
    .filter((entry) => entry.day === run.day && entry.actorId === run.humanId)
    .at(-1)
  const moveKinds = socialMoveKinds(run)
  const canSocialize = participating && moveKinds.length > 0
  const socialResources = socialWalletFor(run, run.humanId)
  const incoming = getIncomingInteractions(run)
  const pendingIncoming = incoming.filter(({ response }) => !response)
  const readIncoming = new Set(inboxReads?.runId === run.id ? inboxReads.ids : [])
  const unreadIncoming = pendingIncoming.filter(({ id }) => !readIncoming.has(id))
  const cue = run.presentation?.[0]
  const discussionKey = run.id + ':' + run.day
  const discussionVisible = discussion && !cue && closedDiscussion !== discussionKey
  const cinematic =
    cue && cue !== 'safety-results' ? cinematicFor(run, cue, viewerId, castleExterior) : undefined
  function finishCue() {
    const active = current.current
    if (!active?.presentation || active.presentation !== run?.presentation) return
    const [, ...rest] = active.presentation
    void commit({ ...active, presentation: rest.length ? rest : undefined })
  }

  function apply(transform: (active: Run) => Run) {
    const active = current.current
    if (
      !active ||
      active.presentation?.length ||
      active.id !== token.runId ||
      active.revision !== token.revision
    ) {
      return
    }
    const next = transform(active)
    if (next !== active) void commit(next)
  }

  function end(continueVoting: boolean) {
    apply((active) => {
      const ballots = active.seats
        .filter(({ exit }) => !exit)
        .map(({ id: voterId }) => {
          const wantsEnd =
            voterId === active.humanId ? !continueVoting : intendsToEnd(active, voterId)
          return { voterId, choice: wantsEnd ? ('end' as const) : ('banish' as const) }
        })
      return resolveEndVote(active, token, ballots)
    })
  }

  function revealPublicShield() {
    apply((active) => {
      const pulse = currentAudienceApproval(active)
      const updated = awardPublicShield(active, token, pulse)
      return updated === active ? active : { ...updated, audienceApproval: pulse }
    })
  }

  if (playing && canPlay) {
    return (
      <BetrayalsChallengeStage
        title={phaseLabel[stage]}
        game={briefing}
        motion={motion}
        onForfeit={() => apply((active) => resolveChallenge(active, token, scoreField(active)))}
      >
        <Suspense fallback={<p role="status">Loading {challengeName}ΓÇª</p>}>
          {gameId === 'quick-tap' ? (
            <QuickTap
              autoStart
              onFinish={(score) =>
                apply((active) => resolveChallenge(active, token, scoreField(active, { score })))
              }
            />
          ) : (
            <ColorMatch
              seed={challengeSeed(run)}
              onFinish={(score, tieBreak) =>
                apply((active) =>
                  resolveChallenge(active, token, scoreField(active, { score, tieBreak }))
                )
              }
            />
          )}
        </Suspense>
      </BetrayalsChallengeStage>
    )
  }

  let message: ReactNode = null
  let detail: ReactNode = null
  let play: { label: string; onClick: () => void; disabled?: boolean; faceLabel?: string }
  const outcome = run.lastTable
  const tableExit = outcome
    ? view.seats.find(({ id }) => id === outcome.banishedId)?.exit
    : undefined
  const banishment = outcome
    ? label(outcome.banishedId) +
      ' was banished.' +
      (tableExit?.revealedRole
        ? ' ' + (tableExit.revealedRole === 'betrayer' ? 'A Betrayer.' : 'A Loyal.')
        : '')
    : undefined
  const enteredFinaleByBanishment = stage === 'final-challenge' && tableExit?.day === run.day
  const dawn = run.lastDawn
    ? run.lastDawn.eliminatedId
      ? label(run.lastDawn.eliminatedId) + ' did not return.'
      : 'Everyone returned.'
    : 'The observatory opens.'
  const publicShieldId = run.publicShield?.day === run.day ? run.publicShield.id : undefined
  const tableFeed =
    !cue && (counting || (stage === 'round-table' && !run.runoffIds && run.tableSway)) ? (
      <RoundTableFeed
        key={counting ? countKey : run.id + ':debate:' + run.day}
        run={run}
        reducedMotion={utilities.preferences.reducedMotion}
        onCountComplete={() => setCountReady(countKey)}
        actionsTarget={voteActionsTarget}
      />
    ) : undefined
  switch (stage) {
    case 'role-reveal':
      message = view.role === 'betrayer' ? 'You are a Betrayer.' : 'You are a Loyal.'
      detail = view.teammateIds.length ? view.teammateIds.map(label).join(' · ') : undefined
      play = {
        label: 'Play: open Day 1',
        onClick: () => apply((active) => acknowledgeRole(active, token)),
      }
      break
    case 'dawn': {
      message = dawn
      const reviewedCase = run.caseReviews?.find(
        ({ day, speakerId, result }) =>
          day === run.day - 1 && speakerId === run.humanId && result === 'missed'
      )
      const shieldSave = run.private.lastShieldSave
      if (participating && shieldSave?.day === run.day && shieldSave.id === viewerId) {
        detail = 'Your Night Shield stopped the Conclave’s attempt.'
      } else if (participating && reviewedCase) {
        detail = `After your case against ${label(reviewedCase.targetId)}, guests may ask for stronger proof next time.`
      }
      play = { label: 'Play: enter Social', onClick: () => apply(advanceDayBeat) }
      break
    }
    case 'social':
      message = canSocialize
        ? 'Speak privately before the challenge.'
        : 'The survivors trade suspicions.'
      play = { label: 'Play: begin Immunity Challenge', onClick: () => apply(advanceDayBeat) }
      break
    case 'immunity':
    case 'safety':
    case 'final-challenge':
      message = enteredFinaleByBanishment ? banishment : challengeName
      detail =
        stage === 'safety'
          ? run.immunityId
            ? label(run.immunityId) + ' is immune. Two shields protect at Night.'
            : 'Two shields protect at Night.'
          : stage === 'final-challenge'
            ? (enteredFinaleByBanishment ? challengeName : 'This challenge') +
              ' adds to the pot. In the finale, banished roles stay sealed until the season ends.'
            : 'The winner is safe at the Round Table and at Night.'
      play = canPlay
        ? { label: 'Play ' + challengeName, onClick: () => setPlaying(true) }
        : {
            label: 'See results',
            faceLabel: 'Results',
            onClick: () => apply((active) => resolveChallenge(active, token, scoreField(active))),
          }
      break
    case 'round-table':
    case 'final-banishment':
      if (audiencePending) {
        message = 'The audience has chosen a shield.'
        play = { label: 'Reveal Public Shield', faceLabel: 'Reveal', onClick: revealPublicShield }
      } else if (discussion) {
        message = publicShieldId
          ? label(publicShieldId) + ' has the Public Shield. The floor is open.'
          : 'The floor is open.'
        play = {
          label: 'Enter Round Table',
          faceLabel: 'Enter',
          onClick: () => {
            utilities.playEffect('tv:ceremony_transition', 0.45)
            setClosedDiscussion(undefined)
          },
        }
      } else if (counting) {
        detail = tableFeed
        play = {
          label: 'Open runoff ballot',
          faceLabel: 'Runoff',
          disabled: countReady !== countKey,
          onClick: () => apply((active) => advanceTableRound(active, token)),
        }
      } else {
        message =
          isTarget && selected
            ? 'Your vote: ' + label(selected)
            : run.runoffIds
              ? 'Ballot ' + tableRoundNumber(run) + '. Choose among the tied contestants.'
              : participating
                ? 'Select a contestant to banish.'
                : 'The cast is ready to vote.'
        detail =
          tableFeed ??
          (stage === 'final-banishment'
            ? !run.runoffIds && run.lastTable?.blind
              ? 'At least one guest voted to banish again. This ballot keeps the banished role sealed.'
              : 'The banished guest’s role stays sealed until the season ends.'
            : publicShieldId
              ? label(publicShieldId) + ' has the Public Shield.'
              : view.hasNightShield
                ? 'You hold a Night Shield.'
                : undefined)
        play = {
          label: targets.length > 0 ? 'Lock vote' : 'View votes',
          faceLabel: targets.length > 0 ? 'Vote' : 'View votes',
          disabled: targets.length > 0 && !isTarget,
          onClick: () =>
            apply((active) => resolveTable(active, token, buildTableBallots(active, selected))),
        }
      }
      break
    case 'table-reveal':
      message = counting ? null : 'The ballots are sealed.'
      detail = tableFeed
      play = {
        label: 'Reveal result',
        faceLabel: 'Reveal',
        disabled: counting && countReady !== countKey,
        onClick: () => apply((active) => revealTable(active, token)),
      }
      break
    case 'night':
      message = banishment ?? 'The house goes quiet.'
      detail = conclave ? (
        <BetrayalsConclave
          view={conclave}
          selectedName={isTarget && selected ? label(selected) : undefined}
        />
      ) : (
        'Doors close across the castle.'
      )
      play = {
        label: targets.length ? 'Lock Night choice' : 'Play: follow the Night',
        faceLabel: targets.length ? 'Lock choice' : undefined,
        disabled: targets.length > 0 && !isTarget,
        onClick: () => apply((active) => resolveConclave(active, token, selected)),
      }
      break
    case 'night-resolved':
      message = 'Morning is close.'
      play = {
        label: 'Open Dawn',
        faceLabel: 'Dawn',
        onClick: () => apply((active) => revealDawn(active, token)),
      }
      break
    case 'end-vote':
      message = banishment ? banishment + ' Their role stays sealed.' : 'Will you end the season?'
      detail = (
        <div className="betrayals-finale-detail">
          <p>
            Ending takes a unanimous vote. One Banish Again vote starts another ballot. At two
            guests, the season ends automatically. Any surviving Betrayer wins the pot for their
            side.
          </p>
        </div>
      )
      play = {
        label: participating ? 'End Season' : 'View decision',
        faceLabel: participating ? 'End' : undefined,
        onClick: () => end(false),
      }
      break
    case 'settled':
      message = run.result?.winningRole === 'loyal' ? 'The Loyals win.' : 'The Betrayers win.'
      detail = run.result && (
        <div className="betrayals-finale-detail">
          <p>{finaleEnding[run.result.reason]}</p>
          <p>
            {run.result.winningRole === 'loyal'
              ? 'Only Loyals remained, so they split the pot.'
              : 'A Betrayer was still in the game. The surviving Betrayers take the pot.'}
          </p>
          <p>
            {Object.entries(run.result.payouts)
              .map(([id, amount]) => label(id) + ' ' + amount.toLocaleString())
              .join(', ')}
          </p>
        </div>
      )
      play = {
        label: 'New season',
        faceLabel: 'New season',
        onClick: () => {
          void commit(
            begin(human?.name ?? 'You', run.options.publicMode, run.options.realityMode, portrait)
          )
        },
      }
      break
  }

  const council =
    votePhase || stage === 'table-reveal' || stage === 'end-vote' || stage === 'settled'
  const afterDark = stage === 'night' || stage === 'night-resolved' || stage === 'role-reveal'
  const scene = council ? 'council' : afterDark ? 'night' : 'observatory'
  const beat =
    run.runoffIds?.join('|') ?? (audiencePending ? 'audience' : discussion ? 'discussion' : '')
  const broadcastMode =
    stage === 'immunity'
      ? 'immunity'
      : stage === 'safety'
        ? 'safety'
        : stage === 'settled'
          ? 'finale'
          : council
            ? 'ceremony'
            : afterDark
              ? 'night'
              : stage === 'dawn'
                ? 'daybreak'
                : 'default'
  const selectedRole = selectedSeat?.finaleRole ?? selectedSeat?.exit?.revealedRole
  const selectedState = selectedSeat?.exit
    ? selectedSeat.exit.cause === 'night'
      ? 'Lost at Night'
      : 'Banished'
    : undefined

  return (
    <>
      <main
        className="betrayals-layout betrayals-layout--game"
        data-phase={stage}
        data-scene={scene}
        data-betrayals-motion={motion}
        data-round-table-view={
          stage === 'round-table'
            ? discussionVisible
              ? 'room'
              : closedDiscussion === discussionKey || run.tableSway !== undefined
                ? 'return'
                : undefined
            : undefined
        }
        inert={Boolean(cue) || discussionVisible}
      >
        <div className="betrayals-room" aria-hidden="true">
          <img
            key={scene}
            src={
              scene === 'observatory' || stage === 'role-reveal'
                ? castleExterior
                : artBase + scene + '.jpg'
            }
            alt=""
          />
        </div>
        <header className="betrayals-header">
          <div className="betrayals-brand-row">
            <div className="betrayals-wordmark">
              <span className="betrayals-eye" aria-hidden="true" />
              Betrayals
            </div>
          </div>
          <div className="betrayals-phase-strip">
            <div className="betrayals-phase-strip__copy" aria-live="polite">
              <span className="betrayals-phase-strip__group">{phaseGroupLabel[stage]}</span>
              <span className="betrayals-phase-strip__subphase">{phaseLabel[stage]}</span>
            </div>
            <button
              className="betrayals-phase-strip__log"
              type="button"
              aria-label="Open game log"
              aria-haspopup="dialog"
              aria-expanded={logOpen}
              title="Game log"
              onClick={() => {
                utilities.playEffect('ui:navigate', 0.45)
                setLogOpen(true)
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 3h12v16H7a2 2 0 0 0 0 4h12M7 3a2 2 0 0 0-2 2v16M9 8h6m-6 4h6" />
                <path d="M12 3v3l1.5-1 1.5 1V3" />
              </svg>
            </button>
          </div>
        </header>

        <BetrayalsBroadcast
          title={conclave ? 'The Conclave' : phaseLabel[stage]}
          message={message}
          detail={detail}
          interactive={Boolean(tableFeed || conclave)}
          cueKey={run.id + ':' + run.day + ':' + stage + ':' + beat}
          mode={broadcastMode}
          art={artBase + scene + '.jpg'}
        />

        <div className="betrayals-status" role="group" aria-label="Season status">
          <span className="betrayals-status__day">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <circle cx="10" cy="10" r="3" />
              <path d="M10 2v2m0 12v2M2 10h2m12 0h2M4.4 4.4l1.4 1.4m8.4 8.4 1.4 1.4m0-11.2-1.4 1.4m-8.4 8.4-1.4 1.4" />
            </svg>
            Day <strong>{String(run.day).padStart(2, '0')}</strong>
          </span>
          <span className="betrayals-status__cast">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <circle cx="10" cy="7" r="2.5" />
              <path d="M5 16v-1a5 5 0 0 1 10 0v1M5 6a2 2 0 0 0 0 4m10-4a2 2 0 0 1 0 4M3.5 12a3 3 0 0 0-2 3m15-3a3 3 0 0 1 2 3" />
            </svg>
            <span>
              <strong>{activeCast.length}</strong>/{view.seats.length} left
            </span>
          </span>
          <span className="betrayals-status__pot">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M5 6h10l3 4-8 7-8-7zm0 0 2.5 4L10 17m5-11-2.5 4-2.5 7M2 10h16M10 2v1" />
            </svg>
            <strong>{run.pot.toLocaleString()}</strong> pot
          </span>
        </div>

        <section className="betrayals-cast" aria-label="Cast seats">
          <Roster
            view={view}
            selectedId={selected}
            humanId={run.humanId}
            sleeping={stage === 'night-resolved' || cue === 'awakening'}
            selectableIds={targets.length ? targets : undefined}
            runoffIds={votePhase ? run.runoffIds : undefined}
            onSelect={setSelected}
          />
          <div className="betrayals-cast__caption">
            {selectedSeat ? (
              <>
                <strong>{selectedSeat.name}</strong>
                {selectedState || selectedRole
                  ? ' · ' + [selectedState, selectedRole].filter(Boolean).join(' · ')
                  : ''}
              </>
            ) : !participating && stage !== 'settled' ? (
              'Spectator'
            ) : null}
          </div>
        </section>

        {saveIssue && (
          <p className="betrayals-save-issue" role="status">
            This device could not save your progress.
          </p>
        )}

        {logOpen && <BetrayalsGameLog entries={gameLogEntries} onClose={() => setLogOpen(false)} />}

        <BetrayalsDock
          play={play}
          utility={
            !cue && counting ? (
              <div className="betrayals-dock__vote-slot" ref={setVoteActionsTarget} />
            ) : stage === 'end-vote' && participating ? (
              <button type="button" className="betrayals-inline-action" onClick={() => end(true)}>
                Banish Again
              </button>
            ) : undefined
          }
          home={{
            onClick: () => {
              utilities.playEffect('ui:navigate', 0.45)
              setName(human?.name ?? '')
              setPublicMode(run.options.publicMode)
              setRealityMode(run.options.realityMode)
              setHomeOpen(true)
            },
          }}
          social={{
            onClick: () => {
              utilities.playEffect('ui:navigate', 0.45)
              setSocialOpen(true)
            },
            active: socialOpen,
            disabled: !participating,
            count: canSocialize ? socialResources.energy : undefined,
          }}
          incoming={{
            onClick: openIncoming,
            active: incomingOpen,
            count: pendingIncoming.length,
            unread: unreadIncoming.length,
            attentionKey: run.id + ':' + run.day + ':' + stage,
          }}
          settings={{
            onClick: () => {
              utilities.playEffect('ui:navigate', 0.45)
              utilities.openPanel('settings')
            },
            active: utilities.panel === 'settings',
          }}
        />

        {socialOpen && (
          <BetrayalsSocialPanel
            key={run.id}
            actorId={run.humanId}
            prospects={activeCast}
            cast={view.seats}
            resources={socialResources}
            realityMode={run.options.realityMode}
            canAct={canSocialize}
            phase={stage}
            nightShieldCount={view.nightShieldCount}
            moveKinds={moveKinds}
            voteTargetIds={eligibleBanishmentTargets(run, run.humanId)}
            day={run.day}
            conversation={conversation}
            recent={recent}
            intel={
              lead &&
              stage === 'social' && (
                <WitnessLeadCard
                  lead={lead}
                  onAsk={() => apply((active) => askWitness(active, token))}
                />
              )
            }
            onClose={() => setSocialOpen(false)}
            onGeneralMove={
              generalSocialOpen(run)
                ? (kind, guests, details) =>
                    apply((active) => applyGeneralSocialMove(active, token, kind, guests, details))
                : undefined
            }
            onAllianceChange={(id, change, value) =>
              apply((active) => applyCastleAllianceChange(active, token, id, change, value))
            }
            onMove={(kind, suspectId, recipientId) =>
              apply((active) => {
                if (!canSocialize) return active
                const choice =
                  kind === 'question'
                    ? chooseTarget(
                        resolutionPerspective(
                          active,
                          recipientId,
                          activeCast
                            .map((seat) => seat.id)
                            .filter(
                              (candidate) => candidate !== recipientId && candidate !== run.humanId
                            )
                        ),
                        'table'
                      )
                    : suspectId
                return applySocialMove(active, token, {
                  actorId: active.humanId,
                  recipientId,
                  kind,
                  suspectId: choice,
                })
              })
            }
          />
        )}
        {incomingOpen && (
          <BetrayalsIncomingInteractions
            interactions={incoming}
            readIds={readIncoming}
            onRead={markIncomingRead}
            onClose={() => setIncomingOpen(false)}
            onRespond={(id, answer) =>
              apply((active) => respondToIncomingInteraction(active, token, id, answer))
            }
          />
        )}
        <BetrayalsUtilityPanel utilities={utilities} />
      </main>
      {discussion && !cue && (
        <RoundTableDiscussion
          key={discussionKey}
          run={run}
          open={discussionVisible}
          art={artBase + 'council.jpg'}
          shieldName={publicShieldId ? label(publicShieldId) : undefined}
          reducedMotion={utilities.preferences.reducedMotion}
          onBack={() => {
            utilities.playEffect('ui:navigate', 0.45)
            setClosedDiscussion(discussionKey)
          }}
          onAskWitness={() => apply((active) => askWitness(active, token))}
          onSway={(choice) => {
            utilities.playEffect('tv:ceremony_transition', 0.45)
            apply((active) => recordTableSway(active, token, choice))
          }}
        />
      )}
      {cue === 'safety-results' && (
        <SafetyResults rows={safetyResultsFor(run, viewerId)} onComplete={finishCue} />
      )}
      {cinematic && (
        <CinematicScene
          key={cinematic.id}
          scene={cinematic}
          reducedMotion={utilities.preferences.reducedMotion}
          autoAdvance={cue !== 'death-letter' && (run.presentation?.length ?? 0) > 1}
          playEffect={utilities.playEffect}
          onComplete={finishCue}
        />
      )}
    </>
  )
}

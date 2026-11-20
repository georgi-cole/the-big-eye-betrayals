import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { REALITY_MODE_PRESETS, REALITY_PRESET_TUNING } from '../modes/realityMode'
import { mulberry32 } from '../store/rng'
import {
  flushDurablePersistence,
  getDurableItem,
  setDurableItem,
} from '../store/durablePersistence'
import { currentAudienceApproval } from './audience'
import { BetrayalsBroadcast } from './BetrayalsBroadcast'
import { BetrayalsConclave } from './BetrayalsConclave'
import { BetrayalsDock } from './BetrayalsDock'
import { BetrayalsIncomingInteractions } from './BetrayalsIncomingInteractions'
import { BetrayalsSocialPanel } from './BetrayalsSocialPanel'
import { BetrayalsUtilityChips, BetrayalsUtilityPanel } from './BetrayalsUtilities'
import { getBetrayalsPortrait, useBetrayalsUtilities } from './betrayalsPreferences'
import type { Run, Phase, RealityPreset } from './run'
import { acknowledgeRole, advancePreparation, commandToken, startRun, viewFor } from './run'
import { BETRAYALS_AI_POOL } from './cast'
import { challengeContestantIds, resolveChallenge, safetyResultsFor } from './challenges'
import { challengeGame, challengeSeed, scoreField } from './challengeRotation'
import { CinematicScene } from './CinematicScene'
import { getIncomingInteractions, respondToIncomingInteraction } from './incoming'
import { getConclaveView, resolveConclave, revealDawn } from './night'
import { cinematicFor, presentationAfter } from './presentation'
import { chooseTarget, wantsToEnd } from './strategy'
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
import { RoundTableFeed } from './RoundTableFeed'
import { SafetyResults } from './SafetyResults'
import { resolveEndVote } from './settlement'
import { applySocialMove, getSocialView, remainingActions } from './social'
import { restoreRun, saveRun } from './persistence'
import { Roster } from './Roster'
import './season.css'

const ColorMatch = lazy(() => import('../components/ColorMatchComp/ColorMatchComp'))
const QuickTap = lazy(() => import('../minigames/quickTapRace/QuickTapRaceCanvasGame'))
const profile = 'edition-local'
const artBase = import.meta.env.BASE_URL + 'assets/betrayals/'
const hero = artBase + 'observatory.jpg'
const castleExterior = artBase + 'castle-exterior.jpg'
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

function restore(): Run | null {
  const snapshot = restoreRun(saveStorage, profile)
  return snapshot.status === 'ready' ? snapshot.run : null
}

function resolutionPerspective(run: Run, actorId: string, eligibleIds: string[]) {
  const view = viewFor(run, actorId)
  return {
    actorId,
    role: view.role ?? 'loyal',
    teammates: view.teammateIds,
    day: run.day,
    phase: run.phase,
    seed: run.publicSeed,
    eligibleIds,
    ownConversations: getSocialView(run, actorId),
    publicTally: run.lastTable?.tally ?? {},
  }
}

function advanceDayBeat(run: Run): Run {
  let active = run
  if (active.phase === 'social' && active.options.realityMode !== 'off') {
    const tuning = REALITY_PRESET_TUNING[active.options.realityMode]
    const rng = mulberry32(active.publicSeed ^ (active.day * 917))
    const seats = active.seats.filter(({ exit }) => !exit)
    const actors = seats.filter(({ id }) => id !== active.humanId)
    const count = Math.min(actors.length, Math.round(3 * tuning.arcIntensityMultiplier))
    for (let index = 0; index < count; index++) {
      const actor = actors[Math.floor(rng() * actors.length)]
      const audience = actors.filter(({ id }) => id !== actor.id)
      if (!audience.length) break
      const recipient = audience[Math.floor(rng() * audience.length)]
      const targets = seats
        .filter(({ id }) => id !== actor.id && id !== recipient.id)
        .map(({ id }) => id)
      const suspectId = chooseTarget(resolutionPerspective(active, actor.id, targets), 'table')
      active = applySocialMove(active, commandToken(active), {
        actorId: actor.id,
        recipientId: recipient.id,
        kind: 'question',
        suspectId,
      })
    }
  }
  return advancePreparation(active, commandToken(active))
}

function SocialSheet({ children, close }: { children: ReactNode; close: () => void }) {
  const panel = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = panel.current
    if (!dialog) return
    if (typeof dialog.showModal === 'function') {
      dialog.showModal()
      return () => dialog.close()
    }
    dialog.setAttribute('open', '')
  }, [])

  return (
    <dialog
      ref={panel}
      className="betrayals-sheet"
      aria-labelledby="betrayals-social-title"
      onCancel={(event) => {
        event.preventDefault()
        close()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div className="betrayals-sheet__content">
        <header className="betrayals-sheet__head">
          <h2 id="betrayals-social-title">Social</h2>
          <button type="button" aria-label="Close Social" onClick={close}>
            ×
          </button>
        </header>
        {children}
      </div>
    </dialog>
  )
}

export default function BetrayalsScreen() {
  const [run, setRun] = useState<Run | null>(restore)
  const current = useRef(run)
  const [name, setName] = useState('')
  const [publicMode, setPublicMode] = useState(false)
  const [realityMode, setRealityMode] = useState<RealityPreset>('off')
  const [selected, setSelected] = useState<string>()
  const [contactId, setContactId] = useState<string>()
  const [socialOpen, setSocialOpen] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [countReady, setCountReady] = useState<string>()
  const [saveIssue, setSaveIssue] = useState(false)
  const utilities = useBetrayalsUtilities(run?.phase, playing)
  const motion = utilities.preferences.reducedMotion ? 'reduced' : undefined
  const portrait = getBetrayalsPortrait(utilities.preferences.lookId)

  async function commit(updated: Run) {
    const before = current.current
    if (before !== run) return
    const cues = before ? presentationAfter(before, updated) : []
    const next = cues.length ? { ...updated, presentation: cues } : updated
    current.current = next
    let saved = false
    try {
      saveRun(saveStorage, profile, next)
      // A reload must resume a beat as soon as it is visible.
      saved = await flushDurablePersistence()
    } catch {
      // The current visit can continue when device storage is unavailable.
    }
    setRun(next)
    setSaveIssue(!saved)
    const phaseChanged = before?.phase !== next.phase || next.id !== before?.id
    if (phaseChanged || before?.runoffIds !== next.runoffIds) setSelected(undefined)
    if (phaseChanged) {
      if (next.phase === 'settled') utilities.playEffect('tv:finale_winner_stinger', 0.72)
      else if (before?.phase === 'table-reveal' || before?.phase === 'night-resolved') {
        utilities.playEffect('tv:ceremony_reveal', 0.72)
      } else if (next.phase === 'table-reveal' || next.phase === 'night-resolved') {
        utilities.playEffect('tv:ceremony_impact', 0.57)
      } else {
        utilities.playEffect('tv:ceremony_transition', 0.4)
      }
      setSocialOpen(false)
    }
    setPlaying(false)
  }

  if (!run) {
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
        </form>
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
  const countKey = run.id + ':' + run.revision
  const conclave = getConclaveView(run, viewerId, selected)
  const targets =
    votePhase && !audiencePending && !discussion && !counting
      ? tableTargets(run, run.humanId)
      : (conclave?.targetIds ?? [])
  const field = challengeContestantIds(run)
  const canPlay = field.includes(run.humanId)
  const quickTap = challengeGame(run) === 'quick-tap'
  const challengeName = quickTap ? 'Quick Tap Race' : 'Color Match'
  const activeCast = view.seats.filter(({ exit }) => !exit)
  const contact = activeCast.find(({ id }) => id === contactId && id !== run.humanId)
  const selectedSeat = view.seats.find(({ id }) => id === selected)
  const isTarget = !!selected && targets.includes(selected)
  const conversation = participating ? getSocialView(run, run.humanId) : []
  const recent = conversation
    .filter((entry) => entry.day === run.day && entry.actorId === run.humanId)
    .at(-1)
  const canSocialize = participating && stage === 'social'
  const actionsLeft = participating ? remainingActions(run, run.humanId) : 0
  const incoming = getIncomingInteractions(run)
  const pendingIncoming = incoming.filter(({ response }) => !response)
  const cue = run.presentation?.[0]
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
      const knownBetrayers = active.seats.filter(
        ({ exit }) => exit?.revealedRole === 'betrayer'
      ).length
      const ballots = active.seats
        .filter(({ exit }) => !exit)
        .map(({ id: voterId }) => {
          const wantsEnd =
            voterId === active.humanId
              ? !continueVoting
              : wantsToEnd(resolutionPerspective(active, voterId, []), knownBetrayers)
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

  function selectContestant(id: string) {
    setSelected(id)
    if (canSocialize && id !== run?.humanId && activeCast.some((seat) => seat.id === id)) {
      setContactId(id)
    }
  }

  if (playing && canPlay) {
    return (
      <main className="betrayals-layout betrayals-layout--challenge" data-betrayals-motion={motion}>
        <header className="betrayals-challenge-header">
          <h1>{phaseLabel[stage]}</h1>
          <button
            type="button"
            onClick={() => apply((active) => resolveChallenge(active, token, scoreField(active)))}
          >
            Forfeit challenge
          </button>
        </header>
        <Suspense fallback={<p role="status">Loading {challengeName}…</p>}>
          {quickTap ? (
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
      </main>
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
    !cue &&
    (discussion || counting || (stage === 'round-table' && !run.runoffIds && run.tableSway)) ? (
      <RoundTableFeed
        key={counting ? countKey : run.id + ':debate:' + run.day}
        run={run}
        reducedMotion={utilities.preferences.reducedMotion}
        onSway={(choice) => apply((active) => recordTableSway(active, token, choice))}
        onCountComplete={() => setCountReady(countKey)}
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
    case 'dawn':
      message = dawn
      play = { label: 'Play: enter Social', onClick: () => apply(advanceDayBeat) }
      break
    case 'social':
      message = canSocialize
        ? pendingIncoming.length
          ? pendingIncoming[0].speaker.name + ' wants a word with you.'
          : 'Speak privately before the challenge.'
        : 'The survivors trade suspicions.'
      detail = pendingIncoming.length ? (
        <button
          type="button"
          className="betrayals-inline-action"
          onClick={() => setSocialOpen(true)}
        >
          Hear them out
        </button>
      ) : undefined
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
            ? enteredFinaleByBanishment
              ? challengeName + ' adds to the pot.'
              : 'One last chance to grow the pot.'
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
        detail = tableFeed
        play = {
          label: 'Skip discussion and open voting',
          faceLabel: 'Vote',
          onClick: () => apply((active) => recordTableSway(active, token, null)),
        }
      } else if (counting) {
        message = 'The ballots are being counted.'
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
          (stage === 'round-table' && run.publicShield?.day === run.day
            ? label(run.publicShield.id) + ' has the Public Shield.'
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
      message = counting ? 'The ballots are being counted.' : 'The ballots are sealed.'
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
      message = banishment ?? 'Will you end the season?'
      detail = participating ? (
        <button type="button" className="betrayals-inline-action" onClick={() => end(true)}>
          Banish Again
        </button>
      ) : undefined
      play = {
        label: participating ? 'End Season' : 'View decision',
        faceLabel: participating ? 'End' : undefined,
        onClick: () => end(false),
      }
      break
    case 'settled':
      message = run.result?.winningRole === 'loyal' ? 'The Loyals win.' : 'The Betrayers win.'
      detail = Object.entries(run.result?.payouts ?? {})
        .map(([id, amount]) => label(id) + ' ' + amount.toLocaleString())
        .join(' · ')
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
  const beat = run.runoffIds?.join('|') ?? (audiencePending ? 'audience' : '')
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
        inert={Boolean(cue)}
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
          <div className="betrayals-status" aria-label="Season status">
            <span className="betrayals-status__day">
              Day <strong>{String(run.day).padStart(2, '0')}</strong>
            </span>
            <span aria-label={activeCast.length + ' contestants remaining'}>
              {activeCast.length}
              <span className="betrayals-status__denominator">/{view.seats.length}</span>
            </span>
            <span
              className="betrayals-status__pot"
              aria-label={run.pot.toLocaleString() + ' in the pot'}
            >
              {run.pot.toLocaleString()} <span>pot</span>
            </span>
          </div>
        </header>

        <BetrayalsBroadcast
          phase={
            stage === 'role-reveal'
              ? 'Private transmission'
              : stage === 'table-reveal'
                ? 'Round Table feed'
                : 'Observatory feed'
          }
          title={conclave ? 'The Conclave' : phaseLabel[stage]}
          message={message}
          detail={detail}
          interactive={Boolean(tableFeed || conclave || (canSocialize && pendingIncoming.length))}
          cueKey={run.id + ':' + run.day + ':' + stage + ':' + beat}
          mode={broadcastMode}
          art={artBase + scene + '.jpg'}
        />

        <section className="betrayals-cast" aria-label="Cast seats">
          <Roster
            view={view}
            selectedId={selected}
            humanId={run.humanId}
            selectableIds={targets.length ? targets : undefined}
            onSelect={selectContestant}
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

        <BetrayalsDock
          play={play}
          music={{
            onClick: utilities.toggleMusic,
            active: utilities.preferences.musicOn,
          }}
          store={{
            onClick: () => {
              utilities.playEffect('ui:navigate', 0.45)
              utilities.openPanel('store')
            },
            active: utilities.panel === 'store',
          }}
          social={{
            onClick: () => {
              utilities.playEffect('ui:navigate', 0.45)
              setSocialOpen(true)
            },
            active: socialOpen,
            disabled: !participating,
            count: pendingIncoming.length || (canSocialize ? actionsLeft : undefined),
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
          <SocialSheet close={() => setSocialOpen(false)}>
            <BetrayalsIncomingInteractions
              interactions={incoming}
              onRespond={(id, answer) =>
                apply((active) => respondToIncomingInteraction(active, token, id, answer))
              }
            />
            <BetrayalsSocialPanel
              key={run.id}
              actorId={run.humanId}
              contact={contact}
              prospects={activeCast}
              cast={view.seats}
              actionsLeft={actionsLeft}
              canAct={canSocialize}
              day={run.day}
              conversation={conversation}
              recent={recent}
              onContactChange={setContactId}
              onMove={(kind, suspectId, recipient) =>
                apply((active) => {
                  const id = recipient ?? contactId
                  if (!id || !canSocialize) return active
                  const choice =
                    kind === 'question'
                      ? chooseTarget(
                          resolutionPerspective(
                            active,
                            id,
                            activeCast
                              .map((seat) => seat.id)
                              .filter((candidate) => candidate !== id && candidate !== run.humanId)
                          ),
                          'table'
                        )
                      : suspectId
                  return applySocialMove(active, token, {
                    actorId: active.humanId,
                    recipientId: id,
                    kind,
                    suspectId: choice,
                  })
                })
              }
            />
          </SocialSheet>
        )}
        <BetrayalsUtilityPanel utilities={utilities} />
      </main>
      {cue === 'safety-results' && (
        <SafetyResults rows={safetyResultsFor(run, viewerId)} onComplete={finishCue} />
      )}
      {cinematic && (
        <CinematicScene
          key={cinematic.id}
          scene={
            cue === 'interlude' && pendingIncoming.length
              ? {
                  ...cinematic,
                  subtitle: pendingIncoming[0].speaker.name + ' asks to speak privately.',
                }
              : cinematic
          }
          reducedMotion={utilities.preferences.reducedMotion}
          autoAdvance={cue !== 'death-letter' && (run.presentation?.length ?? 0) > 1}
          playEffect={utilities.playEffect}
          onComplete={finishCue}
        />
      )}
    </>
  )
}

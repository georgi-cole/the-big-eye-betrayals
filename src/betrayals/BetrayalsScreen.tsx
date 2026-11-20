import { lazy, Suspense, useRef, useState } from 'react'
import { REALITY_MODE_PRESETS, REALITY_PRESET_TUNING } from '../modes/realityMode'
import { mulberry32 } from '../store/rng'
import { currentAudienceApproval } from './audience'
import { BetrayalsSocialPanel } from './BetrayalsSocialPanel'
import type { Run, Phase, RealityPreset, SocialEntry } from './run'
import { acknowledgeRole, advancePreparation, commandToken, startRun, viewFor } from './run'
import { BETRAYALS_AI_POOL } from './cast'
import { challengeContestantIds, resolveChallenge } from './challenges'
import { challengeGame, challengeSeed, scoreField } from './challengeRotation'
import { nightTargets, resolveNight, revealDawn } from './night'
import { chooseTarget, wantsToEnd } from './strategy'
import { tableTargets, resolveTable, revealTable } from './table'
import { awardPublicShield } from './publicShield'
import { resolveEndVote } from './settlement'
import { applySocialMove, getSocialView, remainingActions } from './social'
import { restoreRun, saveRun } from './persistence'
import { Roster } from './Roster'
import {
  flushDurablePersistence,
  getDurableItem,
  setDurableItem,
} from '../store/durablePersistence'
import './season.css'

const ColorMatch = lazy(() => import('../components/ColorMatchComp/ColorMatchComp'))
const QuickTap = lazy(() => import('../minigames/quickTapRace/QuickTapRaceCanvasGame'))
const profile = 'edition-local'
const hero = import.meta.env.BASE_URL + 'assets/betrayals/observatory.jpg'
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

function begin(name: string, publicMode: boolean, realityMode: RealityPreset): Run {
  const [roleSeed, publicSeed] = crypto.getRandomValues(new Uint32Array(2))
  return startRun(
    { id: 'human', name: name.trim() || 'You' },
    BETRAYALS_AI_POOL,
    { publicMode, realityMode },
    { id: crypto.randomUUID(), roleSeed, publicSeed }
  )
}

function localRun(): Run | null {
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
      const audience = seats.filter(({ id }) => id !== actor.id)
      const recipient = audience[Math.floor(rng() * audience.length)]
      const targets = audience.filter(({ id }) => id !== recipient.id).map(({ id }) => id)
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

function produceBallots(
  run: Run,
  targetFor: (run: Run, id: string) => string[],
  context: 'table' | 'night',
  humanTarget: string | null
) {
  return run.seats.flatMap(({ id }) => {
    const ids = targetFor(run, id)
    if (!ids.length) return []
    const targetId =
      id === run.humanId && humanTarget && ids.includes(humanTarget)
        ? humanTarget
        : chooseTarget(resolutionPerspective(run, id, ids), context)
    return targetId ? [{ voterId: id, targetId }] : []
  })
}

export default function BetrayalsScreen() {
  const [run, setRun] = useState<Run | null>(localRun)
  const current = useRef(run)
  const [name, setName] = useState('')
  const [publicMode, setPublicMode] = useState(false)
  const [realityMode, setRealityMode] = useState<RealityPreset>('off')
  const [lastInteraction, setLastInteraction] = useState<SocialEntry>()
  const [selected, setSelected] = useState<string | undefined>()
  const [playing, setPlaying] = useState(false)
  const [saveIssue, setSaveIssue] = useState(false)
  const [allSeats, setAllSeats] = useState(false)

  function commit(next: Run) {
    current.current = next
    setRun(next)
    try {
      saveRun(saveStorage, profile, next)
      setSaveIssue(false)
      void flushDurablePersistence().then((ok) => {
        if (!ok && current.current?.id === next.id) setSaveIssue(true)
      })
    } catch {
      setSaveIssue(true)
    }
    if (run?.phase !== 'social' || next.phase !== 'social') setSelected(undefined)
    setPlaying(false)
  }

  if (!run) {
    return (
      <main className="betrayals-layout betrayals-entry">
        <img className="betrayals-entry__art" src={hero} alt="" fetchPriority="high" />
        <p className="betrayals-franchise">The Big Eye</p>
        <h1>Betrayals</h1>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            commit(begin(name, publicMode, realityMode))
          }}
        >
          <label>
            Your name
            <input value={name} maxLength={24} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="betrayals-option">
            <input
              type="checkbox"
              checked={publicMode}
              onChange={(event) => setPublicMode(event.target.checked)}
            />
            Public Mode
          </label>
          <label>
            Reality Mode
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
          <button type="submit" className="betrayals-primary">
            Start season
          </button>
        </form>
      </main>
    )
  }

  const token = commandToken(run)
  const human = run.seats.find(({ id }) => id === run.humanId)
  const participating = Boolean(human && !human.exit)
  const view = viewFor(run, participating ? run.humanId : null)
  const names = new Map(run.seats.map((seat) => [seat.id, seat.name]))
  const label = (id: string) => names.get(id) ?? 'Contestant'
  const stage = run.phase
  const votePhase = stage === 'round-table' || stage === 'final-banishment'
  const audiencePending =
    stage === 'round-table' && run.options.publicMode && run.publicShieldDecisionDay !== run.day
  const targets = votePhase
    ? tableTargets(run, run.humanId)
    : stage === 'night'
      ? nightTargets(run, run.humanId)
      : []
  const competing = challengeContestantIds(run).length > 0
  const canPlay = competing && challengeContestantIds(run).includes(run.humanId)
  const quickTap = challengeGame(run) === 'quick-tap'
  const challengeName = quickTap ? 'Quick Tap Race' : 'Color Match'
  const activeCast = view.seats.filter(({ exit }) => !exit)
  const contact = activeCast.find(({ id }) => id === selected && id !== run.humanId)
  const audience = Object.entries(run.audienceApproval ?? {})
    .filter(([id]) => activeCast.some((seat) => seat.id === id))
    .sort((left, right) => right[1] - left[1])

  function apply(transform: (active: Run) => Run) {
    const active = current.current
    if (!active || active.id !== token.runId || active.revision !== token.revision) return
    const next = transform(active)
    if (next !== active) commit(next)
  }

  function end(continueVoting: boolean) {
    apply((active) =>
      resolveEndVote(
        active,
        token,
        active.seats
          .filter(({ exit }) => !exit)
          .map(({ id: voterId }) => {
            const count = active.seats.filter(
              ({ exit }) => exit?.revealedRole === 'betrayer'
            ).length
            const wantsEnd =
              voterId === active.humanId
                ? !continueVoting
                : wantsToEnd(resolutionPerspective(active, voterId, []), count)
            return { voterId, choice: wantsEnd ? 'end' : 'banish' }
          })
      )
    )
  }

  function countAudience() {
    apply((active) => {
      const pulse = currentAudienceApproval(active)
      const updated = awardPublicShield(active, token, pulse)
      return updated === active ? active : { ...updated, audienceApproval: pulse }
    })
  }

  if (playing && canPlay) {
    return (
      <main className="betrayals-layout">
        <h1>{phaseLabel[stage]}</h1>
        <button
          onClick={() => apply((active) => resolveChallenge(active, token, scoreField(active)))}
        >
          Forfeit challenge
        </button>
        <Suspense fallback={<p>Loading {challengeName}.</p>}>
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

  return (
    <main className="betrayals-layout" data-phase={stage}>
      <header className="betrayals-header">
        <p className="betrayals-franchise">The Big Eye · Betrayals</p>
        <div>
          <span>Day {run.day}</span>
          <span>{run.pot.toLocaleString()} pot</span>
        </div>
      </header>
      <section className="betrayals-phase">
        <h1>{phaseLabel[stage]}</h1>
        {stage === 'role-reveal' && (
          <p>
            You are <strong>{view.role === 'betrayer' ? 'a Betrayer' : 'a Loyal'}</strong>.
          </p>
        )}
        {(stage === 'night' || stage === 'role-reveal') && view.teammateIds.length > 0 && (
          <p>Your fellow Betrayers are {view.teammateIds.map(label).join(', ')}.</p>
        )}
        {(stage === 'dawn' || stage === 'final-challenge') && run.lastDawn && (
          <p>
            {run.lastDawn.eliminatedId
              ? label(run.lastDawn.eliminatedId) + ' did not return.'
              : 'Everyone returned.'}
          </p>
        )}
        {stage === 'dawn' && run.day === 1 && <p>Meet your fellow contestants.</p>}
        {stage === 'social' && participating && (
          <p>{remainingActions(run, run.humanId)} actions left today.</p>
        )}
        {stage === 'social' && participating && !contact && (
          <p>Select a contestant to talk privately.</p>
        )}
        {votePhase && !audiencePending && view.hasNightShield && (
          <p>Your Night Shield protects you tonight.</p>
        )}
        {votePhase &&
          !audiencePending &&
          run.publicShield?.day === run.day &&
          stage === 'round-table' && <p>{label(run.publicShield.id)} earned the Public Shield.</p>}
        {stage === 'safety' && run.immunityId && (
          <p>{label(run.immunityId)} earned Full Immunity.</p>
        )}
        {votePhase && !audiencePending && (
          <p>
            {run.runoffIds
              ? 'Runoff among the tied contestants.'
              : 'Select a contestant to banish.'}
          </p>
        )}
        {stage === 'night' && (
          <p>
            {view.role === 'betrayer' ? 'Select a target for the Night.' : 'The house goes quiet.'}
          </p>
        )}
        {stage === 'settled' && run.result && (
          <>
            <p>{run.result.winningRole === 'loyal' ? 'The Loyals win.' : 'The Betrayers win.'}</p>
            <ul>
              {Object.entries(run.result.payouts).map(([id, value]) => (
                <li key={id}>
                  {label(id)} · {value.toLocaleString()}
                </li>
              ))}
            </ul>
          </>
        )}
        {!participating && stage !== 'settled' && <p>You’re watching the rest of the season.</p>}
      </section>

      <Roster
        view={view}
        selectedId={selected}
        humanId={run.humanId}
        fullCast={allSeats}
        onSelect={setSelected}
      />
      {selected && (
        <p className="betrayals-selection">
          {label(selected)} ·{' '}
          {stage === 'settled'
            ? view.seats.find((seat) => seat.id === selected)?.finaleRole
            : (view.seats.find((seat) => seat.id === selected)?.exit?.revealedRole ?? 'Contestant')}
        </p>
      )}
      {run.lastTable &&
        (stage === 'night' ||
          stage === 'end-vote' ||
          stage === 'settled' ||
          stage === 'final-challenge') && (
          <p className="betrayals-note">
            {label(run.lastTable.banishedId)} was banished.
            {!run.lastTable.blind &&
              ' ' +
                (run.seats.find((seat) => seat.id === run.lastTable?.banishedId)?.exit
                  ?.revealedRole === 'betrayer'
                  ? 'They were a Betrayer.'
                  : 'They were Loyal.')}
          </p>
        )}
      {saveIssue && <p role="status">This device could not save your progress.</p>}

      {stage === 'social' && participating && contact && (
        <BetrayalsSocialPanel
          actorId={run.humanId}
          contact={contact}
          prospects={activeCast}
          actionsLeft={remainingActions(run, run.humanId)}
          onMove={(kind, suspectId) =>
            apply((active) => {
              const choice =
                kind === 'question'
                  ? chooseTarget(
                      resolutionPerspective(
                        active,
                        contact.id,
                        activeCast
                          .map(({ id }) => id)
                          .filter((id) => id !== contact.id && id !== run.humanId)
                      ),
                      'table'
                    )
                  : suspectId
              const next = applySocialMove(active, token, {
                actorId: active.humanId,
                recipientId: contact.id,
                kind,
                suspectId: choice,
              })
              if (next !== active) setLastInteraction(next.social.at(-1))
              return next
            })
          }
        />
      )}
      {stage === 'social' && participating && lastInteraction?.day === run.day && (
        <p role="status" className="betrayals-note">
          {lastInteraction.kind === 'question' && lastInteraction.suspectId
            ? label(lastInteraction.recipientId) +
              ' is watching ' +
              label(lastInteraction.suspectId) +
              '.'
            : lastInteraction.kind === 'rapport'
              ? 'You spoke privately with ' + label(lastInteraction.recipientId) + '.'
              : label(lastInteraction.recipientId) +
                (lastInteraction.accepted ? ' agreed.' : ' declined.')}
        </p>
      )}
      {participating && stage === 'social' && run.options.realityMode !== 'off' && (
        <details className="betrayals-note">
          <summary>Private conversation history</summary>
          <ul>
            {getSocialView(run, run.humanId)
              .slice(-6)
              .reverse()
              .map((entry, i) => (
                <li key={i}>
                  Day {entry.day} · {label(entry.actorId)} → {label(entry.recipientId)}
                  {entry.suspectId ? ' · ' + label(entry.suspectId) : ''}
                </li>
              ))}
          </ul>
        </details>
      )}
      {run.options.publicMode && audience.length > 0 && (
        <details className="betrayals-note">
          <summary>Audience approval</summary>
          <ol>
            {audience.slice(0, 5).map(([id, approval]) => (
              <li key={id}>
                {label(id)} · {approval}%
              </li>
            ))}
          </ol>
        </details>
      )}
      <nav className="betrayals-controls" aria-label="Season actions">
        {stage === 'role-reveal' && (
          <button onClick={() => apply((active) => acknowledgeRole(active, token))}>
            Continue
          </button>
        )}
        {(stage === 'social' || stage === 'dawn') && (
          <button onClick={() => apply(advanceDayBeat)}>Continue</button>
        )}
        {competing &&
          (canPlay ? (
            <button onClick={() => setPlaying(true)}>Play {challengeName}</button>
          ) : (
            <button
              onClick={() => apply((active) => resolveChallenge(active, token, scoreField(active)))}
            >
              See results
            </button>
          ))}
        {audiencePending && <button onClick={countAudience}>Reveal Public Shield</button>}
        {votePhase && !audiencePending && (
          <button
            disabled={targets.length > 0 && !targets.includes(selected ?? '')}
            onClick={() =>
              apply((active) =>
                resolveTable(
                  active,
                  token,
                  produceBallots(active, tableTargets, 'table', selected ?? null)
                )
              )
            }
          >
            {targets.length > 0 ? 'Lock vote' : 'View votes'}
          </button>
        )}
        {stage === 'table-reveal' && (
          <button onClick={() => apply((active) => revealTable(active, token))}>
            Reveal result
          </button>
        )}
        {stage === 'night' && (
          <button
            disabled={targets.length > 0 && !targets.includes(selected ?? '')}
            onClick={() =>
              apply((active) =>
                resolveNight(
                  active,
                  token,
                  produceBallots(active, nightTargets, 'night', selected ?? null)
                )
              )
            }
          >
            {targets.length > 0 ? 'Lock Night choice' : 'Continue to Dawn'}
          </button>
        )}
        {stage === 'night-resolved' && (
          <button onClick={() => apply((active) => revealDawn(active, token))}>Open Dawn</button>
        )}
        {stage === 'end-vote' && (
          <button onClick={() => end(false)}>
            {participating ? 'End Season' : 'View decision'}
          </button>
        )}
        {stage === 'end-vote' && participating && (
          <button onClick={() => end(true)}>Banish Again</button>
        )}
        {stage === 'settled' && (
          <button
            onClick={() =>
              commit(begin(human?.name ?? 'You', run.options.publicMode, run.options.realityMode))
            }
          >
            New season
          </button>
        )}
        <button onClick={() => setAllSeats((visible) => !visible)}>
          {allSeats ? 'Active cast' : 'Full cast'}
        </button>
      </nav>
    </main>
  )
}

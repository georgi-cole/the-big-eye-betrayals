import { useEffect, useEffectEvent, useId, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import walkManifest from '../cinematic/ceremonies/walk-manifest.json'
import { usePresentationReducedMotion } from '../services/presentation/usePresentationReducedMotion'
import './CinematicScene.css'
import './sleep-mask.css'

export type CinematicCastMember = {
  id: string
  name: string
  portrait?: string
  concealed?: boolean
}

type SceneKind =
  | 'conclave-arrival'
  | 'conclave-seal'
  | 'sunrise'
  | 'awakening'
  | 'shield'
  | 'death-letter'
  | 'round-table'
  | 'departure'
  | 'elimination'
  | 'sunset'
  | 'interlude'

export type CinematicSceneData = {
  id: string
  kind: SceneKind
  title?: string
  subtitle?: string
  cast?: readonly CinematicCastMember[]
  castCount?: number
  subject?: CinematicCastMember
  darkSeatId?: string
  role?: string
  weather?: 'clear' | 'mist' | 'rain'
  concealed?: boolean
  backdrop?: string
}

type SceneBeat = {
  title: string
  hold?: number
  cue?: string
}

const assetBase = import.meta.env.BASE_URL + 'assets/'
const sceneArt = assetBase + 'betrayals/'
const chamber = sceneArt + 'observatory.jpg'
const council = sceneArt + 'council.jpg'
const corridor = sceneArt + 'night.jpg'
const mantle = sceneArt + 'conclave-mantle.png'
const shield = assetBase + 'ceremonies/shared/safety-shield-reveal.webp'
const ballotBox = assetBase + 'ceremonies/vfx/obsidian-ballot-box-v1.webp'
const verdictStamps = {
  murdered: sceneArt + 'verdict-murdered.png',
  evicted: sceneArt + 'verdict-evicted.png',
} as const

const direction: Record<SceneKind, { backdrop: string; beats: readonly SceneBeat[] }> = {
  'conclave-arrival': {
    backdrop: chamber,
    beats: [
      { title: 'The Conclave', hold: 1600, cue: 'suspense' },
      { title: 'At the seal', hold: 1400 },
      { title: 'The Conclave is in session', cue: 'reveal' },
    ],
  },
  'conclave-seal': {
    backdrop: chamber,
    beats: [
      { title: 'The decision is made', hold: 1100, cue: 'suspense' },
      { title: 'Sealed in wax', hold: 1400, cue: 'impact' },
      { title: 'Into the night', hold: 1900, cue: 'transition' },
      { title: 'The chamber is empty' },
    ],
  },
  sunrise: {
    backdrop: chamber,
    beats: [
      { title: 'Before first light', hold: 2200 },
      { title: 'First light', cue: 'transition' },
    ],
  },
  awakening: {
    backdrop: chamber,
    beats: [
      { title: 'The castle stirs', hold: 900 },
      { title: 'One by one', hold: 2550 },
      { title: 'Morning roll call', cue: 'reveal' },
    ],
  },
  shield: {
    backdrop: chamber,
    beats: [
      { title: 'The challenge is over', hold: 1250, cue: 'suspense' },
      { title: 'The shield is awarded', cue: 'shield' },
    ],
  },
  'death-letter': {
    backdrop: corridor,
    beats: [
      { title: 'Footsteps in the corridor', hold: 1200, cue: 'door' },
      { title: 'A sealed letter', hold: 1500 },
      { title: 'The letter of doom', cue: 'impact' },
    ],
  },
  'round-table': {
    backdrop: council,
    beats: [
      { title: 'The doors close', hold: 1650, cue: 'door' },
      { title: 'The Round Table', cue: 'transition' },
    ],
  },
  departure: {
    backdrop: corridor,
    beats: [
      { title: 'The verdict', hold: 1650, cue: 'reveal' },
      { title: 'Evicted from the castle', hold: 1300, cue: 'impact' },
      { title: 'The final walk', hold: 2450, cue: 'door' },
      { title: 'The gates are closed', cue: 'impact' },
    ],
  },
  elimination: {
    backdrop: corridor,
    beats: [
      { title: 'One seat stays dark', hold: 1550, cue: 'suspense' },
      { title: 'Murdered at night', cue: 'impact' },
    ],
  },
  sunset: {
    backdrop: chamber,
    beats: [
      { title: 'The last of the light', hold: 2200 },
      { title: 'The castle sleeps', cue: 'transition' },
    ],
  },
  interlude: {
    backdrop: chamber,
    beats: [{ title: 'Inside the castle', hold: 1200 }, { title: 'Meanwhile…' }],
  },
}

const walkAssets: Readonly<Record<string, { src: string; frames: number; frameMs: number }>> =
  walkManifest.characters

function Portrait({ member }: { member: CinematicCastMember }) {
  return member.portrait ? (
    <img src={member.portrait} alt="" decoding="async" draggable={false} />
  ) : (
    <span aria-hidden="true">{member.name[0]}</span>
  )
}

function HoodedCircle({
  cast = [],
  castCount,
  hoodsUp,
  leaving,
}: {
  cast?: CinematicSceneData['cast']
  castCount?: number
  hoodsUp: boolean
  leaving: boolean
}) {
  const seats = castCount ?? (cast.length || 3)
  const [mantleReady, setMantleReady] = useState(false)
  return (
    <div className="betrayals-cine__circle" data-leaving={leaving} data-mantle={mantleReady}>
      <div className="betrayals-cine__figures" style={{ '--seats': seats } as CSSProperties}>
        {Array.from({ length: seats }, (_, index) => {
          const member = cast[index]
          const revealed = !hoodsUp && member && !member.concealed
          return (
            <div
              className="betrayals-cine__figure"
              key={member?.id ?? index}
              data-revealed={Boolean(revealed)}
              style={{ '--figure-index': index } as CSSProperties}
            >
              <div className="betrayals-cine__mantle" aria-hidden="true" />
              <div className="betrayals-cine__hood" aria-hidden="true" />
              <img
                className="betrayals-cine__mantle-art"
                src={mantle}
                alt=""
                aria-hidden="true"
                decoding="async"
                draggable={false}
                onLoad={() => setMantleReady(true)}
              />
              {revealed && (
                <>
                  <div className="betrayals-cine__face" aria-hidden="true">
                    <Portrait member={member} />
                  </div>
                  <span className="betrayals-cine__nameplate">{member.name}</span>
                </>
              )}
            </div>
          )
        })}
      </div>
      <div className="betrayals-cine__altar" aria-hidden="true">
        <i />
      </div>
    </div>
  )
}

function WaxLetter({ sealed }: { sealed: boolean }) {
  return (
    <div className="betrayals-cine__letter" data-sealed={sealed} aria-hidden="true">
      <div className="betrayals-cine__envelope" />
      <div className="betrayals-cine__wax">
        <i />
      </div>
      <div className="betrayals-cine__stamp" />
    </div>
  )
}

function RollCall({
  cast = [],
  darkSeatId,
  beat,
  sleeping = false,
}: {
  cast?: CinematicSceneData['cast']
  darkSeatId?: string
  beat: number
  sleeping?: boolean
}) {
  return (
    <ul
      className="betrayals-cine__rollcall"
      aria-label={sleeping ? 'The sleeping castle' : 'Morning roll call'}
      data-sleeping={sleeping}
    >
      {cast.map((member, index) => {
        const dark = member.id === darkSeatId
        return (
          <li
            className="betrayals-cine__tile"
            key={member.id}
            aria-label={beat > 1 && dark ? `${member.name}, absent` : undefined}
            data-awake={!sleeping && beat > 0 && !dark}
            style={{ '--wake-order': index } as CSSProperties}
          >
            <Portrait member={member} />
            <span
              className="betrayals-sleep-mask"
              data-symbolic={!member.portrait || undefined}
              aria-hidden="true"
            />
            {beat > 1 && dark && <span className="betrayals-cine__dark-mark" aria-hidden="true" />}
            <span className="betrayals-cine__tile-name">{member.name}</span>
          </li>
        )
      })}
    </ul>
  )
}

function ExitingFigure({ subject }: { subject?: CinematicCastMember }) {
  const walk = subject && walkAssets[subject.id]
  return (
    <div className="betrayals-cine__departing" aria-hidden="true">
      {walk ? (
        <div
          className="betrayals-cine__walker"
          style={
            {
              '--walk-src': `url("${import.meta.env.BASE_URL}${walk.src}")`,
              '--walk-frames': walk.frames,
              '--walk-loop': `${walk.frames * walk.frameMs}ms`,
            } as CSSProperties
          }
        />
      ) : (
        <span className="betrayals-cine__departure-silhouette" />
      )}
    </div>
  )
}

function PortraitVerdict({
  subject,
  role,
  stamp,
}: {
  subject: CinematicCastMember
  role?: string
  stamp?: keyof typeof verdictStamps
}) {
  return (
    <div className="betrayals-cine__verdict" data-stamp={stamp}>
      <div className="betrayals-cine__verdict-photo" aria-hidden="true">
        <Portrait member={subject} />
      </div>
      <div className="betrayals-cine__verdict-copy">
        <strong>{subject.name}</strong>
        {role && <span data-role={role.toLowerCase()}>“I was a {role}.”</span>}
      </div>
      {stamp && (
        <img
          className="betrayals-cine__verdict-stamp"
          src={verdictStamps[stamp]}
          alt={stamp === 'evicted' ? 'Evicted' : 'Murdered'}
          draggable={false}
        />
      )}
    </div>
  )
}

function Stage({ scene, beat }: { scene: CinematicSceneData; beat: number }) {
  const { kind, cast, castCount, concealed, role } = scene
  const subject = concealed || scene.subject?.concealed ? undefined : scene.subject

  switch (kind) {
    case 'conclave-arrival':
      return (
        <HoodedCircle
          cast={concealed ? undefined : cast}
          castCount={castCount}
          hoodsUp={beat < 2}
          leaving={false}
        />
      )
    case 'conclave-seal':
      return beat < 2 ? (
        <WaxLetter sealed={beat === 1} />
      ) : (
        <HoodedCircle castCount={castCount ?? cast?.length} hoodsUp leaving />
      )
    case 'sunset':
      if (cast?.length && beat > 0) return <RollCall cast={cast} beat={beat} sleeping />
      return (
        <div className="betrayals-cine__horizon" aria-hidden="true">
          <i />
        </div>
      )
    case 'sunrise':
      return (
        <div className="betrayals-cine__horizon" aria-hidden="true">
          <i />
        </div>
      )
    case 'awakening':
      return <RollCall cast={cast} darkSeatId={scene.darkSeatId ?? subject?.id} beat={beat} />
    case 'shield':
      return (
        <div className="betrayals-cine__shield" data-shown={beat > 0}>
          <div className="betrayals-cine__shield-light" aria-hidden="true" />
          <img src={shield} alt="" decoding="async" draggable={false} />
          {subject && beat > 0 && <strong>{subject.name}</strong>}
        </div>
      )
    case 'death-letter':
      return beat === 0 ? null : beat === 1 ? (
        <WaxLetter sealed />
      ) : (
        <div className="betrayals-cine__notice">
          <small>{subject ? `For ${subject.name}` : 'By order of the Conclave'}</small>
          <strong>You have been murdered.</strong>
          <i aria-hidden="true" />
        </div>
      )
    case 'round-table':
      return <img className="betrayals-cine__ballot-box" src={ballotBox} alt="" draggable={false} />
    case 'departure':
      return beat < 2 && subject ? (
        <PortraitVerdict subject={subject} role={role} stamp={beat === 1 ? 'evicted' : undefined} />
      ) : beat === 2 ? (
        <ExitingFigure subject={subject} />
      ) : (
        <div className="betrayals-cine__closed-gate" aria-hidden="true" />
      )
    case 'elimination':
      return (
        subject && <PortraitVerdict subject={subject} stamp={beat > 0 ? 'murdered' : undefined} />
      )
    case 'interlude':
      return null
  }
}

export function CinematicScene({
  scene,
  onComplete,
  reducedMotion = false,
  playEffect,
  autoAdvance = false,
}: {
  scene: CinematicSceneData
  onComplete: () => void
  reducedMotion?: boolean
  playEffect?: (key: string, volume?: number) => void
  autoAdvance?: boolean
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const lastCue = useRef<number>(-1)
  const finished = useRef(false)
  const titleId = useId()
  const [step, setStep] = useState(0)
  const prefersReducedMotion = usePresentationReducedMotion()
  const motionReduced = reducedMotion || prefersReducedMotion
  const { backdrop, beats } = direction[scene.kind]
  const beat = motionReduced ? beats.length - 1 : step
  const current = beats[beat]
  const complete = beat === beats.length - 1
  const title = (complete && scene.title) || current.title
  const caption = complete && scene.subtitle
  const stageBeat =
    motionReduced && scene.kind === 'departure'
      ? 1
      : motionReduced && scene.kind === 'conclave-seal'
        ? 1
        : beat

  function finish() {
    if (finished.current) return
    finished.current = true
    onComplete()
  }

  const autoFinish = useEffectEvent(finish)

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    element.showModal?.()
    if (!element.open) element.setAttribute('open', '')
    return () => {
      element.close?.()
      element.removeAttribute('open')
    }
  }, [])

  useEffect(() => {
    if (motionReduced || !current.hold) return
    const timer = window.setTimeout(() => setStep(beat + 1), current.hold)
    return () => window.clearTimeout(timer)
  }, [beat, current.hold, motionReduced])

  useEffect(() => {
    if (!autoAdvance || !complete || motionReduced) return
    const timer = window.setTimeout(() => autoFinish(), 2200)
    return () => window.clearTimeout(timer)
  }, [autoAdvance, complete, motionReduced])

  useEffect(() => {
    if (!current.cue || lastCue.current === beat) return
    lastCue.current = beat
    playEffect?.(`tv:ceremony_${current.cue}`, 0.6)
  }, [beat, current.cue, playEffect])

  return (
    <dialog
      ref={dialog}
      className="betrayals-cine"
      aria-labelledby={titleId}
      data-scene={scene.kind}
      data-beat={beat}
      data-weather={scene.weather ?? 'clear'}
      data-reduced={motionReduced}
      onCancel={(event) => {
        event.preventDefault()
        finish()
      }}
    >
      <div className="betrayals-cine__frame">
        <div className="betrayals-cine__camera" aria-hidden="true">
          <img className="betrayals-cine__backdrop" src={scene.backdrop ?? backdrop} alt="" />
          <div className="betrayals-cine__weather" />
          <div className="betrayals-cine__grade" />
        </div>
        <div className="betrayals-cine__stage">
          <Stage scene={scene} beat={stageBeat} />
        </div>
        <div className="betrayals-cine__edge" aria-hidden="true" />
        <div className="betrayals-cine__caption" aria-live="polite" aria-atomic="true">
          <div key={title} className="betrayals-cine__caption-beat">
            <h2 id={titleId}>{title}</h2>
            {caption && <p>{caption}</p>}
          </div>
        </div>
        <div className="betrayals-cine__controls">
          <button type="button" onClick={finish}>
            {complete ? 'Continue' : 'Skip cinematic'}
          </button>
        </div>
      </div>
    </dialog>
  )
}

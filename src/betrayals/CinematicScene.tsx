import { useEffect, useEffectEvent, useId, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { preload } from 'react-dom'
import FullSizeCutoutImage from '../components/FullSizeCutoutImage/FullSizeCutoutImage'
import walkManifest from '../cinematic/ceremonies/walk-manifest.json'
import { usePresentationReducedMotion } from '../services/presentation/usePresentationReducedMotion'
import { ceremonyArt, ceremonyCharacter, hotelShots, rearArt, seatedArt } from './ceremonyArtwork'
import './CinematicScene.css'
import './sleep-mask.css'

export type CinematicCastMember = {
  id: string
  name: string
  portrait?: string
  concealed?: boolean
  human?: boolean
  exit?: { day: number }
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
  | 'finale'

export type CinematicSceneData = {
  id: string
  kind: SceneKind
  title?: string
  subtitle?: string
  cast?: readonly CinematicCastMember[]
  subject?: CinematicCastMember
  darkSeatId?: string
  role?: string
  weather?: 'clear' | 'mist' | 'rain'
  concealed?: boolean
  backdrop?: string
  repeat?: boolean
  angle?: 'hall' | 'door'
  winners?: readonly { name: string; amount: number }[]
  pot?: number
  verdict?: 'loyal' | 'betrayer'
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
      { title: 'The private meeting', hold: 680, cue: 'suspense' },
      { title: 'The Conclave' },
    ],
  },
  'conclave-seal': {
    backdrop: chamber,
    beats: [
      { title: 'The decision is made', hold: 720 },
      { title: 'Sealed in wax', hold: 760, cue: 'impact' },
      { title: 'The Conclave adjourns' },
    ],
  },
  sunrise: {
    backdrop: chamber,
    beats: [
      { title: 'Before first light', hold: 1450 },
      { title: 'First light', cue: 'transition' },
    ],
  },
  awakening: {
    backdrop: chamber,
    beats: [
      { title: 'The castle stirs', hold: 450 },
      { title: 'One by one', hold: 1150 },
      { title: 'Morning roll call', cue: 'reveal' },
    ],
  },
  shield: {
    backdrop: ceremonyArt + 'table-close.webp',
    beats: [
      { title: 'The immunity shield', hold: 860 },
      { title: 'Full Immunity', cue: 'shield' },
    ],
  },
  'death-letter': {
    backdrop: corridor,
    beats: [
      { title: 'A knock at the door', hold: 950, cue: 'door' },
      { title: 'Inside the room', hold: 820 },
      { title: 'The door opens', hold: 880 },
      { title: 'An unexpected letter', hold: 1050 },
      { title: 'The Night verdict', cue: 'impact' },
    ],
  },
  'round-table': {
    backdrop: council,
    beats: [
      { title: 'The doors close', hold: 950, cue: 'door' },
      { title: 'The Round Table', cue: 'transition' },
    ],
  },
  departure: {
    backdrop: corridor,
    beats: [
      { title: 'The Round Table has spoken', hold: 1050 },
      { title: 'The role reveal', hold: 1750, cue: 'reveal' },
      { title: 'The final walk', hold: 2550, cue: 'door' },
      { title: 'The door is closed' },
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
  finale: {
    backdrop: council,
    beats: [{ title: 'The last decision', hold: 900 }, { title: 'Season result' }],
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

function ConclaveTableau({ cast = [] }: { cast?: CinematicSceneData['cast'] }) {
  const visible = cast.filter((member) => !member.concealed)
  if (!visible.length) return null
  return (
    <div className="betrayals-cine__meeting">
      {visible.map((member) => (
        <figure className="betrayals-cine__guest" key={member.id}>
          <FullSizeCutoutImage
            player={{
              id: member.id,
              name: member.name,
              avatar: member.portrait,
              isUser: member.human,
            }}
            attire="informal"
            grounded
            alt=""
            draggable={false}
          />
          <figcaption>{member.name}</figcaption>
        </figure>
      ))}
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
        const empty = Boolean(member.exit) && !dark
        return (
          <li
            className="betrayals-cine__tile"
            key={member.id}
            aria-label={beat > 1 && dark ? `${member.name}, absent` : undefined}
            data-awake={!sleeping && beat > 0 && !dark && !empty}
            data-empty={empty || undefined}
            style={{ '--wake-order': Math.floor(index / 5) } as CSSProperties}
          >
            <Portrait member={member} />
            {!empty && (
              <span
                className="betrayals-sleep-mask"
                data-symbolic={!member.portrait || undefined}
                aria-hidden="true"
              />
            )}
            {beat > 1 && dark && <span className="betrayals-cine__dark-mark" aria-hidden="true" />}
            <span className="betrayals-cine__tile-name">{member.name}</span>
          </li>
        )
      })}
    </ul>
  )
}

function Walkout({
  subject,
  closed,
  repeat,
}: {
  subject?: CinematicCastMember
  closed: boolean
  repeat?: boolean
}) {
  const key = subject ? ceremonyCharacter(subject) : ''
  const walk = walkAssets[key]
  return (
    <div
      className="betrayals-cine__corridor-plane"
      data-closed={closed}
      data-repeat={repeat}
      data-empty={!walk || undefined}
      style={{ '--door-grain': 'url("' + corridor + '")' } as CSSProperties}
      aria-hidden="true"
    >
      {walk && !closed && (
        <div className="betrayals-cine__departing">
          <span className="betrayals-cine__walk-shadow" />
          <div
            className="betrayals-cine__walker"
            data-walk={key}
            style={
              {
                '--walk-src': 'url("' + import.meta.env.BASE_URL + walk.src + '")',
                '--walk-frames': walk.frames,
                '--walk-loop': walk.frames * walk.frameMs + 'ms',
              } as CSSProperties
            }
          />
        </div>
      )}
      <div className="betrayals-cine__doorway">
        <div className="betrayals-cine__door-leaf" />
      </div>
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

function StandingGuest({ subject }: { subject: CinematicCastMember }) {
  const portrait =
    subject.human && !subject.portrait
      ? import.meta.env.BASE_URL + 'assets/player_characters/character%205/main.webp'
      : subject.portrait
  return (
    <FullSizeCutoutImage
      player={{ id: subject.id, name: subject.name, avatar: portrait, isUser: subject.human }}
      attire="informal"
      alt=""
      draggable={false}
    />
  )
}

function RoundTableVerdict({
  subject,
  role,
  reveal,
}: {
  subject: CinematicCastMember
  role?: string
  reveal: boolean
}) {
  return (
    <figure
      className="betrayals-verdict-stage"
      data-role={reveal ? role?.toLowerCase() : undefined}
    >
      <div className="betrayals-verdict-stage__figure">
        <StandingGuest subject={subject} />
      </div>
      <figcaption>
        <strong>{subject.name}</strong>
        {reveal && (
          <span key={role ?? 'sealed'} className="betrayals-verdict-stage__role" aria-live="polite">
            {role ? 'I was a ' + role + '.' : 'Role sealed until the finale'}
          </span>
        )}
      </figcaption>
    </figure>
  )
}

function HotelVerdict({ subject, beat }: { subject?: CinematicCastMember; beat: number }) {
  return (
    <div className="betrayals-hotel__foreground">
      {subject && beat === 1 && <p className="betrayals-hotel__room-name">{subject.name}</p>}
      {subject && beat === 2 && (
        <div className="betrayals-hotel__standing" aria-hidden="true">
          <img src={rearArt(subject)} alt="" />
        </div>
      )}
      {subject && beat >= 3 && (
        <>
          <img className="betrayals-hotel__seated" src={seatedArt(subject)} alt="" />
          <img className="betrayals-hotel__throw" src={ceremonyArt + 'hotel-throw.webp'} alt="" />
        </>
      )}
      {beat === 3 && <WaxLetter sealed />}
      {beat === 4 && (
        <div className="betrayals-cine__notice">
          <small>{subject ? 'For ' + subject.name : 'By order of the Conclave'}</small>
          <strong>You have been eliminated at Night.</strong>
          <i aria-hidden="true" />
        </div>
      )}
    </div>
  )
}

function Stage({ scene, beat }: { scene: CinematicSceneData; beat: number }) {
  const { kind, cast, concealed, role } = scene
  const subject = concealed || scene.subject?.concealed ? undefined : scene.subject

  switch (kind) {
    case 'conclave-arrival':
      return !concealed ? <ConclaveTableau cast={cast} /> : null
    case 'conclave-seal':
      return <WaxLetter sealed={beat > 0} />
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
          <div className="betrayals-cine__shield-plinth" aria-hidden="true" />
          <img src={shield} alt="" decoding="async" draggable={false} />
          {subject && beat > 0 && <strong>{subject.name}</strong>}
        </div>
      )
    case 'death-letter':
      return <HotelVerdict subject={subject} beat={beat} />
    case 'round-table':
      return <img className="betrayals-cine__ballot-box" src={ballotBox} alt="" draggable={false} />
    case 'departure':
      return beat < 2 && subject ? (
        <RoundTableVerdict subject={subject} role={role} reveal={beat === 1} />
      ) : null
    case 'elimination':
      return (
        subject && <PortraitVerdict subject={subject} stamp={beat > 0 ? 'murdered' : undefined} />
      )
    case 'finale':
      return beat > 0 ? (
        <div className="betrayals-cine__settlement" data-verdict={scene.verdict}>
          <p>Season pot</p>
          <strong>{scene.pot?.toLocaleString()}</strong>
          <ul aria-label="Payouts">
            {scene.winners?.map(({ name, amount }, index) => (
              <li key={index}>
                <span>{name}</span>
                <b>{amount.toLocaleString()}</b>
              </li>
            ))}
          </ul>
        </div>
      ) : null
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
  const hold =
    scene.repeat && scene.kind === 'departure' && beat === 2
      ? 1920
      : scene.repeat && scene.kind === 'death-letter'
        ? Math.max(580, (current.hold ?? 0) * 0.78)
        : scene.repeat && scene.kind !== 'departure'
          ? Math.min(current.hold ?? 0, 480)
          : current.hold
  const complete = beat === beats.length - 1
  const title =
    (complete && scene.title) ||
    (scene.kind === 'departure' && beat === 1 && !scene.role ? 'The sealed verdict' : current.title)
  const caption = complete && scene.subtitle
  let art = scene.backdrop ?? backdrop
  if (scene.kind === 'death-letter') art = ceremonyArt + hotelShots[Math.min(beat, 3)] + '.webp'
  if (scene.kind === 'departure' && beat < 2) art = ceremonyArt + 'table-wide.webp'
  if (scene.kind === 'round-table') art = ceremonyArt + 'table-wide.webp'
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
    if (motionReduced) return
    if (scene.kind === 'death-letter') {
      for (const shot of [...hotelShots, 'hotel-throw'])
        preload(ceremonyArt + shot + '.webp', { as: 'image' })
      if (scene.subject) {
        preload(seatedArt(scene.subject), { as: 'image' })
        preload(rearArt(scene.subject), { as: 'image' })
      }
    }
    if (scene.kind === 'departure') {
      const walk = scene.subject && walkAssets[ceremonyCharacter(scene.subject)]
      if (walk) preload(import.meta.env.BASE_URL + walk.src, { as: 'image' })
    }
  }, [scene.kind, scene.subject, motionReduced])

  useEffect(() => {
    if (motionReduced || !hold) return
    const timer = window.setTimeout(() => setStep(beat + 1), hold)
    return () => window.clearTimeout(timer)
  }, [beat, hold, motionReduced])

  useEffect(() => {
    if (!autoAdvance || !complete || motionReduced) return
    const timer = window.setTimeout(() => autoFinish(), scene.kind === 'interlude' ? 2200 : 900)
    return () => window.clearTimeout(timer)
  }, [autoAdvance, complete, motionReduced, scene.kind])

  useEffect(() => {
    if (lastCue.current === beat) return
    lastCue.current = beat
    if (motionReduced && !complete) return
    if (scene.kind === 'finale' && complete) playEffect?.('tv:finale_winner_stinger', 0.72)
    else if (current.cue) playEffect?.('tv:ceremony_' + current.cue, 0.6)
  }, [beat, complete, current.cue, motionReduced, playEffect, scene.kind])

  return (
    <dialog
      ref={dialog}
      className="betrayals-cine"
      aria-labelledby={titleId}
      data-scene={scene.kind}
      data-beat={beat}
      data-weather={scene.weather ?? 'clear'}
      data-reduced={motionReduced}
      data-angle={scene.angle}
      data-inside={Boolean(scene.cast?.some((member) => !member.concealed))}
      onCancel={(event) => {
        event.preventDefault()
        finish()
      }}
    >
      <div className="betrayals-cine__frame">
        <div className="betrayals-cine__camera" aria-hidden="true">
          <img key={art} className="betrayals-cine__backdrop" src={art} alt="" />
          <div className="betrayals-cine__weather" />
          <div className="betrayals-cine__grade" />
        </div>
        <div className="betrayals-cine__stage">
          <Stage scene={scene} beat={stageBeat} />
        </div>
        {scene.kind === 'departure' && stageBeat >= 2 && (
          <Walkout
            subject={scene.concealed || scene.subject?.concealed ? undefined : scene.subject}
            closed={stageBeat === 3}
            repeat={scene.repeat}
          />
        )}
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

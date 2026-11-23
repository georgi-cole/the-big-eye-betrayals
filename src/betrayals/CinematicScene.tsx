import { useEffect, useEffectEvent, useId, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { appearanceFromAssetUrl } from '../appearance/catalog'
import FullSizeCutoutImage from '../components/FullSizeCutoutImage/FullSizeCutoutImage'
import CinematicSkipButton from '../components/CinematicSkipButton/CinematicSkipButton'
import walkManifest from '../cinematic/ceremonies/walk-manifest.json'
import { usePresentationReducedMotion } from '../services/presentation/usePresentationReducedMotion'
import { preloadImage } from '../utils/preload'
import { cinematicLookId, seatedCutout } from './cinematicCast'
import { RoundTableShot } from './RoundTableShot'
import { SleepMask } from './SleepMask'
import { BanishmentExitFilm } from './BanishmentExitFilm'
import {
  BanishmentIdent,
  banishmentCoin,
  banishmentIdentDuration,
  waxEnvelope,
} from './BanishmentIdent'
import { sadBetrayalsPortrait } from './betrayalsAppearance'
import type { CastleWeather, NightRoom } from './presentation'
import { WeatherAtmosphere } from './WeatherAtmosphere'
import { ConclaveFilm } from './ConclaveFilm'
import { conclaveOpeningBeats } from './conclaveDirection'
import './CinematicScene.css'

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
  openingTitle?: string
  subtitle?: string
  cast?: readonly CinematicCastMember[]
  subject?: CinematicCastMember
  darkSeatId?: string
  role?: string
  weather?: CastleWeather
  nightRoom?: NightRoom
  concealed?: boolean
  backdrop?: string
  repeat?: boolean
  conclaveOpening?: boolean
  winners?: readonly { name: string; amount: number }[]
  pot?: number
  verdict?: 'loyal' | 'betrayer'
}

export type CinematicCompletion = 'played' | 'skipped'

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
const defaultRevealLook = assetBase + 'player_characters/character 5/main.webp'
const murderedStamp = sceneArt + 'verdict-murdered.png'
const wings = sceneArt + 'loyal-wings.webp'
const halo = assetBase + 'ceremonies/vfx/champagne-halo-v1.webp'
const curtain = assetBase + 'ceremonies/shared/curtain.webp'
const hotelArt = sceneArt + 'hotel-night/'
const hotelChair = sceneArt + 'hotel-chair.webp'
const hotelOpening = [['arrival', 'hotel-knock'], undefined, ['executor', 'hotel-door']] as const
const handoffDuration = 1100

const direction: Record<SceneKind, { backdrop: string; beats: readonly SceneBeat[] }> = {
  'conclave-arrival': {
    backdrop: chamber,
    beats: [{ title: 'Behind closed doors', hold: 1800, cue: 'door' }, { title: 'The Conclave' }],
  },
  'conclave-seal': {
    backdrop: chamber,
    beats: [
      { title: 'The decision is made', hold: 1650 },
      { title: 'Sealed in wax', hold: 1450, cue: 'impact' },
      { title: 'The Conclave adjourns' },
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
    backdrop: chamber,
    beats: [
      { title: 'The challenge is over', hold: 860 },
      { title: 'Full Immunity', cue: 'shield' },
    ],
  },
  'death-letter': {
    backdrop: corridor,
    beats: [
      { title: 'The guest wing', hold: 2200 },
      { title: 'Asleep inside', hold: 2450 },
      { title: 'A knock at the door', hold: 2650, cue: 'door' },
      { title: 'A sealed letter', hold: 3600 },
      { title: 'The Conclave’s letter', hold: 5000, cue: 'suspense' },
      { title: 'Murdered at night', cue: 'impact' },
    ],
  },
  'round-table': {
    backdrop: council,
    beats: [
      { title: 'The Round Table', hold: 1150 },
      { title: 'The Round Table', cue: 'transition' },
    ],
  },
  departure: {
    backdrop: chamber,
    beats: [
      { title: 'Banished', hold: 2100, cue: 'suspense' },
      { title: 'Banished', hold: 3100 },
      { title: 'Leaves the castle' },
      { title: 'Banished' },
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

function ceremonyCharacter(subject: CinematicCastMember) {
  if (!subject.human) return subject.id
  const look = appearanceFromAssetUrl(subject.portrait)
  return look?.kind === 'catalog' ? 'character-' + Number(look.lookId.slice(3)) : 'character-5'
}

function Portrait({ member, mourning }: { member: CinematicCastMember; mourning?: boolean }) {
  const sad = mourning ? sadBetrayalsPortrait(member.portrait) : undefined
  return member.portrait ? (
    <img
      src={sad || member.portrait}
      onError={(event) => {
        if (sad && member.portrait && event.currentTarget.getAttribute('src') === sad) {
          event.currentTarget.src = member.portrait
        }
      }}
      alt=""
      decoding="async"
      draggable={false}
    />
  ) : (
    <span aria-hidden="true">{member.name[0]}</span>
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
            <Portrait member={member} mourning={!!darkSeatId && beat > 1 && !dark && !empty} />
            {!empty && (beat < 2 || !dark) && <SleepMask portrait={member.portrait} />}
            {beat > 1 && dark && <span className="betrayals-cine__dark-mark" aria-hidden="true" />}
            <span className="betrayals-cine__tile-name">{member.name}</span>
          </li>
        )
      })}
    </ul>
  )
}

function GroundedReveal({ subject, role }: { subject: CinematicCastMember; role?: string }) {
  const unidentified = subject.human && !subject.portrait
  const [frontFailed, setFrontFailed] = useState(false)
  const customPortrait =
    subject.human &&
    subject.portrait &&
    appearanceFromAssetUrl(subject.portrait)?.kind !== 'catalog'
  const character = ceremonyCharacter(subject)
  const matchingPose = !frontFailed && !customPortrait && walkAssets[character]
  return (
    <div className="betrayals-cine__reveal-plane" aria-hidden="true">
      <div className="betrayals-cine__reveal-light" />
      {role === 'Loyal' && (
        <div className="betrayals-cine__loyal-light">
          <img src={wings} className="betrayals-cine__loyal-wings" alt="" />
          <img src={halo} className="betrayals-cine__loyal-halo" alt="" />
        </div>
      )}
      {role === 'Betrayer' && <div className="betrayals-cine__embers" />}
      <div className="betrayals-cine__reveal-actor" data-unidentified={unidentified || undefined}>
        {matchingPose ? (
          <img
            className="betrayals-cine__reveal-front"
            src={assetBase + 'ceremonies/characters/' + character + '/ceremony-front.webp'}
            onError={() => setFrontFailed(true)}
            alt=""
            draggable={false}
          />
        ) : (
          <FullSizeCutoutImage
            player={{
              id: subject.id,
              name: subject.name,
              avatar: unidentified ? defaultRevealLook : subject.portrait,
              isUser: subject.human,
            }}
            attire="formal"
            grounded
            alt=""
            draggable={false}
          />
        )}
      </div>
      {role === 'Betrayer' && (
        <div className="betrayals-cine__curtains">
          <img src={curtain} alt="" />
          <img src={curtain} alt="" />
        </div>
      )}
    </div>
  )
}

function hotelShot(beat: number, lookId?: string, nightRoom?: NightRoom, hasSubject = false) {
  if (beat === 1) {
    const { sky = 'full', silhouette = 'narrow' } = nightRoom ?? {}
    return {
      src: hotelArt + 'asleep-' + silhouette + '-' + sky + '.webp',
      fallback: hotelArt + 'asleep-narrow-full.webp',
    }
  }
  const opening = hotelOpening[beat]
  if (opening)
    return { src: hotelArt + opening[0] + '.webp', fallback: sceneArt + opening[1] + '.webp' }
  const room = beat === 3 && hasSubject ? hotelChair : hotelArt + 'letter.webp'
  if (lookId && (beat === 3 || beat === 4)) {
    return { src: hotelArt + lookId + (beat === 3 ? '-sealed.webp' : '-open.webp'), fallback: room }
  }
  return { src: room, fallback: corridor }
}

function HotelCamera({
  beat,
  lookId,
  nightRoom,
  portrait,
}: {
  beat: number
  lookId?: string
  nightRoom?: NightRoom
  portrait?: string
}) {
  const hasSubject = Boolean(lookId || portrait)
  const shot = hotelShot(beat, lookId, nightRoom, hasSubject)
  const [current, setCurrent] = useState(shot.src)
  const [cutoutFailed, setCutoutFailed] = useState(false)
  const composeGuest = beat === 3 && hasSubject && current === hotelChair
  const cutout = composeGuest && lookId && !cutoutFailed ? seatedCutout(lookId) : undefined
  const reader = composeGuest && (cutout?.src ?? portrait)
  return (
    <div
      className="betrayals-hotel__camera"
      data-shot={beat}
      data-composite={composeGuest || undefined}
      aria-hidden="true"
    >
      <img
        className="betrayals-cine__backdrop"
        src={current}
        alt=""
        onError={() => {
          if (current !== corridor) setCurrent(current === shot.src ? shot.fallback : corridor)
        }}
      />
      {reader && (
        <div
          className="betrayals-hotel__reader"
          data-crop={cutout?.crop ? 'bust' : undefined}
          data-portrait={!cutout || undefined}
        >
          <img
            src={reader}
            alt=""
            draggable={false}
            onError={cutout ? () => setCutoutFailed(true) : undefined}
          />
        </div>
      )}
    </div>
  )
}

function PortraitVerdict({ subject, stamp }: { subject: CinematicCastMember; stamp: boolean }) {
  return (
    <div className="betrayals-cine__verdict" data-stamp={stamp || undefined}>
      <div className="betrayals-cine__verdict-photo" aria-hidden="true">
        <Portrait member={subject} />
      </div>
      <div className="betrayals-cine__verdict-copy">
        <strong>{subject.name}</strong>
      </div>
      {stamp && (
        <img
          className="betrayals-cine__verdict-stamp"
          src={murderedStamp}
          alt="Murdered"
          draggable={false}
        />
      )}
    </div>
  )
}

function Stage({
  scene,
  beat,
  reducedMotion,
}: {
  scene: CinematicSceneData
  beat: number
  reducedMotion: boolean
}) {
  const { kind, cast, concealed } = scene
  const subject = concealed || scene.subject?.concealed ? undefined : scene.subject

  switch (kind) {
    case 'conclave-arrival':
      return null
    case 'conclave-seal':
      return cast?.length ? null : <WaxLetter sealed={beat > 0} />
    case 'sunset':
      if (cast?.length && beat > 0) return <RollCall cast={cast} beat={beat} sleeping />
      if (scene.weather && scene.weather !== 'clear') return null
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
      return beat === 5 && subject && <PortraitVerdict subject={subject} stamp />
    case 'round-table':
      return (
        <RoundTableShot
          cast={cast ?? []}
          angle={beat === 0 ? 'left' : 'right'}
          close={beat > 0}
          reducedMotion={reducedMotion}
        />
      )
    case 'departure':
      return beat < 2 && subject ? (
        <GroundedReveal
          subject={subject}
          role={beat === 1 && !reducedMotion ? scene.role : undefined}
        />
      ) : null
    case 'elimination':
      return subject && <PortraitVerdict subject={subject} stamp={beat > 0} />
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
  getRosterSeat,
}: {
  scene: CinematicSceneData
  onComplete: (completion: CinematicCompletion) => void
  reducedMotion?: boolean
  playEffect?: (key: string, volume?: number) => void
  autoAdvance?: boolean
  getRosterSeat?: (id: string) => HTMLElement | null
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const lastCue = useRef<number>(-1)
  const finished = useRef(false)
  const titleId = useId()
  const [step, setStep] = useState(0)
  const [handoff, setHandoff] = useState<{ from: DOMRect; to: DOMRect; captionHeight: number }>()
  const prefersReducedMotion = usePresentationReducedMotion()
  const motionReduced = reducedMotion || prefersReducedMotion
  const { backdrop, beats: defaultBeats } = direction[scene.kind]
  const conclaveArrival = scene.kind === 'conclave-arrival'
  const conclaveSeal = scene.kind === 'conclave-seal'
  const conclaveCast =
    (conclaveArrival || conclaveSeal) && !scene.concealed ? scene.cast : undefined
  const knownConclave = conclaveCast?.filter(({ concealed }) => !concealed) ?? []
  const arrivalBeats =
    conclaveArrival && conclaveCast?.length
      ? conclaveOpeningBeats(conclaveCast, scene.conclaveOpening !== false)
      : undefined
  const beats = arrivalBeats ?? defaultBeats
  const beat = motionReduced ? beats.length - 1 : step
  const current = beats[beat]
  const hold = scene.repeat ? Math.min(current.hold ?? 0, 480) : current.hold
  const complete = beat === beats.length - 1
  const arrival = arrivalBeats?.[beat]
  const revealedConclave = new Set(
    knownConclave.slice(0, arrival?.visibleCount ?? knownConclave.length).map(({ id }) => id)
  )
  const subject = scene.concealed || scene.subject?.concealed ? undefined : scene.subject
  const deathLetter = scene.kind === 'death-letter'
  const art = scene.backdrop ?? backdrop
  const hotelLook = deathLetter && subject ? cinematicLookId(subject) : undefined
  const hotelPortrait = deathLetter ? subject?.portrait : undefined
  const stageBeat =
    motionReduced && scene.kind === 'departure'
      ? 1
      : motionReduced && scene.kind === 'conclave-seal'
        ? 1
        : beat
  const departure = scene.kind === 'departure'
  const reveal = departure && stageBeat < 2
  const exitIdent = departure && stageBeat === 3
  const roleCue =
    scene.role === 'Loyal'
      ? 'loyal_light'
      : scene.role === 'Betrayer'
        ? 'betrayer_laugh'
        : 'ceremony_reveal'
  const sceneTitle = complete ? scene.title : beat === 0 ? scene.openingTitle : undefined
  const title = departure && subject ? subject.name : (sceneTitle ?? current.title)
  const caption = departure
    ? reveal && stageBeat === 1
      ? scene.role
        ? '“I was a ' + scene.role + '.”'
        : 'The role stays sealed.'
      : scene.role && stageBeat === 0
        ? '“Now that my game is over, you should know…”'
        : 'Banished'
    : deathLetter && beat === 4 && subject
      ? subject.human
        ? 'You have been murdered.'
        : subject.name + ' has been murdered.'
      : complete &&
        (scene.subtitle ??
          (conclaveArrival && knownConclave.length > 0
            ? knownConclave.map(({ name }) => name).join(' · ')
            : undefined))

  function finish(completion: CinematicCompletion = 'played') {
    if (finished.current) return
    finished.current = true
    onComplete(completion)
  }

  function skipScene() {
    if (conclaveSeal && !complete) setStep(beats.length - 1)
    else finish('skipped')
  }

  const autoFinish = useEffectEvent(finish)

  function continueScene() {
    if (handoff) return
    const target = subject && getRosterSeat?.(subject.id)
    const card = dialog.current?.querySelector('.betrayals-cine__verdict')
    if (motionReduced || !deathLetter || !target || !card) {
      finish(motionReduced ? 'skipped' : 'played')
      return
    }
    const from = card.getBoundingClientRect()
    const to = target.getBoundingClientRect()
    if (from.width && from.height && to.width && to.height) {
      const captionHeight =
        card.querySelector('.betrayals-cine__verdict-copy')?.getBoundingClientRect().height ?? 0
      setHandoff({ from, to, captionHeight })
    } else finish()
  }

  useEffect(() => {
    if (!handoff) return
    const timer = window.setTimeout(() => autoFinish(), handoffDuration)
    return () => window.clearTimeout(timer)
  }, [handoff])

  useEffect(() => {
    if (!exitIdent) return
    const timer = window.setTimeout(() => autoFinish(), banishmentIdentDuration)
    return () => window.clearTimeout(timer)
  }, [exitIdent])

  useEffect(() => {
    if (!departure || motionReduced) return
    void preloadImage(banishmentCoin)
    void preloadImage(waxEnvelope)
    if (scene.role === 'Loyal') {
      void preloadImage(wings)
      void preloadImage(halo)
    }
    if (scene.role === 'Betrayer') void preloadImage(curtain)
  }, [departure, motionReduced, scene.role])

  useEffect(() => {
    if (motionReduced || !deathLetter) return
    const hasSubject = Boolean(hotelLook || hotelPortrait)
    for (const shot of direction['death-letter'].beats.keys())
      void preloadImage(hotelShot(shot, hotelLook, scene.nightRoom, hasSubject).src)
    void preloadImage(murderedStamp)
  }, [deathLetter, motionReduced, hotelLook, hotelPortrait, scene.nightRoom])

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
    if (motionReduced || !hold) return
    const timer = window.setTimeout(() => setStep(beat + 1), hold)
    return () => window.clearTimeout(timer)
  }, [beat, hold, motionReduced])

  useEffect(() => {
    if (!autoAdvance || !complete || motionReduced || departure) return
    const timer = window.setTimeout(() => autoFinish(), scene.kind === 'interlude' ? 2200 : 900)
    return () => window.clearTimeout(timer)
  }, [autoAdvance, complete, departure, motionReduced, scene.kind])

  useEffect(() => {
    if (lastCue.current === beat) return
    lastCue.current = beat
    if (scene.kind === 'finale' && complete) playEffect?.('tv:finale_winner_stinger', 0.72)
    else if (departure && stageBeat === 1 && !motionReduced) playEffect?.('tv:' + roleCue, 0.72)
    else if (current.cue) playEffect?.('tv:ceremony_' + current.cue, 0.6)
  }, [
    beat,
    complete,
    current.cue,
    departure,
    motionReduced,
    playEffect,
    roleCue,
    scene.kind,
    stageBeat,
  ])

  return (
    <dialog
      ref={dialog}
      className="betrayals-cine"
      aria-labelledby={titleId}
      data-scene={scene.kind}
      data-beat={beat}
      data-weather={scene.weather ?? 'clear'}
      data-reduced={motionReduced}
      data-handoff={Boolean(handoff) || undefined}
      data-reveal={reveal || undefined}
      data-verdict-beat={(reveal && stageBeat === 1) || undefined}
      data-role-revealed={reveal && stageBeat === 1 ? scene.role?.toLowerCase() : undefined}
      onCancel={(event) => {
        event.preventDefault()
        skipScene()
      }}
    >
      <div className="betrayals-cine__frame">
        {conclaveCast?.length ? (
          <ConclaveFilm
            cast={conclaveCast}
            entering={arrival?.entering}
            revealed={revealedConclave}
            unmaskingId={arrival?.unmaskingId}
            focusId={arrival?.focusId}
            letter={conclaveSeal ? (stageBeat > 0 ? 'sealed' : 'open') : undefined}
            reducedMotion={motionReduced}
          />
        ) : deathLetter ? (
          <HotelCamera
            key={beat}
            beat={beat}
            lookId={hotelLook}
            nightRoom={scene.nightRoom}
            portrait={hotelPortrait}
          />
        ) : (
          scene.kind !== 'round-table' &&
          (!departure || reveal) && (
            <div className="betrayals-cine__camera" aria-hidden="true">
              <img className="betrayals-cine__backdrop" src={reveal ? chamber : art} alt="" />
              {scene.kind === 'sunset' && scene.weather && (
                <WeatherAtmosphere weather={scene.weather} reducedMotion={motionReduced} />
              )}
              <div className="betrayals-cine__grade" />
            </div>
          )
        )}
        <div className="betrayals-cine__stage">
          <Stage scene={scene} beat={stageBeat} reducedMotion={motionReduced} />
        </div>
        {departure && stageBeat === 2 && (
          <BanishmentExitFilm
            castId={subject && ceremonyCharacter(subject)}
            name={subject?.name}
            onComplete={() => setStep(3)}
          />
        )}
        {exitIdent && <BanishmentIdent />}
        <div className="betrayals-cine__edge" aria-hidden="true" />
        <div className="betrayals-cine__caption" aria-live="polite" aria-atomic="true">
          <div key={title + ':' + (caption || '')} className="betrayals-cine__caption-beat">
            <h2 id={titleId}>{title}</h2>
            {caption && <p>{caption}</p>}
          </div>
        </div>
        <div className="betrayals-cine__controls">
          {complete && !exitIdent && (
            <button type="button" onClick={continueScene}>
              Continue
            </button>
          )}
        </div>
      </div>
      {handoff && subject && (
        <div
          className="betrayals-cine__handoff"
          aria-hidden="true"
          style={
            {
              '--exit-from-x': handoff.from.left + 'px',
              '--exit-from-y': handoff.from.top + 'px',
              '--exit-from-w': handoff.from.width + 'px',
              '--exit-from-h': handoff.from.height + 'px',
              '--exit-to-x': handoff.to.left + 'px',
              '--exit-to-y': handoff.to.top + 'px',
              '--exit-to-w': handoff.to.width + 'px',
              '--exit-to-h': handoff.to.height + 'px',
              '--exit-caption-height': handoff.captionHeight + 'px',
              '--exit-handoff-duration': handoffDuration + 'ms',
            } as CSSProperties
          }
        >
          <PortraitVerdict subject={subject} stamp />
        </div>
      )}
      {(!complete || exitIdent || (deathLetter && !motionReduced)) && (
        <CinematicSkipButton ariaLabel="Skip cinematic" onClick={skipScene} />
      )}
    </dialog>
  )
}

export function BriefRosterExit({
  scene,
  onComplete,
}: {
  scene: CinematicSceneData
  onComplete: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const finished = useRef(false)
  const titleId = useId()
  const night = scene.kind !== 'departure'

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
    const timer = window.setTimeout(() => autoFinish(), 1200)
    return () => {
      window.clearTimeout(timer)
      element.close?.()
      element.removeAttribute('open')
    }
  }, [])

  return (
    <dialog
      ref={dialog}
      className="betrayals-brief-exit"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        finish()
      }}
    >
      <strong id={titleId}>
        {scene.subject?.name ?? 'A contestant'} {night ? 'was eliminated at night' : 'was banished'}
        {scene.role ? ' · ' + scene.role : ''}
      </strong>
      <CinematicSkipButton ariaLabel="Skip elimination" onClick={finish} />
    </dialog>
  )
}

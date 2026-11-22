import { appearanceFromAssetUrl } from '../appearance/catalog'
import { isBetrayalsLook } from './betrayalsAppearance'
import { BETRAYALS_AI_POOL } from './cast'
import type { CinematicCastMember } from './CinematicScene'

export type ConclaveShot = {
  entering?: boolean
  revealed: ReadonlySet<string>
  uncoveringId?: string
  focusId?: string
  speakerId?: string
  emphasize?: boolean
  letter?: 'open' | 'sealed'
  reducedMotion: boolean
}

const assets = import.meta.env.BASE_URL + 'assets/betrayals/'
const guests = new Set(BETRAYALS_AI_POOL.map(({ id }) => id))
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const mix = (a: number, b: number, t: number) => a + (b - a) * t

function load(src: string | undefined): Promise<HTMLImageElement | undefined> {
  if (!src) return Promise.resolve(undefined)
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(undefined)
    img.src = src
  })
}

async function loadPortrait(member: CinematicCastMember) {
  if (member.concealed) return {}
  const look = appearanceFromAssetUrl(member.portrait)
  const id =
    look?.kind === 'catalog' && isBetrayalsLook(look.lookId)
      ? look.lookId
      : !member.human && guests.has(member.id)
        ? member.id
        : undefined
  const [seated, speaking] = await Promise.all([
    load(id && `${assets}conclave/${id}-seated.webp`),
    load(id && `${assets}conclave/${id}-speaking.webp`),
  ])
  return { seated, speaking, fallback: seated ? undefined : await load(member.portrait) }
}

export function mountConclave(
  canvas: HTMLCanvasElement,
  cast: readonly CinematicCastMember[],
  initial: ConclaveShot,
  onReady: () => void,
  onUnavailable: () => void
) {
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) return null

  let shot = initial
  let disposed = false
  let frame: number | undefined
  let paint: ((ms: number) => void) | undefined
  let previous = 0
  let ready = false
  let entranceAt = 0
  let manual = 0
  let width = 1
  let height = 1
  let ratio = 1
  const camera = { x: 0.5, y: 0.5, zoom: 1 }
  const schedule = () => {
    if (!disposed && paint && frame === undefined) frame = window.requestAnimationFrame(paint)
  }

  const resize = () => {
    const { clientWidth, clientHeight } = canvas
    if (!clientWidth || !clientHeight) return
    width = clientWidth
    height = clientHeight
    ratio = Math.min(1.75, window.devicePixelRatio || 1)
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    schedule()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(canvas)
  resize()

  void Promise.all([
    load(assets + 'conclave/room.webp'),
    load(assets + 'conclave/entry-room.webp'),
    load(assets + 'conclave/hood-seated.webp'),
    load(assets + 'conclave/hood-lift.webp'),
    load(assets + 'wax-envelope.webp'),
    Promise.all(cast.map(loadPortrait)),
    Promise.all(
      cast.map((_, index) => load(assets + `conclave/walk-back-${(index % 4) + 1}.webp`))
    ),
  ]).then(([room, entry, hood, hoodLift, envelope, portraits, backs]) => {
    if (disposed) return
    if (!room) {
      onUnavailable()
      return
    }
    const roomRatio = room.naturalWidth / room.naturalHeight

    function drawEntry(ms: number, plate: HTMLImageElement) {
      if (!ctx) return
      const size = Math.max(width / plate.naturalWidth, height / plate.naturalHeight)
      const w = plate.naturalWidth * size
      const h = plate.naturalHeight * size
      ctx.drawImage(plate, (width - w) / 2, (height - h) * 0.55, w, h)
      for (const [index, back] of backs.entries()) {
        if (!back) continue
        const t = shot.reducedMotion ? 1 : clamp((ms - entranceAt - index * 140) / 2650, 0, 1)
        const travel = t * (2 - t)
        const slot = (index + 0.5) / cast.length - 0.5
        const bodyHeight = Math.min(height * 0.44, width * 0.36) * mix(1, 0.57, travel)
        const bodyWidth = bodyHeight * (back.naturalWidth / back.naturalHeight)
        const x = width * (0.5 + slot * mix(1.03, 0.61, travel)) - bodyWidth / 2
        const y = height * mix(0.94, 0.68, travel) - bodyHeight
        ctx.shadowColor = '#07070cbb'
        ctx.shadowBlur = 7 * ratio
        ctx.shadowOffsetY = 4 * ratio
        ctx.drawImage(back, x, y, bodyWidth, bodyHeight)
      }
      ctx.shadowColor = 'transparent'
    }

    function draw(ms: number) {
      if (!ctx || !room) return
      frame = undefined
      if (ready && ms - previous < 1000 / 34) {
        schedule()
        return
      }
      const dt = ready ? Math.min(100, ms - previous) : 100
      previous = ms
      const start = !ready
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      ctx.fillStyle = '#0b0d12'
      ctx.fillRect(0, 0, width, height)
      if (shot.entering && entry) {
        drawEntry(ms, entry)
        if (!shot.reducedMotion && ms - entranceAt < 2650 + cast.length * 140) schedule()
      } else {
        const plateHeight = Math.max(height * 1.12, width / roomRatio)
        const plateWidth = plateHeight * roomRatio
        const plateLeft = (width - plateWidth) / 2
        const plateTop = -height * 0.105
        const tableY = (x: number) => {
          const across = Math.abs((2 * (x - plateLeft)) / plateWidth - 1)
          return plateTop + plateHeight * (0.615 + 0.078 * across ** 2.45)
        }
        const bodyHeight = Math.min(height * 0.38, width / (cast.length * 0.8 + 0.08))
        const marks = cast.map((_, index) => width * ((index + 0.5) / cast.length))
        const focusId = shot.uncoveringId ?? shot.focusId ?? shot.speakerId
        const focus = cast.findIndex(({ id }) => id === focusId)
        const target = { x: 0.5, y: 0.5, zoom: 1 }
        if (focus >= 0) {
          const x = marks[focus]
          const portraitHeight = Math.min(height * (0.46 + (focus % 3) * 0.045), width * 1.06)
          const pullBack = clamp(Math.abs(manual) * 2.7, 0, 1)
          target.zoom = mix(Math.max(1.24, portraitHeight / bodyHeight), 1, pullBack)
          target.x = mix(x / width + manual * 0.32, 0.5, pullBack)
          const eyes = tableY(x) - bodyHeight * 0.62
          target.y = mix(0.5, eyes / height + 0.045 / target.zoom, clamp(target.zoom - 1, 0, 1))
        } else if (shot.letter) {
          target.zoom = 1.08
          target.y = 0.53
        }
        const still =
          Math.max(
            Math.abs(camera.x - target.x),
            Math.abs(camera.y - target.y),
            Math.abs(camera.zoom - target.zoom)
          ) < 0.0002
        const ease = start || shot.reducedMotion || still ? 1 : 1 - Math.exp(-dt / 177)
        camera.zoom = mix(camera.zoom, target.zoom, ease)
        camera.x = mix(camera.x, target.x, ease)
        camera.y = mix(camera.y, target.y, ease)
        if (ease < 1) schedule()
        const left = clamp(
          camera.x * width - width / (2 * camera.zoom),
          plateLeft,
          plateLeft + plateWidth - width / camera.zoom
        )
        const top = clamp(
          camera.y * height - height / (2 * camera.zoom),
          plateTop,
          plateTop + plateHeight - height / camera.zoom
        )
        ctx.scale(camera.zoom, camera.zoom)
        ctx.translate(-left, -top)
        ctx.drawImage(room, plateLeft, plateTop, plateWidth, plateHeight)

        for (const [index, member] of cast.entries()) {
          const x = marks[index]
          const isRevealed = !member.concealed && shot.revealed.has(member.id)
          const portrait = portraits[index]
          const speaking = shot.emphasize && shot.speakerId === member.id
          const person =
            (isRevealed && ((speaking && portrait.speaking) || portrait.seated)) ||
            (shot.uncoveringId === member.id ? (hoodLift ?? hood) : hood)
          const bodyWidth = bodyHeight * 0.8
          const y = tableY(x) - bodyHeight * 0.77
          if (isRevealed && !portrait.seated && portrait.fallback) {
            // Legacy player portraits are framed as one piece of artwork.
            ctx.save()
            ctx.beginPath()
            ctx.ellipse(
              x,
              y + bodyHeight * 0.46,
              bodyWidth * 0.46,
              bodyHeight * 0.47,
              0,
              0,
              Math.PI * 2
            )
            ctx.clip()
            ctx.drawImage(portrait.fallback, x - bodyWidth / 2, y, bodyWidth, bodyHeight)
            ctx.restore()
          } else if (person) {
            ctx.drawImage(person, x - bodyWidth / 2, y, bodyWidth, bodyHeight)
          }
        }

        // The room plate already contains the tabletop. Repaint just that surface
        // over the seated cast so every framing shares the same foreground edge.
        ctx.save()
        ctx.beginPath()
        for (let step = 0; step <= 48; step += 1) {
          const x = plateLeft + (plateWidth * step) / 48
          if (step === 0) ctx.moveTo(x, tableY(x))
          else ctx.lineTo(x, tableY(x))
        }
        ctx.lineTo(plateLeft + plateWidth, plateTop + plateHeight)
        ctx.lineTo(plateLeft, plateTop + plateHeight)
        ctx.closePath()
        ctx.clip()
        ctx.drawImage(room, plateLeft, plateTop, plateWidth, plateHeight)
        ctx.restore()

        if (shot.letter && envelope) {
          const w = Math.min(width * 0.29, height * 0.21)
          const h = w * (envelope.naturalHeight / envelope.naturalWidth)
          ctx.save()
          ctx.translate(width * 0.5, tableY(width * 0.5) + height * 0.135)
          ctx.rotate(-0.15)
          ctx.scale(1, 0.71)
          ctx.shadowColor = '#080605ce'
          ctx.shadowBlur = 10 * ratio
          ctx.shadowOffsetY = 4 * ratio
          ctx.filter = 'brightness(0.72) saturate(0.84)'
          if (shot.letter === 'open') {
            ctx.fillStyle = '#cbb798'
            ctx.fillRect(-w * 0.45, -h * 0.72, w * 0.61, h * 1.24)
          }
          ctx.drawImage(envelope, -w / 2, -h / 2, w, h)
          ctx.restore()
        }
      }
      if (start) {
        ready = true
        onReady()
      }
    }
    entranceAt = performance.now()
    paint = draw
    schedule()
  })

  return {
    setShot(next: ConclaveShot) {
      if (next.entering && !shot.entering) entranceAt = performance.now()
      if (next.focusId !== shot.focusId || next.speakerId !== shot.speakerId) manual = 0
      shot = next
      schedule()
    },
    look(delta: number) {
      manual = clamp(manual + delta, -0.55, 0.55)
      schedule()
    },
    dispose() {
      disposed = true
      if (frame !== undefined) window.cancelAnimationFrame(frame)
      observer.disconnect()
    },
  }
}

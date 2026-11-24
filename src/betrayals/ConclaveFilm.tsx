import { useEffect, useEffectEvent, useRef } from 'react'
import { usePresentationReducedMotion } from '../services/presentation/usePresentationReducedMotion'
import { cinematicLookId } from './cinematicCast'
import type { CinematicCastMember } from './CinematicScene'
import type { ConclaveFrame } from './conclaveDirection'
import { conclaveMedia } from './conclaveMedia'
import { getCamera, stageLayers, tableRadius, travelCamera } from './conclaveSet'
import type { StageAssets, StageGuest, StageLayer } from './conclaveSet'
import './ConclaveFilm.css'

const directory = 'assets/betrayals/conclave/'
const filmedLooks = new Set([
  'aria',
  'ash',
  'dex',
  'ivy',
  'lux',
  'nico',
  'pax',
  'rae',
  'rey',
  'sol',
  'vee',
  'pc-025',
  'bea',
  'blue',
  'echo',
  'finn',
  'jax',
  'kai',
  'kian',
  'mimi',
  'noa',
  'nova',
  'pc-005',
  'pc-015',
  'quinn',
  'remy',
  'rune',
  'zed',
])

const media = {
  corridor: directory + 'corridor.webp',
  latch: directory + 'latch.jpg',
  entry: directory + 'threshold.webp',
  chamber: directory + 'chamber.webp',
  oak: directory + 'council-oak.webp',
  base: directory + 'table-base.webp',
  hood: directory + 'seated-front.webp',
  rear: directory + 'seated-rear.webp',
  quarter: directory + 'seated-quarter.webp',
  lift: directory + 'seated-lift.webp',
  letter: 'assets/betrayals/wax-envelope.webp',
}

function stageGuest(member: CinematicCastMember, index: number): StageGuest {
  const guest = { id: member.id, slot: member.conclaveSeat ?? index, human: member.human }
  if (member.concealed) return guest
  const look = cinematicLookId(member)
  return look && filmedLooks.has(look)
    ? { ...guest, art: directory + 'full/' + look + '.webp' }
    : { ...guest, portrait: member.portrait }
}

function frameDuration(frame: ConclaveFrame) {
  switch (frame) {
    case 'corridor':
      return 1700
    case 'latch':
      return 1020
    case 'entry':
      return 2600
    case 'hood':
      return 2100
    default:
      return 2000
  }
}

function paintLayer(
  context: CanvasRenderingContext2D,
  layer: StageLayer,
  images: Record<string, HTMLImageElement>,
  table?: { top: HTMLCanvasElement; rim: HTMLCanvasElement }
) {
  const { x, y, w, h } = layer
  if (w <= 0 || h <= 0) return
  if (layer.kind === 'shadow' || layer.kind === 'foot') {
    context.save()
    context.translate(x + w / 2, y + h / 2)
    context.scale(w / 2, h / 2)
    const shadow = context.createRadialGradient(0, 0, 0, 0, 0, 1)
    shadow.addColorStop(0, layer.kind === 'foot' ? '#080604bb' : '#080604cc')
    shadow.addColorStop(0.48, '#08060466')
    shadow.addColorStop(1, '#08060400')
    context.fillStyle = shadow
    context.fillRect(-1, -1, 2, 2)
    context.restore()
    return
  }
  if (layer.kind === 'flash') {
    context.save()
    context.globalAlpha = layer.opacity
    const exposure = context.createRadialGradient(
      w * 0.38,
      h * 0.4,
      0,
      w * 0.38,
      h * 0.4,
      Math.hypot(w, h) * 0.83
    )
    exposure.addColorStop(0, '#efdbc0')
    exposure.addColorStop(1, '#936d50')
    context.fillStyle = exposure
    context.fillRect(0, 0, w, h)
    context.restore()
    return
  }
  if (layer.kind !== 'image') return
  const picture = images[layer.src]
  if (!picture || layer.opacity === 0) return
  context.save()
  context.globalAlpha = layer.opacity ?? 1
  context.filter =
    [layer.brightness && `brightness(${layer.brightness})`, layer.blur && `blur(${layer.blur}px)`]
      .filter(Boolean)
      .join(' ') || 'none'
  if (layer.plane && table) {
    const { focal, distance, eyeGap, axisX, aim, horizon } = layer.plane
    const radius = tableRadius
    // A row at the far edge has a different focal scale from one at the near lip.
    const bands = 32
    const texture = (layer.brightness ?? 1) < 0.5 ? table.rim : table.top
    context.filter = 'none'
    for (let row = 0; row < bands; row++) {
      const z0 = radius * ((2 * row) / bands - 1),
        z1 = radius * ((2 * (row + 1)) / bands - 1)
      const far = focal / (distance - z0),
        near = focal / (distance - z1)
      const scale = (far + near) * 0.5
      const destY = horizon + eyeGap * far
      context.drawImage(
        texture,
        0,
        (row * texture.height) / bands,
        texture.width,
        texture.height / bands,
        axisX - (aim + radius) * scale,
        destY,
        2 * radius * scale,
        (near - far) * eyeGap + 0.28
      )
    }
  } else {
    context.translate(x + w / 2, y + h / 2)
    if (layer.rotation) context.rotate(layer.rotation)
    if (layer.mirror) context.scale(-1, 1)
    if (layer.mask) {
      context.beginPath()
      context.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2)
      context.clip()
    }
    if (layer.crop) context.drawImage(picture, ...layer.crop, -w / 2, -h / 2, w, h)
    else context.drawImage(picture, -w / 2, -h / 2, w, h)
  }
  context.restore()
}

type Props = {
  cast: readonly CinematicCastMember[]
  frame: ConclaveFrame
  revealed: ReadonlySet<string>
  focusId?: string
  discussion?: boolean
  reducedMotion?: boolean
  onSurfaceReady?: () => void
}

export function ConclaveFilm({
  cast,
  frame,
  revealed,
  focusId,
  discussion = false,
  reducedMotion = false,
  onSurfaceReady,
}: Props) {
  const root = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const requestPaint = useRef<() => void>(null)
  const orbit = useRef(0)
  const pointer = useRef<{ id: number; x: number }>(undefined)
  const route = JSON.stringify(cast.map(stageGuest))
  const systemReduced = usePresentationReducedMotion()
  const still = reducedMotion || systemReduced
  const canLook = discussion && !still
  const state = useEffectEvent(() => ({ frame, focusId, revealed, discussion, still }))
  const surfaceReady = useEffectEvent(() => onSurfaceReady?.())

  useEffect(() => {
    const element = canvas.current
    const wrapper = root.current
    if (!element || !wrapper) return
    const context = element.getContext('2d', { alpha: false })
    if (!context) {
      surfaceReady()
      return
    }
    const cast: StageGuest[] = JSON.parse(route)
    const images: Record<string, HTMLImageElement> = {}
    const assets: StageAssets = {}
    const sources: Record<string, string> = { ...media }
    for (const guest of cast) {
      if (guest.art) sources['art:' + guest.id] = guest.art
      if (guest.portrait) sources['portrait:' + guest.id] = guest.portrait
    }

    const table = { top: document.createElement('canvas'), rim: document.createElement('canvas') }
    const surfaces = [table.top, table.rim].map((sheet) => {
      sheet.width = sheet.height = 512
      return sheet.getContext('2d')
    })
    let lastAngle = NaN
    let raf: number | undefined
    let live = true
    let ready = false
    let last = -Infinity
    let sceneStart = -1
    let shotStart = -1
    let shotKey = ''
    let width = 0
    let height = 0
    let ratio = 1
    let pan = 0
    let camera = getCamera(state(), cast)
    let from = camera
    function settle() {
      if (!live || ready) return
      ready = true
      surfaceReady()
      schedule()
    }
    const timeout = window.setTimeout(settle, 1400)
    void Promise.all(
      Object.entries(sources).map(
        ([key, path]) =>
          new Promise<void>((resolve) => {
            const picture = new Image()
            picture.onload = () => {
              if (live) {
                images[key] = picture
                assets[key] = { width: picture.naturalWidth, height: picture.naturalHeight }
              }
              resolve()
            }
            picture.onerror = () => resolve()
            picture.src = conclaveMedia(path)
          })
      )
    ).then(() => {
      window.clearTimeout(timeout)
      settle()
      schedule()
    })

    function schedule() {
      if (live && raf === undefined) raf = window.requestAnimationFrame(paint)
    }

    function resize() {
      if (!element || !wrapper) return
      const nextWidth = element.clientWidth
      const nextHeight = element.clientHeight
      const nextRatio = Math.min(1.6, window.devicePixelRatio || 1)
      if (!nextWidth || !nextHeight) return
      if (width === nextWidth && height === nextHeight && ratio === nextRatio) return
      width = nextWidth
      height = nextHeight
      ratio = nextRatio
      element.width = Math.round(width * ratio)
      element.height = Math.round(height * ratio)
      wrapper.removeAttribute('data-painted')
      schedule()
    }

    function paint(ms: number) {
      raf = undefined
      if (!live || !context || !wrapper || !width || !height || !ready) return
      const shot = state()
      if (!shot.still && ms - last < 1000 / 32) {
        schedule()
        return
      }
      last = ms
      if (sceneStart < 0) sceneStart = ms
      const key = shot.frame + '|' + (shot.focusId ?? '')
      if (key !== shotKey) {
        orbit.current = 0
        pan = 0
        from = camera
        shotStart = ms
        shotKey = key
      }
      pan += (orbit.current - pan) * 0.19
      const age = ms - shotStart
      const cameraTime = shot.frame === 'portrait' ? 1170 : 1550
      camera = travelCamera(from, getCamera(shot, cast, pan), shot.still ? 1 : age / cameraTime)
      const layers = stageLayers(
        width,
        height,
        camera,
        cast,
        assets,
        shot,
        shot.still ? 0 : (ms - sceneStart) / 1000,
        shot.still ? 1 : Math.min(1, age / frameDuration(shot.frame))
      )
      if (layers.length) {
        context.setTransform(ratio, 0, 0, ratio, 0, 0)
        context.fillStyle = '#171213'
        context.fillRect(0, 0, width, height)
        const top = layers.find((layer) => layer.kind === 'image' && layer.plane)
        if (top?.kind === 'image' && images.oak) {
          const angle = Math.round((top.rotation ?? 0) * 160) / 160
          if (angle !== lastAngle) {
            for (const [index, texture] of surfaces.entries()) {
              if (!texture) continue
              texture.setTransform(1, 0, 0, 1, 0, 0)
              texture.clearRect(0, 0, 512, 512)
              texture.translate(256, 256)
              texture.rotate(angle)
              texture.filter = index === 0 ? 'brightness(0.83)' : 'brightness(0.36)'
              texture.drawImage(images.oak, -256, -256, 512, 512)
            }
            lastAngle = angle
          }
        }
        for (const layer of layers) {
          if (
            layer.x <= width &&
            layer.x + layer.w >= 0 &&
            layer.y <= height &&
            layer.y + layer.h >= 0
          ) {
            paintLayer(context, layer, images, surfaces.every(Boolean) ? table : undefined)
          }
        }
        if (!wrapper.hasAttribute('data-painted')) wrapper.setAttribute('data-painted', 'true')
      } else {
        wrapper.removeAttribute('data-painted')
      }
      if (!shot.still) schedule()
    }

    requestPaint.current = schedule
    resize()
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(resize)
    observer?.observe(element)
    window.addEventListener('resize', resize)
    return () => {
      live = false
      requestPaint.current = null
      window.clearTimeout(timeout)
      if (raf !== undefined) window.cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      observer?.disconnect()
      wrapper.removeAttribute('data-painted')
    }
  }, [route])

  useEffect(() => {
    requestPaint.current?.()
  }, [frame, focusId, revealed, discussion, still])

  const poster =
    frame === 'corridor' || frame === 'latch' || frame === 'entry'
      ? media[frame]
      : directory + 'room.webp'

  function look(delta: number) {
    orbit.current = Math.max(-0.58, Math.min(0.58, orbit.current + delta))
  }

  return (
    <div
      ref={root}
      className="conclave-film"
      data-frame={frame}
      data-focus={focusId}
      data-group={cast.length}
      aria-hidden={canLook ? undefined : true}
    >
      <img className="conclave-film__poster" src={conclaveMedia(poster)} alt="" />
      <canvas
        ref={canvas}
        className="conclave-film__set"
        role={canLook ? 'group' : undefined}
        aria-label={
          canLook
            ? 'Conclave camera. Drag or use the arrow keys to pan across the table.'
            : undefined
        }
        tabIndex={canLook ? 0 : undefined}
        data-interactive={canLook || undefined}
        onPointerDown={(event) => {
          if (!canLook || !event.isPrimary || event.button !== 0) return
          pointer.current = { id: event.pointerId, x: event.clientX }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          const drag = pointer.current
          if (!canLook || !drag || drag.id !== event.pointerId) return
          look((drag.x - event.clientX) * 0.007)
          drag.x = event.clientX
        }}
        onLostPointerCapture={() => {
          pointer.current = undefined
        }}
        onKeyDown={(event) => {
          if (!canLook || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return
          event.preventDefault()
          look(event.key === 'ArrowLeft' ? -0.24 : 0.24)
        }}
      />
      <div className="conclave-film__grade" />
    </div>
  )
}

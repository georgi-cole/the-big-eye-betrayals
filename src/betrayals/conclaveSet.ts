import type { ConclaveFrame } from './conclaveDirection'

// The table and seats share one set. Positive Z faces the entrance.
const seatPlans = [
  [],
  [Math.PI],
  [-Math.PI / 2, Math.PI / 2],
  [0, (-2 * Math.PI) / 3, (2 * Math.PI) / 3],
  [-0.96, -2.54, 2.54, 0.96],
]

export function arrangeConclaveSeats(cast: readonly StageGuest[]) {
  const ordered = [...cast].sort((a, b) => a.slot - b.slot)
  const player = cast.length === 3 ? ordered.findIndex((guest) => guest.human) : -1
  if (player > 0) ordered.unshift(...ordered.splice(player, 1))
  const angles = seatPlans[cast.length] ?? []
  return ordered.map((guest, index) => ({
    ...guest,
    angle: angles[index] ?? (2 * Math.PI * index) / cast.length,
  }))
}
const seatRadius = 1.18
export const tableRadius = 1.04
const tableHeight = 0.77
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value))
const mix = (start: number, end: number, t: number) => start + (end - start) * t
const smooth = (value: number) => {
  const t = clamp(value)
  return t * t * (3 - 2 * t)
}

export type StageGuest = {
  id: string
  slot: number
  human?: boolean
  art?: string
  portrait?: string
  crop?: readonly [number, number, number, number]
}

export type Camera = {
  angle: number
  distance: number
  eye: number
  aim: number
  horizon: number
  lens: number
}

export type StageDirection = {
  frame: ConclaveFrame
  focusId?: string
  discussion: boolean
  still: boolean
  revealed: ReadonlySet<string>
}

type Sprite = { width: number; height: number }
export type StageAssets = Record<string, Sprite>
type Box = { x: number; y: number; w: number; h: number }

export type StageLayer =
  | (Box & { kind: 'shadow' | 'foot' })
  | (Box & { kind: 'flash'; opacity: number })
  | (Box & {
      kind: 'image'
      src: string
      opacity?: number
      blur?: number
      rotation?: number
      brightness?: number
      mirror?: boolean
      mask?: 'ellipse'
      crop?: StageGuest['crop']
      plane?: {
        focal: number
        distance: number
        eyeGap: number
        axisX: number
        aim: number
        horizon: number
      }
    })

export function getCamera(shot: StageDirection, cast: readonly StageGuest[], orbit = 0): Camera {
  const wide = {
    angle: 0,
    distance: cast.length === 3 ? 5.38 : 4.95,
    eye: 1.55,
    aim: 0,
    horizon: 0.46,
    lens: 0.91,
  }
  if (shot.frame === 'sealed') {
    return {
      ...wide,
      angle: cast.length === 3 ? 0.72 : 0.12,
      distance: 2.5,
      eye: 2.05,
      horizon: 0.12,
      lens: 1.05,
    }
  }
  if (shot.frame !== 'hood' && shot.frame !== 'portrait') return wide
  const focused = arrangeConclaveSeats(cast).find(({ id }) => id === shot.focusId)
  if (!focused) return wide
  const facing = focused.angle
  const coverage = Math.sin(facing) >= 0 ? -0.41 : 0.41
  const angle = facing + Math.PI + coverage + orbit * 0.85
  return {
    angle,
    distance: (shot.frame === 'hood' ? 2.73 : 2.48) + Math.abs(orbit) * 1.18,
    eye: 1.45,
    aim: Math.sin(facing - angle) * seatRadius * 0.88 + orbit * 0.56,
    horizon: 0.42,
    lens: 1.22,
  }
}

export function travelCamera(from: Camera, to: Camera, t: number): Camera {
  const progress = smooth(t)
  const angularDistance = Math.atan2(
    Math.sin(to.angle - from.angle),
    Math.cos(to.angle - from.angle)
  )
  return {
    angle: from.angle + angularDistance * progress,
    distance: mix(from.distance, to.distance, progress),
    eye: mix(from.eye, to.eye, progress),
    aim: mix(from.aim, to.aim, progress),
    horizon: mix(from.horizon, to.horizon, progress),
    lens: mix(from.lens, to.lens, progress),
  }
}

function projectedSet(width: number, height: number, camera: Camera, drift: number) {
  const focalLength = Math.min(height * camera.lens, width * 1.84)
  const angle = camera.angle + drift
  const sin = Math.sin(angle)
  const cos = Math.cos(angle)
  return {
    focalLength,
    angle,
    blockingAngle: camera.angle,
    sin,
    cos,
    project(x: number, y: number, z: number) {
      const depth = Math.max(0.32, camera.distance - x * sin - z * cos)
      const scale = focalLength / depth
      return {
        x: width * 0.5 + (x * cos - z * sin - camera.aim) * scale,
        y: height * camera.horizon + (camera.eye - y) * scale,
        scale,
        depth,
      }
    },
  }
}

function image(
  src: string,
  x: number,
  y: number,
  w: number,
  h: number
): Extract<StageLayer, { kind: 'image' }> {
  return { kind: 'image', src, x, y, w, h }
}

type Projection = ReturnType<typeof projectedSet>

function locationPlate(
  frame: 'corridor' | 'latch' | 'entry',
  width: number,
  height: number,
  assets: StageAssets,
  progress: number
): StageLayer[] {
  const art = assets[frame]
  if (!art) return []
  const move = smooth(progress)
  const zoom =
    frame === 'latch' ? 1.04 + move * 0.05 : 1.015 + move * (frame === 'entry' ? 0.065 : 0.125)
  const scale = Math.max(width / art.width, height / art.height) * zoom
  const w = art.width * scale
  const h = art.height * scale
  return [image(frame, (width - w) / 2, (height - h) * 0.48, w, h)]
}

function seatedLayer(
  guest: StageGuest & { angle: number },
  index: number,
  shot: StageDirection,
  assets: StageAssets,
  projection: Projection,
  elapsed: number,
  progress: number
): { depth: number; near: boolean; layers: StageLayer[] } {
  const theta = guest.angle
  const facing = Math.cos(theta - projection.blockingAngle)
  const fromBehind = facing > 0.15
  const location = projection.project(Math.sin(theta) * seatRadius, 0, Math.cos(theta) * seatRadius)
  const focused = shot.focusId === guest.id
  const speaking = focused && shot.discussion
  const lifting = focused && shot.frame === 'hood'
  const revealing = focused && shot.frame === 'portrait' && !shot.discussion
  const visible = shot.revealed.has(guest.id)
  const portrait = assets['portrait:' + guest.id]
  const body = assets['art:' + guest.id]
  const faceAmount =
    visible && (body || portrait) && (!revealing || shot.still || progress >= 0.12) ? 1 : 0
  const breath = shot.still ? 0 : Math.sin(elapsed * 1.48 + index * 1.2)
  const lean = speaking && !shot.still ? Math.sin(progress * Math.PI) : 0
  const close = shot.frame === 'portrait' || shot.frame === 'hood'
  const brightness = focused ? 0.96 : fromBehind ? 0.66 : 0.86
  const blur = close && !focused ? (fromBehind ? 2.35 : 1.25) : undefined
  const h = location.scale * (1.39 + 0.003 * breath)
  const center = location.x + location.scale * (0.004 * breath + 0.009 * lean)
  const y = location.y - h
  const layered: StageLayer[] = [
    {
      kind: 'foot',
      x: center - location.scale * 0.38,
      y: location.y - location.scale * 0.05,
      w: location.scale * 0.76,
      h: location.scale * 0.12,
    },
  ]
  function person(src: string, opacity = 1, mirror = false) {
    const picture = assets[src]
    if (!picture || opacity <= 0) return
    const w = (h * picture.width) / picture.height
    layered.push({
      kind: 'image',
      src,
      x: center - w / 2,
      y,
      w,
      h,
      opacity,
      brightness,
      blur,
      mirror,
    })
  }
  if (fromBehind) {
    // Both rear plates include the occupant, the chair and its four feet.
    if (facing > 0.92) person('rear')
    else person('quarter', 1, Math.sin(theta - projection.blockingAngle) > 0)
  } else {
    const lift = lifting || revealing ? 1 : 0
    const hoodAmount = body ? 1 - faceAmount : 1
    person('hood', hoodAmount * (1 - lift))
    person('lift', hoodAmount * lift)
    if (body) person('art:' + guest.id, faceAmount)
    else if (portrait && faceAmount > 0) {
      const headHeight = h * 0.13
      const headWidth = h * 0.1
      const side = Math.min(portrait.width, portrait.height * 0.61)
      layered.push({
        kind: 'image',
        src: 'portrait:' + guest.id,
        x: center - headWidth / 2,
        y: y + h * 0.06,
        w: headWidth,
        h: headHeight,
        mask: 'ellipse',
        opacity: faceAmount,
        brightness: brightness * 0.85,
        blur,
        crop: [(portrait.width - side) / 2, portrait.height * 0.035, side, side],
      })
    }
  }
  return { depth: location.depth, near: fromBehind, layers: layered }
}

export function stageLayers(
  width: number,
  height: number,
  camera: Camera,
  cast: readonly StageGuest[],
  assets: StageAssets,
  shot: StageDirection,
  elapsed: number,
  progress: number
): StageLayer[] {
  if (shot.frame === 'corridor' || shot.frame === 'latch' || shot.frame === 'entry') {
    return locationPlate(shot.frame, width, height, assets, shot.still ? 0 : progress)
  }
  if (!assets.chamber || !assets.oak || !assets.hood || !assets.rear) return []

  const drift = shot.still ? 0 : 0.018 * Math.sin(elapsed * 0.78)
  const set = projectedSet(width, height, camera, drift)
  const offset = -set.sin * width * 0.18 - camera.aim * set.focalLength * 0.11
  const background = assets.chamber
  const viewHeight = Math.max(
    height * 1.12,
    (width + Math.abs(offset) * 2) * (background.height / background.width)
  )
  const viewWidth = viewHeight * (background.width / background.height)
  const close = shot.frame === 'portrait' || shot.frame === 'hood'
  const light = shot.still ? 0.85 : 0.85 + Math.sin(elapsed * 5.4) * 0.008
  const layers: StageLayer[] = [
    {
      kind: 'image',
      src: 'chamber',
      x: (width - viewWidth) / 2 + offset,
      y: (height - viewHeight) * 0.76,
      w: viewWidth,
      h: viewHeight,
      brightness: light,
      blur: close ? 1.2 : undefined,
    },
  ]
  const center = set.project(0, tableHeight, 0)
  const front = set.project(tableRadius * set.sin, tableHeight, tableRadius * set.cos)
  const back = set.project(-tableRadius * set.sin, tableHeight, -tableRadius * set.cos)
  const foot = set.project(0, 0, 0)
  const topWidth =
    (tableRadius * 2 * set.focalLength) / Math.sqrt(camera.distance ** 2 - tableRadius ** 2)
  const topHeight = front.y - back.y
  const apron = center.scale * 0.09
  const top = {
    x: center.x - topWidth / 2,
    y: back.y,
    w: topWidth,
    h: topHeight,
    kind: 'image',
    src: 'oak',
    plane: {
      focal: set.focalLength,
      distance: camera.distance,
      eyeGap: camera.eye - tableHeight,
      axisX: width / 2,
      aim: camera.aim,
      horizon: height * camera.horizon,
    },
    rotation: -set.angle,
  } as const
  layers.push({
    kind: 'shadow',
    x: center.x - topWidth * 0.59,
    y: foot.y - topHeight * 0.1,
    w: topWidth * 1.18,
    h: topHeight * 0.64,
  })

  const actors = arrangeConclaveSeats(cast)
    .map((guest, index) => seatedLayer(guest, index, shot, assets, set, elapsed, progress))
    .sort((a, b) => b.depth - a.depth)
  function drawActors(near: boolean) {
    for (const actor of actors) if (actor.near === near) layers.push(...actor.layers)
  }
  drawActors(false)
  if (assets.base) {
    const baseH = foot.y - center.y
    const baseW = (baseH * assets.base.width) / assets.base.height
    layers.push({
      ...image('base', center.x - baseW / 2, center.y, baseW, baseH),
      brightness: 0.72,
    })
  }
  layers.push(
    {
      ...top,
      y: top.y + apron,
      brightness: 0.36,
      plane: { ...top.plane, horizon: top.plane.horizon + apron },
    },
    { ...top, brightness: 0.83 }
  )
  if (shot.frame === 'sealed' && assets.letter) {
    const letter = set.project(0.02, tableHeight + 0.015, 0.28)
    const w = letter.scale * 0.56
    const h = (w * assets.letter.height) / assets.letter.width
    layers.push({
      kind: 'image',
      src: 'letter',
      x: letter.x - w / 2,
      y: letter.y - h / 2,
      w,
      h,
      brightness: 0.86,
      rotation: -0.055,
    })
  }
  drawActors(true)
  if (
    shot.frame === 'portrait' &&
    !shot.discussion &&
    !shot.still &&
    shot.focusId &&
    shot.revealed.has(shot.focusId)
  ) {
    const flash = smooth((progress - 0.045) / 0.053) * (1 - smooth((progress - 0.145) / 0.12))
    if (flash > 0) layers.push({ kind: 'flash', x: 0, y: 0, w: width, h: height, opacity: flash })
  }
  return layers
}

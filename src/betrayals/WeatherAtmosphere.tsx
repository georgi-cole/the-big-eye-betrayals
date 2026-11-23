import { useEffect, useRef } from 'react'
import { mulberry32 } from '../store/rng'
import type { CastleWeather } from './presentation'

const wrap = (value: number, period: number) => ((value % period) + period) % period

function makeMist(random: () => number) {
  const texture = document.createElement('canvas')
  texture.width = 288
  texture.height = 96
  const ctx = texture.getContext('2d')
  if (!ctx) return texture
  const image = ctx.createImageData(texture.width, texture.height)
  const octaves = [6, 13, 29].map((columns) => ({
    columns,
    rows: Math.ceil(columns / 3),
    values: Array.from({ length: columns * Math.ceil(columns / 3) }, random),
  }))
  for (let y = 0; y < texture.height; y += 1) {
    for (let x = 0; x < texture.width; x += 1) {
      let density = 0
      for (const [index, { columns, rows, values }] of octaves.entries()) {
        const u = (x / texture.width) * columns
        const v = (y / texture.height) * rows
        const col = Math.floor(u)
        const row = Math.floor(v)
        const tx = u - col
        const ty = v - row
        const a = tx * tx * (3 - 2 * tx)
        const b = ty * ty * (3 - 2 * ty)
        const cell = (i: number, j: number) => values[(j % rows) * columns + (i % columns)]
        const top = cell(col, row) * (1 - a) + cell(col + 1, row) * a
        const bottom = cell(col, row + 1) * (1 - a) + cell(col + 1, row + 1) * a
        density += (top * (1 - b) + bottom * b) * [0.62, 0.27, 0.11][index]
      }
      const offset = (y * texture.width + x) * 4
      image.data[offset] = 177
      image.data[offset + 1] = 195
      image.data[offset + 2] = 216
      const edge = Math.sin((Math.PI * y) / texture.height) ** 1.7
      image.data[offset + 3] = Math.max(0, density - 0.23) * edge * 122
    }
  }
  ctx.putImageData(image, 0, 0)
  return texture
}

function makeSnow() {
  const texture = document.createElement('canvas')
  texture.width = 32
  texture.height = 32
  const ctx = texture.getContext('2d')
  if (!ctx) return texture
  const soft = ctx.createRadialGradient(16, 16, 0, 16, 16, 16)
  soft.addColorStop(0, '#f7fbff')
  soft.addColorStop(0.3, '#e1eeffcf')
  soft.addColorStop(0.67, '#c1d8ff3d')
  soft.addColorStop(1, '#bcdaff00')
  ctx.fillStyle = soft
  ctx.fillRect(0, 0, 32, 32)
  return texture
}

function makeRain() {
  const texture = document.createElement('canvas')
  texture.width = 8
  texture.height = 48
  const ctx = texture.getContext('2d')
  if (!ctx) return texture
  const tail = ctx.createLinearGradient(0, 0, 0, 48)
  tail.addColorStop(0, '#bfd8f400')
  tail.addColorStop(0.55, '#bfd8f466')
  tail.addColorStop(0.88, '#d0e5fc')
  tail.addColorStop(1, '#bfd8f400')
  ctx.fillStyle = tail
  ctx.fillRect(0, 0, 8, 48)
  const blur = ctx.createLinearGradient(0, 0, 8, 0)
  blur.addColorStop(0, '#fff0')
  blur.addColorStop(0.5, '#fff')
  blur.addColorStop(1, '#fff0')
  ctx.globalCompositeOperation = 'destination-in'
  ctx.fillStyle = blur
  ctx.fillRect(0, 0, 8, 48)
  return texture
}

export function WeatherAtmosphere({
  weather,
  reducedMotion = false,
  strength = 1,
}: {
  weather: CastleWeather | 'clouds'
  reducedMotion?: boolean
  strength?: number
}) {
  const surface = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = surface.current
    if (!canvas || reducedMotion || weather === 'clear' || typeof ResizeObserver === 'undefined')
      return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const random = mulberry32(0x6bc33)
    const sizeBoost = 1 + (strength - 1) * 0.38
    const densityBoost = 1 + (strength - 1) * 0.28
    const rain = weather === 'rain' ? makeRain() : undefined
    const clouds = weather === 'clouds'
    const fog = clouds || weather === 'mist' ? makeMist(random) : undefined
    const flake = weather === 'snow' ? makeSnow() : undefined
    const particles = fog
      ? []
      : Array.from({ length: rain ? 245 : 150 }, () => ({
          x: random(),
          y: random(),
          depth: random() ** 1.8,
          pace: 0.67 + random() * 0.66,
          angle: random() * Math.PI * 2,
          light: 0.45 + random() * 0.55,
        }))
    let width = 0
    let height = 0
    let ratio = 1
    let frame = 0
    let previous = 0
    const start = performance.now()
    const resize = () => {
      const measured = canvas.getBoundingClientRect()
      width = canvas.clientWidth || measured.width
      height = canvas.clientHeight || measured.height
      ratio = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()

    function draw(now: number) {
      if (!ctx) return
      frame = window.requestAnimationFrame(draw)
      if (!width || !height || now - previous < 1000 / 34) return
      previous = now
      const t = (now - start) / 1000
      const size = Math.min(1.25, Math.max(0.66, Math.sqrt(width * height) / 365))
      const horizon = height * 0.54
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      ctx.clearRect(0, 0, width, height)
      if (fog) {
        for (const [index, opacity] of [0.35, 0.6, 0.43].entries()) {
          const bandHeight = height * (0.31 + index * 0.045)
          const span = width * (1.54 + index * 0.32)
          const left = -wrap(
            t * (index % 2 ? -11 : 8 + index * 4) + span * (0.47 + index * 0.18),
            span
          )
          const top = clouds
            ? height * (-0.08 + index * 0.179)
            : horizon - bandHeight * 0.66 + index * height * 0.091
          ctx.globalAlpha = Math.min(1, opacity * strength * (clouds ? 0.93 : 1))
          ctx.drawImage(fog, left, top, span, bandHeight)
          ctx.drawImage(fog, left + span, top, span, bandHeight)
        }
        ctx.globalAlpha = 1
        return
      }

      const count = Math.min(
        particles.length,
        Math.round(Math.sqrt(width * height) * (rain ? 0.47 : 0.3) * densityBoost)
      )
      for (let i = 0; i < count; i += 1) {
        const { x, y, depth, pace, angle, light } = particles[i]
        const wind = rain ? -34 - depth * 145 : -7 - depth * 20
        const speed = rain ? 155 + depth * 515 : 12 + depth * 45
        const turbulence = rain ? 0 : Math.sin(t * (0.53 + depth) + angle) * (2 + depth * 13)
        const pad = rain ? 40 : 12
        const px = wrap(x * (width + pad * 2) + wind * size * t + turbulence, width + 2 * pad) - pad
        const py = wrap(y * (height + pad * 2) + speed * size * pace * t, height + 2 * pad) - pad
        if (rain) {
          const length = (5 + depth * 24) * pace * size * sizeBoost
          const direction = Math.atan2(-wind, speed * pace)
          const cos = Math.cos(direction) * ratio
          const sin = Math.sin(direction) * ratio
          const w = (0.9 + depth * 1.65) * size * sizeBoost
          ctx.setTransform(cos, sin, -sin, cos, px * ratio, py * ratio)
          ctx.globalAlpha = Math.min(1, (0.18 + depth * 0.33) * light * strength)
          ctx.drawImage(rain, -w / 2, -length, w, length)
        } else if (flake) {
          const radius = (0.52 + depth * depth * 3.1) * size * sizeBoost
          const glint = 0.82 + Math.sin(t * 1.4 + angle) * 0.18
          ctx.globalAlpha = Math.min(1, (0.18 + depth * 0.48) * light * glint * strength)
          ctx.drawImage(flake, px - radius, py - radius, radius * 2, radius * 2)
        }
      }
      ctx.globalAlpha = 1
    }

    frame = window.requestAnimationFrame(draw)
    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [weather, reducedMotion, strength])

  if (weather === 'clear' || reducedMotion) return null
  return (
    <canvas
      className="betrayals-weather"
      data-weather-particles={weather}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
      ref={surface}
      aria-hidden="true"
    />
  )
}

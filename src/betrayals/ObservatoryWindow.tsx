import { useId } from 'react'
import { WeatherAtmosphere } from './WeatherAtmosphere'
import type { ObservatorySky } from './observatoryWeather'
import './observatoryWindow.css'

export function ObservatoryWindow({
  view,
  previous,
  reducedMotion,
}: {
  view: ObservatorySky
  previous?: ObservatorySky
  reducedMotion: boolean
}) {
  const aperture = useId()
  const { time, sky } = view
  const particles = sky === 'storm' ? 'rain' : sky
  const sunlight = sky === 'clear' && time !== 'night'
  const transitioning = previous && !reducedMotion
  return (
    <>
      <svg className="betrayals-observatory-mask" aria-hidden="true">
        <defs>
          <mask
            id={aperture}
            maskUnits="objectBoundingBox"
            maskContentUnits="objectBoundingBox"
            x="0"
            y="0"
            width="1"
            height="1"
          >
            {/* The mask traces the original 941 × 1672 observatory. Its dark paths
                leave the photographed mullions, jambs and sill visible. */}
            <g transform="scale(.004 .002369668) translate(-345 -435)">
              <path fill="#fff" d="M345 857V566C345 493 399 435 470 435s125 58 125 131v291Z" />
              <path
                fill="none"
                stroke="#000"
                strokeWidth="5"
                d="M345 582h250m-250 259h250M440 857V550a30 30 0 0 1 60 0v307M384 857V538l53 10m119 309V538l-57 10M348 541h35m174 0h36M365 544v313m211-313v313M346 702h20m210 0h19M386 775h20v80m128 0v-85h20"
              />
              <path
                fill="none"
                stroke="#000"
                strokeWidth="4"
                d="M441 542l-85-56m90 44-60-70m70 63-28-83m42 79v-84m14 88 29-81m-19 88 60-68m-53 80 84-50M385 538c13-35 47-62 85-62s72 27 86 62"
              />
            </g>
          </mask>
        </defs>
      </svg>
      <div
        className="betrayals-observatory-window"
        data-window-weather={sky}
        data-window-time={time}
        style={{ maskImage: `url("#${aperture}")` }}
      >
        {transitioning && (
          <div
            className="betrayals-observatory-window__sky"
            data-period={previous.time}
            data-sky={previous.sky}
          />
        )}
        <div
          key={time + sky}
          className="betrayals-observatory-window__sky"
          data-period={time}
          data-sky={sky}
          data-sky-transition={transitioning || undefined}
        />
        {!reducedMotion && sky !== 'clear' && (
          <WeatherAtmosphere weather="clouds" strength={sky === 'clouds' ? 1.75 : 1.15} />
        )}
        {particles !== 'clear' && particles !== 'clouds' && (
          <WeatherAtmosphere
            weather={particles}
            reducedMotion={reducedMotion}
            strength={sky === 'storm' ? 1.85 : 1.6}
          />
        )}
        {sky === 'storm' && !reducedMotion && (
          <div className="betrayals-observatory-window__lightning" />
        )}
      </div>
      {sunlight && <div className="betrayals-observatory-sunlight" data-window-time={time} />}
    </>
  )
}

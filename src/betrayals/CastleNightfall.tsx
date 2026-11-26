import type { CastleNightShot, CastleWeather } from './presentation'
import { WeatherAtmosphere } from './WeatherAtmosphere'
import './CastleNightfall.css'

export const nightfallArt = import.meta.env.BASE_URL + 'assets/betrayals/castle-nightfall.jpg'
export const nightfallWindows =
  import.meta.env.BASE_URL + 'assets/betrayals/castle-nightfall-unlit.png'
export const clearMoonSky =
  import.meta.env.BASE_URL + 'assets/betrayals/castle-nightfall-clear-sky.png'
const wings = ['west', 'keep', 'east'] as const

export function CastleNightfall({
  weather,
  reducedMotion,
  morningFrom,
  shot = 'courtyard',
}: {
  weather: CastleWeather
  reducedMotion: boolean
  morningFrom?: CastleWeather
  shot?: CastleNightShot
}) {
  const nightWeather = morningFrom ?? weather
  const nightcap = nightWeather === 'clear' || nightWeather === 'mist'

  return (
    <div
      className="betrayals-nightfall"
      aria-hidden="true"
      data-weather={nightWeather}
      data-morning={Boolean(morningFrom) || undefined}
      data-morning-weather={morningFrom && weather}
      data-shot={shot}
    >
      <div className="betrayals-nightfall__plane">
        <img src={nightfallArt} alt="" />
        {wings.map((wing) => (
          <img
            key={wing}
            className="betrayals-nightfall__windows"
            data-wing={wing}
            src={nightfallWindows}
            alt=""
          />
        ))}
        {morningFrom && (
          <>
            <img src={clearMoonSky} className="betrayals-nightfall__sky" alt="" />
            <img src={nightfallArt} className="betrayals-nightfall__departing-moon" alt="" />
          </>
        )}
        {nightcap && !reducedMotion && (
          <div className="betrayals-nightfall__moon">
            <span className="betrayals-nightfall__cap" />
          </div>
        )}
      </div>
      {morningFrom && <div className="betrayals-nightfall__daybreak" />}
      <div
        className={
          morningFrom && morningFrom !== weather ? 'betrayals-nightfall__weather-out' : undefined
        }
      >
        <WeatherAtmosphere weather={nightWeather} reducedMotion={reducedMotion} strength={1.28} />
      </div>
      {morningFrom && morningFrom !== weather && (
        <div className="betrayals-nightfall__weather-in">
          <WeatherAtmosphere weather={weather} reducedMotion={reducedMotion} strength={1.28} />
        </div>
      )}
      <div className="betrayals-cine__grade" />
    </div>
  )
}

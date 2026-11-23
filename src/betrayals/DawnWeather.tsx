import { useEffect, useEffectEvent } from 'react'
import { usePresentationReducedMotion } from '../services/presentation/usePresentationReducedMotion'
import type { CastleWeather } from './presentation'
import { WeatherAtmosphere } from './WeatherAtmosphere'

const duration = 2850

export function DawnWeather({
  weather,
  reducedMotion,
  onFinish,
}: {
  weather: CastleWeather
  reducedMotion: boolean
  onFinish?: () => void
}) {
  const prefersReducedMotion = usePresentationReducedMotion()
  const motionReduced = reducedMotion || prefersReducedMotion
  const finish = useEffectEvent(() => onFinish?.())
  useEffect(() => {
    const timer = window.setTimeout(finish, motionReduced ? 0 : duration)
    return () => window.clearTimeout(timer)
  }, [motionReduced])

  if (motionReduced) return null
  return (
    <div className="betrayals-dawn" data-dawn-weather={weather} aria-hidden="true">
      <img
        src={import.meta.env.BASE_URL + 'assets/betrayals/dawn-' + weather + '.webp'}
        alt=""
        fetchPriority="high"
      />
      <WeatherAtmosphere weather={weather} />
    </div>
  )
}

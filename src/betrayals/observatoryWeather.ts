import { useEffect, useState } from 'react'

const periods = [
  { time: 'sunrise', start: 5 },
  { time: 'morning', start: 7 },
  { time: 'noon', start: 11 },
  { time: 'afternoon', start: 14 },
  { time: 'evening', start: 18 },
  { time: 'night', start: 21 },
] as const
const variations = ['clear', 'clouds', 'mist', 'clear', 'rain', 'storm', 'snow'] as const
const dayMs = 24 * 60 * 60 * 1000

export function observatorySky(now: Date) {
  const hour = now.getHours()
  const next = periods.findIndex(({ start }) => hour < start)
  const index = next <= 0 ? periods.length - 1 : next - 1
  const calendarDay = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / dayMs)
  const slot = calendarDay + hour + index * 2
  const offset = ((slot % variations.length) + variations.length) % variations.length
  return { time: periods[index].time, sky: variations[offset] }
}

export type ObservatorySky = ReturnType<typeof observatorySky>

export function useObservatorySky() {
  const [view, setView] = useState<{ current: ObservatorySky; previous?: ObservatorySky }>(() => ({
    current: observatorySky(new Date()),
  }))

  useEffect(() => {
    let timer: number

    function schedule() {
      const now = new Date()
      const nextHour = new Date(now)
      nextHour.setMinutes(60, 0, 0)
      timer = window.setTimeout(refresh, nextHour.getTime() - now.getTime())
    }

    function refresh() {
      window.clearTimeout(timer)
      const next = observatorySky(new Date())
      setView((view) =>
        next.time === view.current.time && next.sky === view.current.sky
          ? view
          : { current: next, previous: view.current }
      )
      schedule()
    }

    function refreshWhenVisible() {
      if (!document.hidden) refresh()
    }

    schedule()
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', refresh)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pageshow', refresh)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [])

  return view
}

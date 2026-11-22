import { useEffect, useEffectEvent, useState } from 'react'
import { SoundManager } from '../../services/sound/SoundManager'
import './MinigameHost.css'

const timerSound = 'minigame:all_3_seconds_timer'
const goHold = 600
const countdownDuration = 3000 + goHold

function ReadyReadout({ title, count }: { title: string; count: number }) {
  return (
    <div className="minigame-host-ready" role="status" aria-label="Get Ready">
      <span className="minigame-host-ready-label">Get Ready</span>
      <span className="minigame-host-ready-game">{title}</span>
      {count > 0 ? (
        <span className="minigame-host-ready-count" key={count}>
          {count}
        </span>
      ) : (
        <span className="minigame-host-ready-go">GO!</span>
      )}
    </div>
  )
}

function RunningCountdown({
  title,
  skip,
  onComplete,
}: {
  title: string
  skip: boolean
  onComplete: () => void
}) {
  const [count, setCount] = useState(3)
  const finish = useEffectEvent(onComplete)

  useEffect(() => {
    if (skip) {
      const timer = setTimeout(finish, 0)
      return () => clearTimeout(timer)
    }
    const deadline = Date.now() + countdownDuration
    let timer: ReturnType<typeof setTimeout>
    const update = () => {
      const remaining = deadline - Date.now()
      setCount(Math.max(0, Math.ceil((remaining - goHold) / 1000)))
      if (remaining <= 0) finish()
      else timer = setTimeout(update, Math.min(100, remaining))
    }
    void SoundManager.play(timerSound)
    timer = setTimeout(update, 0)
    return () => {
      clearTimeout(timer)
      SoundManager.stop(timerSound)
    }
  }, [skip])

  return <ReadyReadout title={title} count={count} />
}

export function MinigameReadyCountdown({
  title,
  paused = false,
  skip = false,
  onComplete,
}: {
  title: string
  paused?: boolean
  skip?: boolean
  onComplete: () => void
}) {
  // Pausing cancels the timer and sound. The next active render starts a fresh count.
  return paused ? (
    <ReadyReadout title={title} count={3} />
  ) : (
    <RunningCountdown title={title} skip={skip} onComplete={onComplete} />
  )
}

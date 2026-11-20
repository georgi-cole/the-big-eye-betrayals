import { useEffect, useState } from 'react'

type RevealTiming = { firstDelay: number; stepDelay: number; immediate?: boolean }

export function usePacedReveal(total: number, { firstDelay, stepDelay, immediate }: RevealTiming) {
  const [revealed, setRevealed] = useState(0)
  const visible = immediate ? total : Math.min(revealed, total)

  useEffect(() => {
    if (visible >= total) return
    const timeout = window.setTimeout(
      () => setRevealed((count) => Math.min(count + 1, total)),
      visible === 0 ? firstDelay : stepDelay
    )
    return () => window.clearTimeout(timeout)
  }, [firstDelay, stepDelay, total, visible])

  return { visible, revealAll: () => setRevealed(total) }
}

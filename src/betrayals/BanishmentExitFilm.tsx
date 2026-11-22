import { useEffect, useEffectEvent, useRef } from 'react'
import type { ClipController } from '../cinematic/ceremonies/renderer'

export function BanishmentExitFilm({
  castId,
  name,
  onComplete,
}: {
  castId?: string
  name?: string
  onComplete: () => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const finish = useEffectEvent(onComplete)

  useEffect(() => {
    const target = host.current
    if (!target || !castId) {
      finish()
      return
    }
    let cancelled = false
    let clip: ClipController | undefined
    const timeout = window.setTimeout(() => {
      cancelled = true
      clip?.stop()
      finish()
    }, 8000)

    async function play() {
      const [{ createClip }, { default: catalog }] = await Promise.all([
        import('../cinematic/ceremonies/renderer'),
        import('../cinematic/ceremonies/cast.json'),
      ])
      if (cancelled || !target) return
      const character = catalog.characters.find(({ id }) => id === castId)
      if (!character) {
        finish()
        return
      }
      const subject = { ...character, name: name ?? character.name }
      clip = createClip()
      const ready = await clip.prepare('exit', { a: subject, b: subject, c: subject }, undefined, {
        edition: 'betrayals',
      })
      if (cancelled) return
      if (!ready) {
        finish()
        return
      }
      window.clearTimeout(timeout)
      clip.mount(
        target,
        () => finish(),
        () => finish()
      )
    }

    void play().catch(() => {
      if (!cancelled) finish()
    })
    return () => {
      cancelled = true
      window.clearTimeout(timeout)
      clip?.stop()
    }
  }, [castId, name])

  return <div ref={host} className="betrayals-cine__shared-exit" aria-hidden="true" />
}

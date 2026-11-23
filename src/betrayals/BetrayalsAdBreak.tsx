import { useEffect, useRef } from 'react'
import './BetrayalsAdBreak.css'

/** Native ads own their close control; a missing callback is handled by the hook. */
export function BetrayalsAdBreak({ active }: { active: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (active && !element.open) element.showModal()
    if (!active && element.open) element.close()
    return () => {
      if (element.open) element.close()
    }
  }, [active])

  return (
    <dialog
      ref={dialog}
      className="betrayals-ad-break"
      aria-labelledby="betrayals-ad-break-title"
      aria-describedby="betrayals-ad-break-description"
      onCancel={(event) => event.preventDefault()}
    >
      <div className="betrayals-ad-break__card" role="status" aria-live="polite">
        <span className="betrayals-ad-break__eyebrow">The Big Eye: Betrayals</span>
        <span className="betrayals-ad-break__seal" aria-hidden="true" />
        <h2 id="betrayals-ad-break-title">A short break</h2>
        <p id="betrayals-ad-break-description">Your season will continue automatically.</p>
      </div>
    </dialog>
  )
}

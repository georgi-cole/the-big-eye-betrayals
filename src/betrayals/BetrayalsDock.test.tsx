import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { BetrayalsDock } from './BetrayalsDock'

it('opens Home and exposes the Inbox with its request count', () => {
  const openHome = vi.fn()
  const openIncoming = vi.fn()
  const advance = vi.fn()
  const { rerender } = render(
    <BetrayalsDock
      home={{ onClick: openHome }}
      social={{ onClick: vi.fn() }}
      play={{ label: 'Continue to dawn', faceLabel: 'Dawn', onClick: advance }}
      incoming={{ onClick: openIncoming, count: 2, active: false }}
    />
  )
  const dock = within(screen.getByRole('navigation', { name: 'Season actions' }))

  fireEvent.click(dock.getByRole('button', { name: 'Home' }))
  fireEvent.click(dock.getByRole('button', { name: 'Inbox (2)' }))
  fireEvent.click(dock.getByRole('button', { name: 'Continue to dawn' }))

  expect(openHome).toHaveBeenCalledOnce()
  expect(openIncoming).toHaveBeenCalledOnce()
  expect(advance).toHaveBeenCalledOnce()
  expect(dock.queryByRole('button', { name: 'Music' })).not.toBeInTheDocument()

  rerender(<BetrayalsDock social={{ onClick: vi.fn() }} incoming={{ onClick: openIncoming }} />)
  const social = dock.getByRole('button', { name: 'Social' })
  const inbox = dock.getByRole('button', { name: 'Inbox' })
  expect(social.nextElementSibling).toBe(inbox)
  fireEvent.click(inbox)
  expect(openIncoming).toHaveBeenCalledTimes(2)
})

import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BETRAYALS_PORTRAITS, getBetrayalsPortrait } from './betrayalsAppearance'
import { ConclaveDiscussion } from './BetrayalsConclave'
import { BETRAYALS_AI_POOL } from './cast'
import { CinematicScene } from './CinematicScene'
import { conclaveOpeningBeats, conclaveRevealed } from './conclaveDirection'
import { cinematicFor, dawnBroadcast, presentationAfter } from './presentation'
import { startRun, viewFor } from './run'

vi.mock('./BanishmentExitFilm', () => ({
  BanishmentExitFilm: ({ castId, onComplete }: { castId: string; onComplete: () => void }) => (
    <button type="button" data-cast={castId} onClick={onComplete}>
      Finish shared exit
    </button>
  ),
}))

const known = { id: 'ash', name: 'Ash', portrait: '/assets/skins/Ash_avatar.webp' }
const hidden = { id: 'alien', name: 'Hidden identity', portrait: '/hidden.webp', concealed: true }

describe('Betrayals cinematic scenes', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('reveals only known conclave participants and waits for the player to continue', () => {
    vi.useFakeTimers()
    const onComplete = vi.fn()
    const { container } = render(
      <CinematicScene
        scene={{
          id: 'conclave',
          kind: 'conclave-arrival',
          conclaveOpening: true,
          cast: [known, hidden],
        }}
        onComplete={onComplete}
      />
    )
    expect(screen.queryByText(known.name)).not.toBeInTheDocument()
    const camera = container.querySelector('.conclave-film')
    expect(camera).toHaveAttribute('data-frame', 'corridor')
    act(() => vi.advanceTimersByTime(1700))
    expect(camera).toHaveAttribute('data-frame', 'latch')
    act(() => vi.advanceTimersByTime(1020))
    expect(camera).toHaveAttribute('data-frame', 'entry')
    act(() => vi.advanceTimersByTime(2600))
    expect(camera).toHaveAttribute('data-frame', 'table')
    act(() => vi.advanceTimersByTime(1850))
    expect(camera).toHaveAttribute('data-frame', 'hood')
    expect(screen.queryByText(known.name)).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(2150))
    expect(screen.getByText(known.name)).toBeInTheDocument()
    expect(camera).toHaveAttribute('data-frame', 'portrait')
    expect(camera).toHaveAttribute('data-focus', known.id)
    expect(screen.queryByText(hidden.name)).not.toBeInTheDocument()
    expect(container.querySelector(`[src="${hidden.portrait}"]`)).not.toBeInTheDocument()
    expect(onComplete).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(2550))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onComplete).toHaveBeenCalledOnce()
  })

  it('uncovers the known guests one at a time while preserving hidden identities', () => {
    const player = { id: 'human', name: 'Player', human: true }
    const second = { id: 'finn', name: 'Finn' }
    const cast = [known, hidden, player, second]
    const first = conclaveOpeningBeats(cast, true)
    const revealed = (frame: (typeof first)[number]) => [
      ...conclaveRevealed(cast, frame.visibleCount),
    ]
    expect(
      first
        .filter(({ frame }) => frame !== 'portrait')
        .slice(0, -1)
        .map(revealed)
    ).toEqual([[player.id], [player.id], [player.id], [player.id], [player.id]])
    expect(first.filter(({ frame }) => frame === 'portrait').map(revealed)).toEqual([
      [player.id, known.id],
      [player.id, known.id, second.id],
    ])
    expect(conclaveOpeningBeats(cast, false).map(revealed)).toEqual([
      [player.id, known.id, second.id],
      [player.id, known.id, second.id],
    ])
  })

  it('opens later conclaves with the current guests already unmasked', () => {
    vi.useFakeTimers()
    const { container } = render(
      <CinematicScene
        scene={{
          id: 'later-conclave',
          kind: 'conclave-arrival',
          conclaveOpening: false,
          cast: [known, { id: 'finn', name: 'Finn' }, { id: 'rune', name: 'Rune' }],
        }}
        onComplete={vi.fn()}
      />
    )
    expect(container.querySelector('[data-group="3"]')).toHaveAttribute('data-frame', 'table')
    act(() => vi.advanceTimersByTime(700))
    expect(screen.getByText('Ash · Finn · Rune')).toBeVisible()
  })

  it('keeps the discussion and ballot accessible after skipping the opening film', () => {
    vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (
      this: HTMLDialogElement
    ) {
      this.open = true
    })
    const run = startRun(
      { id: 'human', name: 'Georgi' },
      BETRAYALS_AI_POOL,
      { publicMode: false, realityMode: 'off' },
      { id: 'conclave-ballot', roleSeed: 32, publicSeed: 12 }
    )
    const [, candidate, runoffCandidate] = run.seats
    const line = { speakerId: known.id, speakerName: known.name, argument: 'What about Finn?' }
    const props = {
      cast: [known],
      view: viewFor(run, run.humanId),
      vote: { targetIds: [candidate.id], proposals: [], discussion: [line] },
      step: 0,
      total: 1,
      onSelect: vi.fn(),
      onAdvance: vi.fn(),
      onBack: vi.fn(),
      onSkip: vi.fn(),
      onFinishFilm: vi.fn(),
    }
    const { rerender } = render(<ConclaveDiscussion {...props} opening="first" />)
    const openingSkip = screen.getByRole('button', { name: 'Skip cinematic' })
    expect(openingSkip).toHaveTextContent(/^Skip$/)
    expect(openingSkip.closest('header')).not.toBeNull()
    fireEvent.click(openingSkip)
    expect(props.onFinishFilm).toHaveBeenCalledWith('skipped')

    rerender(<ConclaveDiscussion {...props} line={line} />)
    expect(screen.getByText(line.argument)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Skip to ballot' }))
    expect(props.onSkip).toHaveBeenCalledOnce()

    rerender(<ConclaveDiscussion {...props} step={1} />)
    const back = screen.getByRole('button', { name: 'Back' })
    expect(back).toHaveClass('game-back-button')
    expect(back.closest('header')).not.toBeNull()
    fireEvent.click(back)
    expect(props.onBack).toHaveBeenCalledOnce()
    const lock = screen.getByRole('button', { name: 'Lock Night choice' })
    expect(lock).toBeDisabled()
    expect(within(lock.closest('footer')!).getAllByRole('button')).toEqual([lock])
    expect(screen.queryByRole('button', { name: 'Scroll portraits right' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Choose another guest' })).not.toBeInTheDocument()
    const painting = screen.getByRole('button', { name: candidate.name })
    expect(within(painting).getByText(candidate.name)).toHaveClass(
      'betrayals-ceremony-action--secondary'
    )
    expect(painting).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(painting)
    expect(props.onSelect).toHaveBeenLastCalledWith(candidate.id)
    rerender(<ConclaveDiscussion {...props} selectedId={candidate.id} step={1} />)
    expect(painting).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(painting)
    expect(props.onSelect).toHaveBeenLastCalledWith('')
    fireEvent.click(screen.getByRole('button', { name: 'Lock Night choice' }))
    expect(props.onAdvance).toHaveBeenCalledOnce()

    const runoff = { ...props.vote, targetIds: [runoffCandidate.id], runoff: runoffCandidate.name }
    rerender(<ConclaveDiscussion {...props} vote={runoff} selectedId={candidate.id} step={1} />)
    expect(screen.queryByRole('button', { name: candidate.name })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lock runoff vote' })).toBeDisabled()
    rerender(
      <ConclaveDiscussion {...props} vote={runoff} selectedId={runoffCandidate.id} step={1} />
    )
    expect(screen.getByRole('button', { name: runoffCandidate.name, pressed: true })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Lock runoff vote' })).toBeEnabled()

    rerender(<ConclaveDiscussion {...props} verdict="Finn was chosen." />)
    expect(screen.getByText('Finn was chosen.')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(props.onFinishFilm).toHaveBeenLastCalledWith('played')
  })

  it('queues every night’s conclave for active Betrayers and omits secret and banished identities', () => {
    const run = startRun(
      { id: 'human', name: 'Georgi' },
      BETRAYALS_AI_POOL,
      { publicMode: false, realityMode: 'off' },
      { id: 'conclave-replay', roleSeed: 32, publicSeed: 12 }
    )
    const [, ash, banished, hidden, loyal] = run.seats
    const before = {
      ...run,
      day: 2,
      phase: 'table-reveal' as const,
      private: {
        ...run.private,
        betrayers: [run.humanId, ash.id, hidden.id, banished.id],
        hiddenBetrayerIds: [hidden.id],
      },
    }
    const night = {
      ...before,
      phase: 'night' as const,
      seats: run.seats.map((seat) =>
        seat.id === banished.id ? { ...seat, exit: { cause: 'banished' as const, day: 2 } } : seat
      ),
    }
    expect(presentationAfter(before, night)).toEqual(['departure', 'conclave-arrival'])
    expect(presentationAfter(before, night, false)).toEqual(['departure'])
    expect(
      presentationAfter({ ...before, humanId: loyal.id }, { ...night, humanId: loyal.id })
    ).toEqual(['departure'])
    const scene = cinematicFor(night, 'conclave-arrival', night.humanId, '')
    expect(scene.conclaveOpening).toBe(false)
    expect(scene.cast?.filter(({ concealed }) => !concealed).map(({ id }) => id)).toEqual([
      night.humanId,
      ash.id,
    ])
    expect(scene.cast?.find(({ concealed }) => concealed)).toEqual({
      id: expect.stringMatching(/^hooded-/),
      name: 'Hooded guest',
      concealed: true,
      conclaveSeat: 3,
    })
    expect(cinematicFor(night, 'conclave-arrival', loyal.id, '').cast).toEqual([])
    expect(cinematicFor(night, 'conclave-arrival', banished.id, '').cast).toEqual([])
  })

  it('uses the same anonymous Conclave for a Loyal regardless of the number of Betrayers', () => {
    const run = startRun(
      { id: 'human', name: 'Georgi' },
      BETRAYALS_AI_POOL,
      { publicMode: false, realityMode: 'off' },
      { id: 'anonymous-conclave', roleSeed: 32, publicSeed: 12 }
    )
    const strangers = run.seats.slice(1, 5).map(({ id }) => id)
    const [, , , , , victim] = run.seats
    const night = {
      ...run,
      phase: 'night' as const,
      dayFlow: { day: 1, castleDay: true as const },
      private: { ...run.private, betrayers: strangers.slice(0, 3) },
    }
    const after = {
      ...night,
      phase: 'night-resolved' as const,
      private: { ...night.private, pendingNight: { targetId: victim.id, blocked: false } },
    }
    const larger = { ...after, private: { ...after.private, betrayers: strangers } }
    expect(presentationAfter(night, after)).toEqual(['conclave-shadow', 'death-letter'])
    expect(presentationAfter(night, after, false)).toEqual(['death-letter'])
    expect(cinematicFor(after, 'conclave-shadow', run.humanId, '')).toEqual(
      cinematicFor(larger, 'conclave-shadow', run.humanId, '')
    )
    expect(cinematicFor(after, 'conclave-shadow', run.humanId, '').cast).toBeUndefined()
    expect(cinematicFor(after, 'death-letter', run.humanId, '').subject?.id).toBe(victim.id)
    expect(
      presentationAfter(night, {
        ...after,
        private: { ...after.private, pendingNight: { targetId: victim.id, blocked: true } },
      })
    ).toEqual(['conclave-shadow'])
  })

  it('keeps a concealed shield recipient absent even when the animation is reduced', () => {
    const { container } = render(
      <CinematicScene
        scene={{ id: 'shield', kind: 'shield', subject: hidden, concealed: true }}
        reducedMotion
        onComplete={vi.fn()}
      />
    )
    expect(screen.getByRole('heading', { name: 'Full Immunity' })).toBeInTheDocument()
    expect(screen.queryByText(hidden.name)).not.toBeInTheDocument()
    expect(container.querySelector(`[src="${hidden.portrait}"]`)).not.toBeInTheDocument()
  })

  it('lights the surviving contestant seats and leaves the night victim dark', () => {
    render(
      <CinematicScene
        scene={{
          id: 'wake',
          kind: 'awakening',
          cast: [
            known,
            { id: 'finn', name: 'Finn' },
            { id: 'nova', name: 'Nova', portrait: '/assets/skins/Nova_avatar.webp' },
            { id: 'human', name: 'Player', portrait: '/custom-portrait.webp' },
          ],
          darkSeatId: 'finn',
        }}
        reducedMotion
        onComplete={vi.fn()}
      />
    )
    const roster = within(screen.getByRole('list', { name: 'Morning roll call' }))
    expect(roster.getByText('Ash').closest('li')).toHaveAttribute('data-awake', 'true')
    expect(
      roster.getByText('Ash').closest('li')?.querySelector('.betrayals-sleep-mask img')
    ).toHaveAttribute('src', expect.stringContaining('assets/betrayals/sleep-mask.webp'))
    const mask = (name: string) =>
      roster.getByText(name).closest('li')?.querySelector<HTMLElement>('.betrayals-sleep-mask')
    expect(mask('Ash')?.style.getPropertyValue('--sleep-eye-y')).toBe('0.33')
    expect(mask('Nova')?.style.getPropertyValue('--sleep-eye-y')).toBe('0.365')
    expect(mask('Player')).toHaveAttribute('data-symbolic', 'true')
    expect(roster.getByText('Finn').closest('li')).toHaveAttribute('data-awake', 'false')
    expect(
      roster.getByText('Finn').closest('li')?.querySelector('.betrayals-cine__dark-mark')
    ).toBeInTheDocument()
  })

  it.each(['elimination', 'death-letter'] as const)(
    'shows the murder verdict for %s with reduced motion',
    (kind) => {
      render(
        <CinematicScene
          scene={{ id: kind, kind, subject: known }}
          reducedMotion
          onComplete={vi.fn()}
        />
      )
      expect(screen.getByRole('img', { name: 'Murdered' })).toHaveAttribute(
        'src',
        expect.stringContaining('verdict-murdered.png')
      )
    }
  )

  it('holds the full figure and role before handing off to the shared exit film', () => {
    vi.useFakeTimers()
    const onComplete = vi.fn()
    const playEffect = vi.fn()
    const { container } = render(
      <CinematicScene
        scene={{
          id: 'exit',
          kind: 'departure',
          role: 'Betrayer',
          subject: {
            id: 'human',
            human: true,
            name: 'Georgi',
            portrait: '/assets/player_characters/character%2015/main.webp',
          },
        }}
        onComplete={onComplete}
        playEffect={playEffect}
      />
    )
    expect(container.querySelector('.betrayals-cine__reveal-actor img')).toHaveAttribute(
      'src',
      expect.stringContaining('character-15/ceremony-front.webp')
    )
    expect(screen.getByText(/Now that my game is over/)).toBeVisible()
    expect(screen.queryByText(/I was a/)).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(2100))
    expect(screen.getByText(/I was a Betrayer/)).toBeVisible()
    expect(container.querySelectorAll('.betrayals-cine__curtains img')).toHaveLength(2)
    expect(playEffect).toHaveBeenCalledWith('tv:betrayer_laugh', 0.72)
    act(() => vi.advanceTimersByTime(3099))
    expect(container.querySelector('.betrayals-cine__reveal-actor img')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1))
    const film = screen.getByRole('button', { name: 'Finish shared exit' })
    expect(film).toHaveAttribute('data-cast', 'character-15')
    expect(screen.getByRole('button', { name: 'Skip cinematic' })).toBeVisible()
    fireEvent.click(film)
    expect(screen.getByText('The Big Eye')).toBeInTheDocument()
    expect(container.querySelector('.banishment-ident__envelope')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(3350))
    expect(onComplete).toHaveBeenCalledWith('played')
  })

  it('lights the Loyal reveal with wings and a separate sound cue', () => {
    vi.useFakeTimers()
    const playEffect = vi.fn()
    const { container } = render(
      <CinematicScene
        scene={{ id: 'loyal-exit', kind: 'departure', role: 'Loyal', subject: known }}
        playEffect={playEffect}
        onComplete={vi.fn()}
      />
    )
    expect(container.querySelector('.betrayals-cine__loyal-light')).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(2100))
    expect(container.querySelector('.betrayals-cine__loyal-wings')).toBeInTheDocument()
    expect(container.querySelector('.betrayals-cine__loyal-halo')).toBeInTheDocument()
    expect(playEffect).toHaveBeenCalledWith('tv:loyal_light', 0.72)
    act(() => vi.advanceTimersByTime(3100))
    expect(container.querySelector('.betrayals-cine__loyal-light')).not.toBeInTheDocument()
  })

  it('plays the hotel shots, opens the letter, then stamps the victim’s portrait', () => {
    vi.useFakeTimers()
    const onComplete = vi.fn()
    const seat = document.createElement('button')
    vi.spyOn(seat, 'getBoundingClientRect').mockReturnValue(new DOMRect(16, 400, 67, 77))
    const { container } = render(
      <CinematicScene
        scene={{
          id: 'hotel',
          kind: 'death-letter',
          openingTitle: 'What happened during the night…',
          subject: known,
          nightRoom: { sky: 'storm', silhouette: 'broad' },
        }}
        onComplete={onComplete}
        getRosterSeat={() => seat}
      />
    )
    const backdrop = () => container.querySelector('.betrayals-cine__backdrop')
    expect(backdrop()).toHaveAttribute('src', expect.stringContaining('hotel-night/arrival.webp'))
    expect(screen.getByRole('heading', { name: 'What happened during the night…' })).toBeVisible()
    act(() => vi.advanceTimersByTime(2200))
    expect(backdrop()).toHaveAttribute(
      'src',
      expect.stringContaining('hotel-night/asleep-broad-storm.webp')
    )
    expect(screen.getByRole('heading', { name: 'Asleep inside' })).toBeVisible()
    expect(screen.queryByText(/Ash/)).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(2450))
    expect(backdrop()).toHaveAttribute('src', expect.stringContaining('hotel-night/executor.webp'))
    act(() => vi.advanceTimersByTime(2650))
    expect(backdrop()).toHaveAttribute(
      'src',
      expect.stringContaining('hotel-night/ash-sealed.webp')
    )
    act(() => vi.advanceTimersByTime(3600))
    expect(screen.getByText('Ash has been murdered.')).toBeVisible()
    expect(backdrop()).toHaveAttribute('src', expect.stringContaining('hotel-night/ash-open.webp'))
    act(() => vi.advanceTimersByTime(5000))
    expect(screen.getByRole('img', { name: 'Murdered' })).toBeVisible()
    expect(onComplete).not.toHaveBeenCalled()
    vi.spyOn(
      container.querySelector('.betrayals-cine__verdict')!,
      'getBoundingClientRect'
    ).mockReturnValue(new DOMRect(80, 230, 180, 210))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(container.querySelector('.betrayals-cine__handoff')).toHaveStyle('--exit-to-y: 400px')
    act(() => vi.advanceTimersByTime(1100))
    expect(onComplete).toHaveBeenCalledExactlyOnceWith('played')
  })

  it.each([
    ...BETRAYALS_AI_POOL,
    ...BETRAYALS_PORTRAITS.map(({ id, name }) => ({
      id,
      name,
      portrait: getBetrayalsPortrait(id),
      human: true,
    })),
  ])('shows both illustrated letter shots for $name', (subject) => {
    vi.useFakeTimers()
    const { container } = render(
      <CinematicScene
        scene={{ id: 'hotel-' + subject.id, kind: 'death-letter', subject }}
        onComplete={vi.fn()}
      />
    )
    const backdrop = () => container.querySelector('.betrayals-cine__backdrop')
    for (const duration of [2200, 2450, 2650]) {
      act(() => vi.advanceTimersByTime(duration))
    }
    const sealed = 'assets/betrayals/hotel-night/' + subject.id + '-sealed.webp'
    expect(backdrop()).toHaveAttribute('src', expect.stringContaining(sealed))
    act(() => vi.advanceTimersByTime(3600))
    const reaction = 'assets/betrayals/hotel-night/' + subject.id + '-open.webp'
    expect(backdrop()).toHaveAttribute('src', expect.stringContaining(reaction))
  })

  it('cycles through six night skies and keeps the bedroom anonymous across dawn', () => {
    const season = startRun(
      { id: 'human', name: 'Georgi' },
      BETRAYALS_AI_POOL,
      { publicMode: false, realityMode: 'off' },
      { id: 'hotel-skies', roleSeed: 32, publicSeed: 12 }
    )
    const days = Array.from({ length: 12 }, (_, index) => index + 1)
    const rooms = days.map((day) => {
      const night = { ...season, day, phase: 'night-resolved' as const }
      const dawn = {
        ...night,
        day: day + 1,
        phase: 'dawn' as const,
        lastDawn: { day: day + 1, eliminatedId: season.seats[1].id },
      }
      const sleeping = cinematicFor(night, 'death-letter', null, '')
      const recalled = cinematicFor(dawn, 'death-letter', null, '')
      expect(sleeping.subject?.id).not.toBe(recalled.subject?.id)
      expect(sleeping.openingTitle).toBeUndefined()
      expect(recalled.openingTitle).toBe('What happened during the night…')
      expect(sleeping.nightRoom).toEqual(recalled.nightRoom)
      return sleeping.nightRoom!
    })
    expect(new Set(rooms.map(({ sky }) => sky)).size).toBe(6)
    expect(new Set(rooms.map(({ sky, silhouette }) => sky + ':' + silhouette)).size).toBe(12)
  })

  it('varies the dawn broadcast while keeping a morning’s wording stable', () => {
    const run = startRun(
      { id: 'human', name: 'Georgi' },
      BETRAYALS_AI_POOL,
      { publicMode: false, realityMode: 'off' },
      { id: 'dawn-broadcast', roleSeed: 32, publicSeed: 12 }
    )
    const guest = run.seats[1]
    const mornings = [2, 3, 4, 5].map((day) => ({
      ...run,
      lastDawn: { day, eliminatedId: guest.id },
    }))
    const messages = mornings.map(dawnBroadcast)
    expect(new Set(messages).size).toBe(4)
    expect(messages.every((message) => message.includes(guest.name))).toBe(true)
    expect(dawnBroadcast(mornings[0])).toBe(messages[0])
    expect(dawnBroadcast({ ...run, lastDawn: { day: 2, eliminatedId: null } })).toBe(
      'Everyone returned.'
    )
  })

  it('reports an interrupted hotel film as skipped', () => {
    const onComplete = vi.fn()
    render(
      <CinematicScene
        scene={{ id: 'skip-hotel', kind: 'death-letter', subject: known }}
        onComplete={onComplete}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Skip cinematic' }))
    expect(onComplete).toHaveBeenCalledExactlyOnceWith('skipped')
  })

  it('hands off an intermediate scene once after its final beat', () => {
    vi.useFakeTimers()
    const onComplete = vi.fn()
    render(
      <CinematicScene
        scene={{ id: 'transition', kind: 'interlude' }}
        autoAdvance
        onComplete={onComplete}
      />
    )
    act(() => vi.advanceTimersByTime(1200))
    act(() => vi.advanceTimersByTime(2199))
    expect(onComplete).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onComplete).toHaveBeenCalledOnce()
  })
})

import { useEffect, useRef } from 'react'
import type { castleRoleFor } from './castleRoles'
import {
  CASTLE_ROLE_CATALOG,
  MAYOR_LAST_DAY,
  ROLE_IMPACT_MIN_CAST,
  mayorUsesRemaining,
  clairvoyantUsesRemaining,
  influenceUsesRemaining,
} from './castleRoles'
import './betrayals-castle-role.css'

type RoleCard = NonNullable<ReturnType<typeof castleRoleFor>>
type RoleResultProps = { role: RoleCard; label: (id: string) => string }

const roleGuide: Partial<Record<RoleCard['roleId'], string>> = {
  doctor:
    'During Night, select an exposed guest and press Protect. A ward lasts for that night and works separately from Night Shields. Save your single self-ward for a night you expect to be targeted.',
  extrasense:
    'During Night, select a guest and press Check. The answer tells you whether they hold a Castle Role. Their allegiance and the name of their role stay hidden.',
  mayor:
    'At the Round Table, select a guest and press Double vote to cast both votes for them. Press Skip to open the regular ballot. Save your two uses for close votes. Runoffs count normally.',
  'good-witch':
    'At Night, arm the spell on the TV and press Cast spell. Use it when you think a vulnerable ally is at risk. On a recruitment night, your charge is kept.',
  illusionist:
    'At Night, ready the decoy on the TV and press Redirect. Any other living guest can receive the letter, including you or a Betrayer. Full Immunity, Night Shields, and the Doctor’s ward still apply.',
  cursed:
    'The curse triggers automatically. You start Loyal. A shield, ward, or redirected letter can change whether the curse triggers. After you turn, your new teammates learn you joined them.',
  columbus:
    'During Night, select exactly five other portraits and press Check group. Try grouping a suspect with guests you already trust. A clear result clears all five for the moment of the check.',
  clairvoyant:
    'The first three hidden Shield Trial results reveal the winners to you automatically. Public results use no charge. Players can still give shields away afterward. Keep your power secret.',
  'secret-betrayer':
    'While hidden, you receive an anonymous shortlist at Night. Select a guest and cast the deciding murder vote. When seventeen guests remain, you join the Conclave and meet your teammates.',
  'alpha-betrayer':
    'Ready your double vote on the opening Conclave ballot. You have two uses per season, and runoff votes are single.',
  'bad-witch':
    'Look for Cast sleep spell when the Round Table opens. One use per season. The castle continues to Night with everyone still inside.',
  politician:
    'After the Round Table discussion, choose a voter, then their target. You can bind two opening ballots per season, on separate days. Runoff votes are theirs.',
  'dark-angel':
    'The first time the bound Betrayer tries to vote for you, they must choose someone else for that Conclave. Another Betrayer can still target you.',
  'change-of-heart':
    'At dawn with thirteen or fewer guests, you can accept the offer through Play. You immediately become a Betrayer and learn your teammates.',
  medium:
    'At dawn, select one previously murdered guest and press Revive. They rejoin the cast with their existing allegiance.',
  'last-will':
    'If you leave before the late-game cutoff, select one living guest and press Reveal. The castle learns their allegiance and any current Castle Role.',
  kamikaze:
    'If you leave before the late-game cutoff, select one living guest and press Play. Full Immunity, Night Shields, and the Doctor’s ward still protect them.',
  introvert:
    'On even-numbered days, you can answer incoming messages and vote as usual. Social reopens the next day.',
  fatigued:
    'You must sit out one trial each day. Play for Immunity and skip the Shield Trial, or select Save energy for shields to skip Immunity.',
  diva: 'During Social, pick one guest each day for a private, truthful answer about their shield or most recent vote. They keep their allegiance secret.',
}

export function CastleRoleResult({ role, label }: RoleResultProps) {
  const used = role.used
  if (used?.roleId === 'doctor')
    return (
      <p>
        Night {used.day}. You warded {label(used.targetId)}.
      </p>
    )
  if (used?.roleId === 'extrasense')
    return (
      <p>
        Night {used.day}. {label(used.targetId)}{' '}
        {used.hasRole ? 'held a Castle Role' : 'held no Castle Role'}.
      </p>
    )
  if (used?.roleId === 'good-witch') return <p>Night {used.day}. You stopped the Conclave.</p>
  if (used?.roleId === 'illusionist') return <p>Night {used.day}. You redirected the letter.</p>
  if (used?.roleId === 'cursed') return <p>After Night {used.day}, you joined the Betrayers.</p>
  if (used?.roleId === 'columbus')
    return (
      <p>
        Night {used.day}.{' '}
        {used.hasBetrayer
          ? 'At least one Betrayer was in your group.'
          : 'There were no Betrayers in your group.'}{' '}
        {used.guestIds.map(label).join(', ')}.
      </p>
    )
  if (used?.roleId === 'diva')
    return (
      <p>
        {label(used.targetId)}:{' '}
        {used.fact === 'shield'
          ? '“I have a Night Shield.”'
          : used.fact === 'ballot' && used.subjectId
            ? `“I last voted for ${label(used.subjectId)}.”`
            : '“I have no shield or ballot to tell you about.”'}
      </p>
    )
  if (used?.roleId === 'change-of-heart') return <p>Day {used.day}. You joined the Betrayers.</p>
  if (used?.roleId === 'medium')
    return (
      <p>
        {label(used.targetId)} returned.{' '}
        {used.rememberedVote
          ? `In the séance, they recalled voting for ${label(used.rememberedVote)}.`
          : 'They shared no remembered ballot in the séance.'}
      </p>
    )
  if (used?.roleId === 'dark-angel')
    return <p>Night {used.day}. The bond deflected a nomination.</p>
  return null
}

export function CastleRoleCard({
  role,
  eligible,
  label,
  day,
  expanded = false,
}: RoleResultProps & { eligible: boolean; day: number; expanded?: boolean }) {
  const { title, description } = CASTLE_ROLE_CATALOG[role.roleId]
  const isMayor = role.roleId === 'mayor'
  const renews =
    role.roleId === 'doctor' ||
    role.roleId === 'extrasense' ||
    role.roleId === 'diva' ||
    role.roleId === 'fatigued'
  const lastsToFinalFive =
    role.roleId === 'extrasense' ||
    role.roleId === 'columbus' ||
    role.roleId === 'clairvoyant' ||
    role.roleId === 'diva' ||
    role.roleId === 'introvert' ||
    role.roleId === 'fatigued'
  const remaining = isMayor
    ? mayorUsesRemaining(role)
    : role.roleId === 'clairvoyant'
      ? clairvoyantUsesRemaining(role)
      : role.roleId === 'alpha-betrayer' || role.roleId === 'politician'
        ? influenceUsesRemaining(role)
        : undefined
  let state = 'Expired'
  if (role.status === 'retired') state = 'Retired'
  else if (remaining === 0 || (role.status === 'used' && remaining === undefined && !renews))
    state = 'Spent'
  else if (remaining !== undefined && (eligible || role.used?.day === day))
    state = `${remaining} ${remaining === 1 ? 'use' : 'uses'} left`
  else if (role.used?.day === day)
    state = role.roleId === 'diva' || role.roleId === 'fatigued' ? 'Used today' : 'Used tonight'
  else if (eligible) {
    if (role.passedDay === day) state = isMayor ? 'Skipped today' : 'Skipped tonight'
    else state = 'Ready'
  }
  return (
    <div className="betrayals-castle-role">
      <strong>
        {title} · {state}
      </strong>
      <p>{description}</p>
      {expanded && roleGuide[role.roleId] && <p>{roleGuide[role.roleId]}</p>}
      {expanded && roleGuide[role.roleId] && (
        <p>
          {lastsToFinalFive
            ? 'Available until the Final Five.'
            : `Available while at least ${ROLE_IMPACT_MIN_CAST} guests remain${isMayor ? `, through Day ${MAYOR_LAST_DAY}` : ''}.`}
        </p>
      )}
      <CastleRoleResult role={role} label={label} />
    </div>
  )
}

export function CastleRoleDialog({
  onClose,
  ...card
}: Parameters<typeof CastleRoleCard>[0] & { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const node = dialog.current
    if (!node) return
    if (typeof node.showModal === 'function') {
      node.showModal()
      return () => node.close()
    }
    node.setAttribute('open', '')
  }, [])

  return (
    <dialog
      ref={dialog}
      className="betrayals-utility-dialog"
      aria-label="Your Castle Role"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="betrayals-utility-dialog__inner">
        <header className="betrayals-utility-dialog__header">
          <h2>Your Castle Role</h2>
          <button
            type="button"
            className="betrayals-utility-dialog__close"
            aria-label="Close Castle Role"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <CastleRoleCard {...card} expanded />
      </div>
    </dialog>
  )
}

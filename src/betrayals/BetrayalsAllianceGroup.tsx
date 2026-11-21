import { useState } from 'react'
import type { Player } from '../types'
import type { CastleAlliance, SocialEntry } from './run'

export type AllianceGroupChange = NonNullable<SocialEntry['allianceChange']>

const labels: Record<AllianceGroupChange, string> = {
  invite: 'Invite a guest',
  rename: 'Rename alliance',
  remove: 'Remove a member',
  leave: 'Leave alliance',
  dissolve: 'Dissolve alliance',
}

export function BetrayalsAllianceGroup({
  group,
  actorId,
  contacts,
  onChange,
}: {
  group: CastleAlliance
  actorId: string
  contacts: readonly Player[]
  onChange?: (id: string, change: AllianceGroupChange, value?: string) => void
}) {
  const [action, setAction] = useState<AllianceGroupChange>('invite')
  const [value, setValue] = useState('')
  const members = contacts.filter(({ id }) => group.memberIds.includes(id))
  const leader = group.leaderId === actorId
  const options: AllianceGroupChange[] = leader
    ? ['invite', 'rename', 'remove', 'leave', 'dissolve']
    : ['invite', 'leave']
  const change = options.includes(action) ? action : 'invite'
  const candidates =
    change === 'invite' ? contacts.filter(({ id }) => !group.memberIds.includes(id)) : members
  const requiresGuest = change === 'invite' || change === 'remove'
  const canExecute = requiresGuest
    ? candidates.some(({ id }) => id === value)
    : change === 'rename'
      ? Boolean(value.trim() && value.trim() !== group.name)
      : true
  return (
    <details className="sp2-consult-alliance-picker">
      <summary>
        {group.name} · {members.length + 1} active
      </summary>
      <p>{['You', ...members.map(({ name }) => name)].join(', ')}</p>
      {onChange && (
        <div className="betrayals-alliance-controls">
          <label>
            Manage alliance{' '}
            <select
              value={change}
              onChange={(event) => {
                setAction(event.target.value as AllianceGroupChange)
                setValue('')
              }}
            >
              {options.map((option) => (
                <option key={option} value={option}>
                  {labels[option]}
                </option>
              ))}
            </select>
          </label>
          {requiresGuest && (
            <label>
              Guest{' '}
              <select value={value} onChange={(event) => setValue(event.target.value)}>
                <option value="">Choose a guest</option>
                {candidates.map(({ id, name }) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {change === 'rename' && (
            <label>
              Alliance name{' '}
              <input
                value={value}
                maxLength={32}
                onChange={(event) => setValue(event.target.value)}
              />
            </label>
          )}
          <button
            className="sp2-execute"
            type="button"
            disabled={!canExecute}
            onClick={() => {
              onChange(group.id, change, value)
              setValue('')
            }}
          >
            {labels[change]}
          </button>
        </div>
      )}
    </details>
  )
}

import { Outlet, useNavigate } from 'react-router'
import { useAppSelector } from '../store/hooks'
import { selectCurrentProfile } from '../store/profilesSlice'
import BetrayalsScreen from './BetrayalsScreen'
import { getBetrayalsPortrait, isBetrayalsLook } from './betrayalsAppearance'
import './betrayalsProfile.css'

export function BetrayalsProfileShell() {
  return (
    <div className="betrayals-profile-shell">
      <Outlet />
    </div>
  )
}

export default function BetrayalsRoute() {
  const navigate = useNavigate()
  const profile = useAppSelector(selectCurrentProfile)
  const selection = profile?.appearanceSelection
  const portrait =
    selection?.kind === 'catalog' && isBetrayalsLook(selection.lookId)
      ? getBetrayalsPortrait(selection.lookId)
      : undefined

  return (
    <BetrayalsScreen
      key={profile?.id ?? 'no-profile'}
      profiles={{
        player: profile ? { id: profile.id, name: profile.name, portrait } : undefined,
        openProfile: () =>
          navigate(profile ? '/profile' : '/profile-picker', { state: { from: '/' } }),
        openDressingRoom: () =>
          navigate('/profile/dressing-room', { state: { from: '/', createProfile: !profile } }),
        openAccount: () => navigate('/profile/account', { state: { entryFrom: '/' } }),
        openAdvertisingPrivacy: () =>
          navigate('/player-privacy', { state: { fromSettings: true } }),
      }}
    />
  )
}

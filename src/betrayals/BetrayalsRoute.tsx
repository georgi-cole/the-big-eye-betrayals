import { useRef } from 'react'
import { Outlet, useNavigate } from 'react-router'
import { useRouteScrollReset } from '../components/layout/useRouteScrollReset'
import { useAppSelector } from '../store/hooks'
import { selectCurrentProfile } from '../store/profilesSlice'
import { store } from '../store/store'
import { createBetrayalsWallet } from './profileWallet'
import BetrayalsScreen from './BetrayalsScreen'
import { getBetrayalsPortrait, isBetrayalsLook } from './betrayalsAppearance'
import './betrayalsProfile.css'

export function BetrayalsProfileShell() {
  const scrollContainer = useRef<HTMLDivElement>(null)
  useRouteScrollReset(scrollContainer)

  return (
    <div ref={scrollContainer} className="betrayals-profile-shell">
      <Outlet />
    </div>
  )
}

export default function BetrayalsRoute() {
  const navigate = useNavigate()
  useRouteScrollReset()
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
        wallet: profile
          ? createBetrayalsWallet(store, profile.id, profile.eyeoleans ?? 0)
          : undefined,
        openProfile: () =>
          navigate(profile ? '/profile' : '/profile-picker', { state: { from: '/' } }),
        openWalletProfile: () =>
          navigate(profile ? '/profile' : '/profile-picker', { state: { from: '/wallet' } }),
        openDressingRoom: (initialLookId) =>
          navigate('/profile/dressing-room', {
            state: { from: '/', createProfile: !profile, initialLookId },
          }),
        openAccount: () => navigate('/profile/account', { state: { entryFrom: '/' } }),
        openAdvertisingPrivacy: () =>
          navigate('/player-privacy', { state: { fromSettings: true } }),
      }}
    />
  )
}

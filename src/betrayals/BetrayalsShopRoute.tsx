import { Navigate, useLocation, useNavigate, useParams } from 'react-router'
import GameBackButton from '../components/ui/GameBackButton/GameBackButton'
import { useAppSelector } from '../store/hooks'
import { selectCurrentProfile } from '../store/profilesSlice'
import BetrayalsStore, { type BetrayalsStoreSection } from './BetrayalsStore'
import './betrayals-premium.css'

export default function BetrayalsShopRoute() {
  const navigate = useNavigate()
  const location = useLocation()
  const { section: requestedSection } = useParams<{ section?: string }>()
  const profile = useAppSelector(selectCurrentProfile)
  const returnState = location.state as {
    returnTo?: unknown
    returnState?: Record<string, unknown>
  } | null
  const returnToChangingRoom = returnState?.returnTo === '/profile/dressing-room'
  const section: BetrayalsStoreSection =
    location.pathname === '/wallet'
      ? 'wallet'
      : requestedSection === 'vip' ||
          requestedSection === 'features' ||
          requestedSection === 'items'
        ? requestedSection
        : 'home'

  if (requestedSection === 'wallet') return <Navigate to="/wallet" replace />
  if (requestedSection && !['home', 'vip', 'features', 'items'].includes(requestedSection))
    return <Navigate to="/store" replace />

  function changeSection(next: BetrayalsStoreSection) {
    const destination =
      next === 'home' ? '/store' : next === 'wallet' ? '/wallet' : `/store/${next}`
    if (location.pathname !== destination)
      navigate(destination, { replace: true, state: location.state })
  }

  function leaveStore() {
    if (returnToChangingRoom)
      navigate('/profile/dressing-room', { state: returnState?.returnState })
    else navigate('/')
  }

  return (
    <main className="betrayals-shop-page">
      <header>
        <GameBackButton
          className="betrayals-shop-page__back"
          label={returnToChangingRoom ? 'Back to changing room' : 'Back to game'}
          onClick={leaveStore}
        />
        <h1>{section === 'wallet' ? 'Wallet' : 'Betrayals Store'}</h1>
      </header>
      <BetrayalsStore
        key={profile?.id ?? 'no-profile'}
        profileId={profile?.id}
        profileName={profile?.name}
        balance={profile?.eyeoleans ?? 0}
        transactions={profile?.eyeoleanTransactions}
        section={section}
        onSectionChange={changeSection}
        onOpenProfile={() =>
          navigate(profile ? '/profile' : '/profile-picker', {
            state: { from: location.pathname },
          })
        }
        onOpenLooks={() =>
          navigate('/profile/dressing-room', {
            state: { from: location.pathname, createProfile: !profile },
          })
        }
        onOpenLegal={() => navigate('/player-privacy')}
      />
    </main>
  )
}

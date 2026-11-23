import { useNavigate } from 'react-router'
import { useAppSelector } from '../store/hooks'
import { selectCurrentProfile } from '../store/profilesSlice'
import BetrayalsStore from './BetrayalsStore'
import './betrayals-premium.css'

export default function BetrayalsShopRoute() {
  const navigate = useNavigate()
  const profile = useAppSelector(selectCurrentProfile)
  return (
    <main className="betrayals-shop-page">
      <header>
        <button type="button" onClick={() => navigate(-1)}>
          Back
        </button>
        <h1>Betrayals Store</h1>
      </header>
      <BetrayalsStore
        profileId={profile?.id}
        balance={profile?.eyeoleans ?? 0}
        onOpenLooks={() =>
          navigate('/profile/dressing-room', { state: { from: '/store', createProfile: !profile } })
        }
        onOpenLegal={() => navigate('/player-privacy')}
      />
    </main>
  )
}

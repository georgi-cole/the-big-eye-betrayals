import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import AppearanceCarousel from '../../appearance/AppearanceCarousel'
import { warmAppearanceRole, warmSelectedAppearance } from '../../appearance/preloadAppearance'
import { getAppearanceAsset, SELECTABLE_LOOKS } from '../../appearance/catalog'
import { hasAppearanceLookAccess, isFreeAppearanceLook } from '../../appearance/lookAccess'
import { LookAccessBadges, LookMarket, type LookMarketOption } from '../../appearance/LookMarket'
import { purchaseLookFromMarket } from '../../appearance/purchaseLookFromMarket'
import { canFillInitialSeasonAppearance } from '../../appearance/initialSeasonAppearance'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { MAX_PROFILES, selectCurrentProfile, updateProfile } from '../../store/profilesSlice'
import { selectIsVipActive } from '../../store/vipSlice'
import GameBackButton from '../../components/ui/GameBackButton/GameBackButton'
import { joinPublicAssetPath } from '../../utils/avatar'
import { ANTIQUE_PORTRAIT_FRAME_URL } from '../../appearance/portraitFraming'
import LookLockInReveal, { type LockInLook } from './LookLockInReveal'
import { preloadImage } from '../../utils/preload'
import {
  BETRAYALS_LOOKS,
  betrayalsWardrobe,
  IS_BETRAYALS_EDITION,
} from '../../betrayals/betrayalsAppearance'
import './DressingRoom.css'
import { useBetrayalsCommerce } from '../../betrayals/commerce/useBetrayalsCommerce'
import { betrayalsProfileReturnPath } from '../../betrayals/betrayalsNavigation'

const looks = IS_BETRAYALS_EDITION ? BETRAYALS_LOOKS : SELECTABLE_LOOKS
const figureRole = IS_BETRAYALS_EDITION ? 'formal' : 'casual'

export default function DressingRoom() {
  const navigate = useNavigate()
  const location = useLocation()
  const routeState = location.state as {
    from?: string
    createProfile?: boolean
    initialLookId?: string
    adoptGuestRun?: boolean
    fromPlayerAccount?: boolean
    playerAccountId?: string
  } | null
  const creatingProfile = routeState?.createProfile === true
  const dispatch = useAppDispatch()
  const profile = useAppSelector(selectCurrentProfile)
  const originalVip = useAppSelector(selectIsVipActive)
  const commerce = useBetrayalsCommerce(IS_BETRAYALS_EDITION)
  const isVip = IS_BETRAYALS_EDITION ? commerce.paidLooks : originalVip
  const atProfileLimit = useAppSelector((state) => state.profiles.profiles.length >= MAX_PROFILES)
  const canFillCurrentLook = useAppSelector(
    (state) =>
      !IS_BETRAYALS_EDITION && Boolean(state.game && canFillInitialSeasonAppearance(state.game))
  )
  const profileIdAtOpen = useRef(creatingProfile ? undefined : profile?.id)
  const figureRef = useRef<HTMLImageElement>(null)
  const [lockIn, setLockIn] = useState<LockInLook | null>(null)
  const [marketOption, setMarketOption] = useState<LookMarketOption | null>(null)
  const savedLookId =
    !creatingProfile && profile?.appearanceSelection?.kind === 'catalog'
      ? profile.appearanceSelection.lookId
      : undefined
  const [selectedId, setSelectedId] = useState(
    looks.some((look) => look.id === routeState?.initialLookId)
      ? routeState!.initialLookId!
      : (looks.find(({ id }) => id === savedLookId)?.id ?? looks[0]?.id ?? '')
  )
  const returnTo = IS_BETRAYALS_EDITION
    ? betrayalsProfileReturnPath(routeState?.from)
    : routeState?.from === '/'
      ? '/'
      : '/game'
  const returningToShop = IS_BETRAYALS_EDITION && returnTo !== '/'
  const creationBack = routeState?.fromPlayerAccount
    ? '/profile/account'
    : returningToShop
      ? returnTo
      : '/'
  const backPath = creatingProfile ? creationBack : returningToShop ? returnTo : '/profile'
  const backLabel =
    creatingProfile && routeState?.fromPlayerAccount
      ? 'Back to account'
      : returningToShop
        ? returnTo === '/wallet'
          ? 'Back to wallet'
          : 'Back to store'
        : creatingProfile
          ? 'Back to home'
          : 'Back to profile'
  const currentLook = looks.find((look) => look.id === selectedId)
  const isAvailable = hasAppearanceLookAccess(selectedId, creatingProfile ? null : profile, isVip)
  const balance = creatingProfile ? 0 : (profile?.eyeoleans ?? 0)

  useEffect(() => {
    if (creatingProfile && atProfileLimit)
      navigate('/profile-picker', {
        replace: true,
        state: routeState?.fromPlayerAccount
          ? { from: '/profile/account', manageOnly: true }
          : { from: returnTo },
      })
  }, [creatingProfile, atProfileLimit, navigate, routeState?.fromPlayerAccount, returnTo])

  useEffect(() => {
    void preloadImage(ANTIQUE_PORTRAIT_FRAME_URL)
  }, [])

  useEffect(() => {
    if (!creatingProfile && (!profile || profile.id !== profileIdAtOpen.current)) {
      navigate('/profile-picker', { replace: true, state: { from: returnTo } })
    }
  }, [creatingProfile, navigate, profile, returnTo])

  useEffect(() => {
    const look = looks.find((candidate) => candidate.id === selectedId)
    if (look) {
      void warmAppearanceRole({ kind: 'catalog', lookId: look.id, revision: look.revision }, 'main')
    }
  }, [selectedId])

  if ((!creatingProfile && !profile) || (creatingProfile && atProfileLimit)) return null

  function confirmSelection() {
    if ((!creatingProfile && (!profile || profile.id !== profileIdAtOpen.current)) || lockIn) return
    const look = looks.find((candidate) => candidate.id === selectedId)
    if (!look) return
    if (!isAvailable) {
      setMarketOption('eyeros')
      return
    }
    const selection = { kind: 'catalog' as const, lookId: look.id, revision: look.revision }
    const firstAppearance = profile?.initialAppearanceSelection ?? profile?.appearanceSelection
    const appliesToCurrentSeason =
      canFillCurrentLook &&
      (firstAppearance?.kind !== 'catalog' || firstAppearance.lookId === selection.lookId)
    const casualAsset = getAppearanceAsset(selection, figureRole)
    const portraitAsset = getAppearanceAsset(selection, 'main')
    const figure = figureRef.current
    const bounds = figure?.getBoundingClientRect()
    // Anchor the reveal to painted pixels, excluding image letterboxing.
    let source = bounds
    if (figure && bounds && figure.naturalWidth > 0 && figure.naturalHeight > 0) {
      const fit = Math.min(bounds.width / figure.naturalWidth, bounds.height / figure.naturalHeight)
      const width = figure.naturalWidth * fit
      const height = figure.naturalHeight * fit
      source = new DOMRect(
        bounds.left + (bounds.width - width) / 2,
        bounds.bottom - height,
        width,
        height
      )
    }
    // Persistence remains independent of the reveal and image/network readiness.
    if (!creatingProfile) dispatch(updateProfile({ appearanceSelection: selection }))
    void warmSelectedAppearance(selection)
    if (!casualAsset || !portraitAsset) {
      finishLockIn()
      return
    }
    setLockIn({
      lookId: look.id,
      label: look.label,
      displayName: creatingProfile ? look.label : (profile?.name ?? look.label),
      casualUrl: joinPublicAssetPath(casualAsset),
      portraitUrl: joinPublicAssetPath(portraitAsset),
      headTopPercent: look.headTopPercent,
      source: source
        ? { left: source.left, top: source.top, width: source.width, height: source.height }
        : null,
      ...(creatingProfile
        ? { readyEyebrow: 'Look chosen', completionCopy: 'Now make it yours.' }
        : appliesToCurrentSeason
          ? { completionCopy: 'Your first character is ready for this season.' }
          : {}),
    })
  }

  function openVipStore() {
    setMarketOption(null)
    // Save the browsing position and creation draft in the history entry. The
    // Store's normal Back action returns here without losing the chosen look.
    navigate('/profile/dressing-room', {
      replace: true,
      state: { ...routeState, initialLookId: selectedId },
    })
    if (IS_BETRAYALS_EDITION) {
      navigate('/store/vip', {
        state: {
          returnTo: '/profile/dressing-room',
          returnState: { ...routeState, initialLookId: selectedId },
        },
      })
    } else navigate('/store', { state: { shelf: 'all-access' } })
  }

  function finishLockIn() {
    if (creatingProfile) {
      navigate('/profile-edit', {
        replace: true,
        state: {
          from: IS_BETRAYALS_EDITION ? returnTo : '/',
          createProfile: true,
          appearanceSelection: { kind: 'catalog', lookId: selectedId, revision: 1 },
          adoptGuestRun: routeState?.adoptGuestRun === true,
          ...(routeState?.fromPlayerAccount && { fromPlayerAccount: true }),
          ...(routeState?.playerAccountId && { playerAccountId: routeState.playerAccountId }),
        },
      })
      return
    }
    navigate('/profile', {
      replace: true,
      state: { from: returnTo, fromLookReveal: Boolean(lockIn) },
    })
  }

  return (
    <>
      <main
        className={
          IS_BETRAYALS_EDITION
            ? 'dressing-room dressing-room--betrayals placeholder-screen'
            : 'dressing-room placeholder-screen'
        }
        aria-hidden={lockIn ? true : undefined}
        inert={Boolean(lockIn)}
      >
        <div className="dressing-room__topbar">
          <GameBackButton
            className="dressing-room__back"
            onClick={() =>
              navigate(backPath, {
                state: creatingProfile ? undefined : { from: returnTo },
              })
            }
            label={backLabel}
          />
          <span>
            {IS_BETRAYALS_EDITION && (
              <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
                <path d="M23.5 10a4.5 4.5 0 1 1 4.5 4.5V17L41 25.5H7L20 17v-2.5" />
                <path d="m11 27 2.5 14h21L37 27" />
              </svg>
            )}
            Changing room
          </span>
        </div>
        <h1>Choose your look</h1>
        <p className="dressing-room__subtitle">
          {IS_BETRAYALS_EDITION
            ? 'Choose how you’ll appear at the castle.'
            : 'Your name. Your story. Your style.'}
        </p>
        <AppearanceCarousel
          looks={looks}
          backdrop={IS_BETRAYALS_EDITION ? betrayalsWardrobe : undefined}
          figureRole={figureRole}
          selectedId={selectedId}
          onSelect={(lookId) => {
            setSelectedId(lookId)
            setMarketOption(null)
          }}
          onConfirm={isAvailable ? confirmSelection : undefined}
          confirmLabel={creatingProfile ? 'Choose this look' : 'Use this look'}
          accessContent={
            <LookAccessBadges
              isFree={isFreeAppearanceLook(selectedId)}
              isVip={isVip}
              isOwned={isAvailable}
              onOpen={(option) => {
                if (option === 'vip') openVipStore()
                else setMarketOption('eyeros')
              }}
            />
          }
          figureRef={figureRef}
        />
        {!creatingProfile && (
          <p className="dressing-room__season-note">
            {IS_BETRAYALS_EDITION
              ? 'Your look applies when you start your next season.'
              : 'Your first character replaces the guest silhouette now. Changing an existing character takes effect next season.'}
          </p>
        )}
      </main>
      {marketOption && currentLook && (
        <LookMarket
          key={`${selectedId}:${marketOption}`}
          look={currentLook}
          portraitUrl={joinPublicAssetPath(
            getAppearanceAsset({ kind: 'catalog', lookId: selectedId, revision: 1 }, 'main') ?? ''
          )}
          balance={balance}
          isAvailable={isAvailable}
          canSpend={!creatingProfile && Boolean(profile)}
          onClose={() => setMarketOption(null)}
          onVip={openVipStore}
          onPurchase={() => {
            if (creatingProfile || !profileIdAtOpen.current) return 'unavailable'
            return dispatch(purchaseLookFromMarket(selectedId, profileIdAtOpen.current))
          }}
        />
      )}
      {lockIn && <LookLockInReveal look={lockIn} onComplete={finishLockIn} />}
    </>
  )
}

import { lazy, Suspense, useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { QaAdvance } from './castleQa'
import { IS_BETRAYALS_QA_BUILD } from './qaBuild'
import { useBetrayalsCommerce } from './commerce/useBetrayalsCommerce'
import type { BetrayalsProductKey } from './commerce/catalog'
import type { BetrayalsStoreProps, BetrayalsStoreSection } from './BetrayalsStore'
import { betrayalsStoreSectionForProduct } from './betrayalsNavigation'
import {
  canUseBetrayalsAction,
  canUseBetrayalsTableSway,
  investigationProductFor,
  isPremiumCastleChoice,
} from './premiumAccess'
import {
  betrayalsRewardEvents,
  recordBetrayalsEconomy,
  paidNightShieldOffer,
  preparePaidNightShieldPurchase,
  pendingPaidNightShieldPurchase,
  confirmPaidNightShieldPurchase,
  cancelPendingPaidNightShieldPurchase,
  PAID_NIGHT_SHIELD_PRICE,
} from './economy'
import { getBetrayalsAdBreakAfter } from './adBreakPolicy'
import { useBetrayalsAdBreak } from './useBetrayalsAdBreak'
import { BetrayalsAdBreak } from './BetrayalsAdBreak'
import './betrayals-premium.css'
import {
  flushDurablePersistence,
  getDurableItem,
  setDurableItem,
} from '../store/durablePersistence'
import { currentAudienceApproval } from './audience'
import { finaleMemory, openDayFlow, recordFinalePosition } from './dayFlow'
import { daySocialContext } from './dayFlowView'
import { castleGlance } from './castleLife'
import { CASTLE_CHOICES } from './castleLifeBank'
import { waitingShieldWitnesses } from './investigationRecords'
import { usePresentationReducedMotion } from '../services/presentation/usePresentationReducedMotion'
import PortraitOrientationGuard from '../components/layout/PortraitOrientationGuard'
import useGameMode from '../hooks/useGameMode'
import { preloadImage } from '../utils/preload'
import { BETRAYALS_SOCIAL_RECHARGE_PLACEMENT } from '../services/ads/adsService'
import { getAdAvailabilityMessage } from '../services/ads/adAvailability'
import { useRewardedAd } from '../services/ads/useRewardedAd'
import { BetrayalsBroadcast } from './BetrayalsBroadcast'
import { CastleRoleCard, CastleRoleDialog, CastleRoleResult } from './BetrayalsCastleRole'
import {
  dayCastleRole,
  politicianOrder,
  resolveDayCastleRole,
  resolveDeparturePower,
  resolvePolitician,
  roleTableOpen,
} from './castleRoleEvents'
import {
  CASTLE_ROLE_CATALOG,
  COLUMBUS_GROUP_SIZE,
  castleRoleFor,
  eligibleCastleRole,
  introvertDay,
} from './castleRoles'
import { revealableCastleRole, revealCastleRole } from './roleDisclosure'
import { BetrayalsChallengeStage } from './BetrayalsChallengeStage'
import { BetrayalsConclave, ConclaveDiscussion } from './BetrayalsConclave'
import { BetrayalsDock, type BetrayalsDockProps } from './BetrayalsDock'
import { BetrayalsHome, type CastleRolesPreview } from './BetrayalsHome'
import { BetrayalsLeaveDialog } from './BetrayalsLeaveDialog'
import { BetrayalsRewardActions, type SeasonReward } from './BetrayalsRewardActions'
import { BetrayalsPulse, type PulseLocation } from './BetrayalsPulse'
import { gameLogFor, recordGameActivity } from './gameLog'
import { recordSeasonCheckpoints, rewindOffer, rewindSeason } from './seasonRewards'
import { BetrayalsIncomingInteractions } from './BetrayalsIncomingInteractions'
import { BetrayalsSocialPanel } from './BetrayalsSocialPanel'
import {
  applyCastleAllianceChange,
  applyGeneralSocialMove,
  generalSocialOpen,
} from './generalSocial'
import { BetrayalsUtilityPanel, type BetrayalsProfileControls } from './BetrayalsUtilities'
import { getBetrayalsPortrait, useBetrayalsUtilities } from './betrayalsPreferences'
import type { Run, Phase, RealityPreset, SocialEntry } from './run'
import {
  acknowledgeRole,
  commandToken,
  eligibleBanishmentTargets,
  publicShieldPending,
  startRun,
  viewFor,
} from './run'
import { BETRAYALS_AI_POOL } from './cast'
import { clearMoonSky, nightfallArt, nightfallWindows } from './CastleNightfall'
import {
  challengeContestantIds,
  chooseFatiguedSafety,
  resolveChallenge,
  safetyResultsFor,
} from './challenges'
import { challengeGame, scoreField } from './challengeRotation'
import type { ReactMinigameCompletion } from '../minigames/competitionResult'
import { BriefRosterExit, CinematicScene, type CinematicCompletion } from './CinematicScene'
import { getIncomingInteractions, respondToIncomingInteraction } from './incoming'
import {
  conclaveGuests,
  describeConclaveVerdict,
  getConclaveView,
  nightCastleRoleFor,
  resolveConclave,
  resolveNightCastleRole,
  revealDawn,
} from './night'
import {
  castleWeather,
  cinematicFor,
  dawnBroadcast,
  nightBroadcast,
  presentationAfter,
} from './presentation'
import { DawnWeather } from './DawnWeather'
import { chooseTarget, resolutionPerspective } from './strategy'
import { advanceDayBeat } from './daySocial'
import { advanceDayAftermath } from './dayAftermath'
import { nightShieldWindowOpen } from './nightShields'
import { answerRecruitment, recruitmentFor } from './recruitment'
import { askWitness, leadForPlayer } from './intel'
import {
  applyInvestigationAction,
  investigationActionReason,
  investigationOpen,
  observationsRemaining,
} from './investigation'
import type { InvestigationAction } from './investigation'
import { profileForGuest, pulseView } from './pulseView'
import { WitnessLeadCard } from './WitnessLeadCard'
import {
  advanceTableRound,
  buildTableBallots,
  mayorChoiceFor,
  recordTableSway,
  resolveMayorChoice,
  resolveTable,
  sleepRoundTable,
  revealTable,
  tableDiscussionOpen,
  tableRoundNumber,
  tableTargets,
} from './table'
import { awardPublicShield } from './publicShield'
import { RoundTableDiscussion } from './RoundTableDiscussion'
import { RoundTableFeed } from './RoundTableFeed'
import { SafetyResults } from './SafetyResults'
import { resolveBetrayalsSoundtrackScene, useBetrayalsSoundtrack } from './betrayalsSoundtrack'
import { intendsToEnd, resolveEndVote } from './settlement'
import { applySocialMove, getSocialView, socialMoveKinds } from './social'
import { canRechargeSocialEnergy, rechargeSocialEnergy, socialWalletFor } from './socialResources'
import { abandonRun, restoreRun, saveRun } from './persistence'
import { Roster } from './Roster'
import {
  FINAL_SURVIVOR_COUNT,
  NIGHT_SHIELD_COUNT,
  phaseGroupLabel,
  phaseLabel,
  phaseSubphaseLabel,
} from './seasonPhases'
import './season.css'

const ChallengeGame = lazy(() => import('./BetrayalsChallengeGame'))
const CastleQaDialog =
  import.meta.env.DEV || import.meta.env.MODE === 'betrayals-qa'
    ? lazy(() =>
        import('./BetrayalsQaDialog').then(({ BetrayalsQaDialog }) => ({
          default: BetrayalsQaDialog,
        }))
      )
    : null
const legacySave = 'edition-local'
const legacyClaim = 'big-eye:betrayals:season:legacy-claimed'
const artBase = import.meta.env.BASE_URL + 'assets/betrayals/'
const castleExterior = artBase + 'castle-exterior.jpg'
const finaleEnding = {
  'last-betrayer': 'The last Betrayer was banished at the Round Table.',
  unanimous: 'Every remaining guest voted to end the season.',
  'final-two': `The season ended automatically when ${FINAL_SURVIVOR_COUNT} guests remained.`,
} as const
const saveStorage = {
  getItem: getDurableItem,
  setItem(key: string, value: string) {
    if (!setDurableItem(key, value)) throw new Error('Betrayals save was unavailable.')
  },
}
const castlePhaseLabels: Partial<Record<Phase, [group: string, title: string]>> = {
  dawn: ['Morning', 'Breakfast'],
  immunity: ['Morning', 'Immunity Challenge'],
  'after-immunity': ['Midday', 'Lunch'],
  social: ['Afternoon', 'Around the Castle'],
  safety: ['Dusk', 'Safety Challenge'],
  'shield-deals': ['Evening', 'Before the Table'],
}

function titleFor(run: Run) {
  return (run.dayFlow?.castleDay && castlePhaseLabels[run.phase]?.[1]) || phaseLabel[run.phase]
}

function begin(
  name: string,
  publicMode: boolean,
  realityMode: RealityPreset,
  portrait?: string,
  dramaMode = false,
  castleRolesPreview: CastleRolesPreview = 'off'
): Run {
  const [roleSeed, publicSeed] = crypto.getRandomValues(new Uint32Array(2))
  const rolePreview =
    (IS_BETRAYALS_QA_BUILD || (import.meta.env.DEV && !dramaMode)) && castleRolesPreview !== 'off'
  const castleRoles =
    castleRolesPreview === 'standard' && rolePreview ? false : dramaMode || rolePreview
  const previewCastleRole =
    rolePreview && castleRolesPreview !== 'standard' && castleRolesPreview !== 'random'
      ? castleRolesPreview
      : undefined
  return openDayFlow(
    startRun(
      { id: 'human', name: name.trim() || 'You', portrait },
      BETRAYALS_AI_POOL,
      { publicMode, realityMode, ...(castleRoles ? { castleRoles: true } : {}) },
      { id: crypto.randomUUID(), roleSeed, publicSeed, previewCastleRole }
    )
  )
}

function restore(saveId: string): Run | null {
  const snapshot = restoreRun(saveStorage, saveId)
  return snapshot.status === 'ready' ? snapshot.run : null
}

type InboxReads = { runId: string; ids: readonly string[] }

function restoreInboxReads(key: string): InboxReads | undefined {
  try {
    const saved = JSON.parse(getDurableItem(key) ?? 'null')
    if (
      typeof saved?.runId === 'string' &&
      Array.isArray(saved.ids) &&
      saved.ids.every((id: unknown) => typeof id === 'string')
    )
      return saved
  } catch {
    // A missing or invalid read receipt should never prevent opening the inbox.
  }
}

export default function BetrayalsScreen({ profiles }: { profiles?: BetrayalsProfileControls }) {
  const player = profiles?.player
  const saveId = player ? 'profile-' + player.id : legacySave
  const [run, setRun] = useState<Run | null>(() => restore(saveId))
  const current = useRef(run)
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<string>()
  const [socialOpen, setSocialOpen] = useState(false)
  const [socialEntry, setSocialEntry] = useState<{
    guestId?: string
    action?: SocialEntry['kind']
  }>()
  const rechargeAd = useRewardedAd()
  const recharging = useRef(false)
  const [rechargeNotice, setRechargeNotice] = useState<string>()
  const [incomingOpen, setIncomingOpen] = useState(false)
  const [pulse, setPulse] = useState<PulseLocation>()
  const [homeOpen, setHomeOpen] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [castleRolesPreview, setCastleRolesPreview] = useState<CastleRolesPreview>('off')
  const [castleRoleOpen, setCastleRoleOpen] = useState(false)
  const [qaOpen, setQaOpen] = useState(false)
  const [armedNightPower, setArmedNightPower] = useState<string>()
  const [directedVoter, setDirectedVoter] = useState<{ key: string; voterId: string }>()
  const [columbusPick, setColumbusPick] = useState<{ key: string; ids: string[] }>()
  const [playing, setPlaying] = useState(false)
  const [countReady, setCountReady] = useState<string>()
  const [voteActionsTarget, setVoteActionsTarget] = useState<HTMLDivElement | null>(null)
  const [closedDiscussion, setClosedDiscussion] = useState<string>()
  const [conclaveProgress, setConclaveProgress] = useState<{ key: string; step: number }>()
  const [seenSealedIntro, setSeenSealedIntro] = useState<string>()
  const [saveIssue, setSaveIssue] = useState(false)
  const [storeFocus, setStoreFocus] = useState<BetrayalsProductKey>()
  const [storeSection, setStoreSection] = useState<BetrayalsStoreSection>('home')
  const [shieldIssue, setShieldIssue] = useState<string>()
  const financialBusy = useRef(false)
  const mounted = useRef(true)
  const adInFlight = useRef<string | undefined>(undefined)
  const commerce = useBetrayalsCommerce()
  const adBreak = useBetrayalsAdBreak({
    runId: run?.id,
    noAds: !commerce.ready || commerce.noAds,
    enabled: !homeOpen,
  })
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const rosterSection = useRef<HTMLElement>(null)
  const inboxReadsKey = 'big-eye:betrayals:inbox:' + saveId
  const [inboxReads, setInboxReads] = useState(() => restoreInboxReads(inboxReadsKey))
  const runId = run?.id
  const markIncomingRead = useCallback(
    (id: string) => {
      if (!runId) return
      setInboxReads((previous) => {
        const ids = previous?.runId === runId ? previous.ids : []
        return ids.includes(id) ? previous : { runId, ids: [...ids, id] }
      })
    },
    [runId]
  )
  useEffect(() => {
    if (inboxReads) setDurableItem(inboxReadsKey, JSON.stringify(inboxReads))
  }, [inboxReads, inboxReadsKey])

  const utilities = useBetrayalsUtilities(homeOpen ? undefined : run?.phase, playing, run?.options)
  const systemReducedMotion = usePresentationReducedMotion()
  const playNightFilm = !utilities.preferences.reducedMotion && !systemReducedMotion
  const prepareNightfall =
    playNightFilm && (run?.phase === 'table-reveal' || run?.phase === 'cocktail')
  useEffect(() => {
    if (!prepareNightfall) return
    void preloadImage(nightfallArt)
    void preloadImage(nightfallWindows)
    void preloadImage(clearMoonSky)
  }, [prepareNightfall])
  const motion = utilities.preferences.reducedMotion ? 'reduced' : undefined
  const portrait = profiles ? player?.portrait : getBetrayalsPortrait(utilities.preferences.lookId)
  const needsLook = Boolean(profiles && !portrait)
  const showHome = !run || homeOpen || needsLook
  useGameMode(!showHome)
  const soundtrackScene = resolveBetrayalsSoundtrackScene(run, homeOpen, run?.presentation?.[0])
  useBetrayalsSoundtrack(soundtrackScene)

  function openIncoming() {
    utilities.playEffect('ui:navigate', 0.45)
    setSocialOpen(false)
    setPulse(undefined)
    setIncomingOpen(true)
  }

  function openSocial(guestId?: string, action?: SocialEntry['kind']) {
    utilities.playEffect('ui:navigate', 0.45)
    setIncomingOpen(false)
    setPulse(undefined)
    setSocialEntry({ guestId, action })
    setSocialOpen(true)
  }

  function openStore(section: BetrayalsStoreSection = 'home', product?: BetrayalsProductKey) {
    setStoreFocus(product)
    setStoreSection(section)
    setSocialOpen(false)
    setIncomingOpen(false)
    setPulse(undefined)
    if (run) setClosedDiscussion(run.id + ':' + run.day)
    utilities.openPanel('store')
  }

  function openUpgrade(product: BetrayalsProductKey) {
    openStore(betrayalsStoreSectionForProduct(product), product)
  }

  async function commit(
    updated: Run,
    claimLegacy = false,
    rewinding = false,
    expected?: Run | null
  ) {
    const before = current.current
    if (!mounted.current || before !== (expected === undefined ? run : expected)) return false
    if (
      !rewinding &&
      before?.phase !== updated.phase &&
      (updated.phase === 'dawn' || updated.phase === 'final-challenge')
    ) {
      updated = openDayFlow(updated)
    }
    const cues = before && !rewinding ? presentationAfter(before, updated, playNightFilm) : []
    const presented = cues.length ? { ...updated, presentation: cues } : updated
    let next = rewinding
      ? presented
      : recordSeasonCheckpoints(
          before,
          recordBetrayalsEconomy(before, recordGameActivity(before, presented))
        )
    const ad = before && !rewinding ? getBetrayalsAdBreakAfter(before, next) : undefined
    if (ad) next = { ...next, pendingAdBreak: ad }
    current.current = next
    let saved = false
    try {
      saveRun(saveStorage, saveId, next)
      if (claimLegacy) saveStorage.setItem(legacyClaim, saveId)
      // A reload must resume a beat as soon as it is visible.
      saved = await flushDurablePersistence()
    } catch {
      // The current visit can continue when device storage is unavailable.
    }
    if (!mounted.current || current.current !== next) return saved
    setRun(next)
    if (before?.id !== next.id) setHomeOpen(false)
    setSaveIssue(!saved)
    const phaseChanged = before?.phase !== next.phase || next.id !== before?.id
    if (
      phaseChanged ||
      before?.runoffIds !== next.runoffIds ||
      before?.private.conclaveVote !== next.private.conclaveVote
    )
      setSelected(undefined)
    if (phaseChanged) {
      setCastleRoleOpen(false)
      if (
        next.phase !== 'settled' &&
        (before?.phase === 'table-reveal' || before?.phase === 'night-resolved')
      ) {
        utilities.playEffect('tv:ceremony_reveal', 0.72)
      } else if (next.phase === 'table-reveal' || next.phase === 'night-resolved') {
        if (!cues.includes('conclave-seal')) utilities.playEffect('tv:ceremony_impact', 0.57)
      }
      setSocialOpen(false)
      setIncomingOpen(false)
    }
    setPlaying(false)
    return saved
  }

  function startSeason(name: string, realityMode: RealityPreset) {
    const active = current.current
    if (
      active !== run ||
      financialBusy.current ||
      (active && pendingPaidNightShieldPurchase(active))
    )
      return
    const saved = active ? undefined : restoreRun(saveStorage, saveId)
    const lastSeasonNumber = active
      ? (active.seasonNumber ?? 1)
      : saved?.status === 'empty'
        ? (saved.lastSeasonNumber ?? 0)
        : 0
    void commit({
      ...begin(
        name,
        utilities.seasonOptions.publicMode,
        realityMode,
        portrait,
        commerce.dramaMode && utilities.seasonOptions.castleRoles === true,
        castleRolesPreview
      ),
      seasonNumber: lastSeasonNumber + 1,
    })
  }

  async function leaveSeason(abandon: boolean, declineRewind = false) {
    const active = current.current
    if (!active || active !== run || financialBusy.current || recharging.current)
      return 'Wait for the current action to finish, then try again.'
    if (abandon && pendingPaidNightShieldPurchase(active))
      return 'Finish the pending Night Shield purchase in the Store first.'

    // Block delayed gameplay commands while the save or abandonment becomes durable.
    current.current = null
    const next = abandon
      ? null
      : declineRewind
        ? { ...active, seasonRewards: { ...active.seasonRewards, rewindDeclined: true } }
        : active
    let abandoned = false
    try {
      if (!next) {
        const rewards = betrayalsRewardEvents(active)
        if (rewards.length && profiles?.wallet && !(await profiles.wallet.claimRewards(rewards)))
          throw new Error('Wallet rewards could not be saved.')
        abandonRun(saveStorage, saveId, active)
        abandoned = true
      } else {
        saveRun(saveStorage, saveId, next)
      }
      if (!(await flushDurablePersistence())) throw new Error('Save was unavailable.')
    } catch {
      current.current = active
      // Replace an abandonment queued behind a failed storage write.
      if (abandoned) {
        try {
          saveRun(saveStorage, saveId, active)
        } catch {
          setSaveIssue(true)
        }
      }
      return abandon
        ? 'The castle could not end this season. Please try again.'
        : 'Your season could not be saved. Please try again.'
    }

    current.current = next
    if (mounted.current) {
      setRun(next)
      setSelected(undefined)
      setSocialOpen(false)
      setIncomingOpen(false)
      setPulse(undefined)
      setLeaveOpen(false)
      setSaveIssue(false)
      setHomeOpen(true)
    }
  }

  async function completeShieldPurchase(active: Run) {
    const pending = pendingPaidNightShieldPurchase(active)
    const wallet = profiles?.wallet
    if (!pending || !wallet || !mounted.current || current.current !== active) return
    // The pending run is the recovery record. Never debit unless it is durable.
    saveRun(saveStorage, saveId, active)
    if (!(await flushDurablePersistence()))
      throw new Error('Could not save this purchase. Please retry.')
    if (!mounted.current || current.current !== active) return
    const paid = await wallet.spend(pending.transactionId, PAID_NIGHT_SHIELD_PRICE, 'Night Shield')
    if (!mounted.current || current.current !== active) return
    if (paid === 'unavailable')
      throw new Error('Your Night Shield purchase is waiting for a saved wallet. Please retry.')
    const next =
      paid === 'paid'
        ? confirmPaidNightShieldPurchase(active, pending.transactionId)
        : cancelPendingPaidNightShieldPurchase(active, pending.transactionId)
    const saved = await commit(next, false, false, active)
    if (!saved)
      throw new Error(
        'Could not save the Night Shield. Your purchase will recover when you return.'
      )
    if (paid === 'insufficient') throw new Error('You need 3,000 Eyeros for a Night Shield.')
    setShieldIssue(undefined)
  }

  async function buyShield() {
    const active = current.current
    if (
      !active ||
      !profiles?.wallet ||
      financialBusy.current ||
      active.presentation?.length ||
      active.pendingAdBreak
    )
      return
    const prepared = preparePaidNightShieldPurchase(
      active,
      commandToken(active),
      profiles.wallet.balance
    )
    if (prepared === active) return
    financialBusy.current = true
    try {
      if (!(await commit(prepared, false, false, active)))
        throw new Error('Could not save this purchase. No Eyeros have been charged.')
      const staged = current.current
      if (staged?.id === active.id) await completeShieldPurchase(staged)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Your purchase could not be completed. Please retry.'
      if (mounted.current) setShieldIssue(message)
      throw error
    } finally {
      financialBusy.current = false
    }
  }

  async function reconcileWallet() {
    const active = current.current
    if (!mounted.current || !active || !profiles?.wallet || financialBusy.current) return
    financialBusy.current = true
    try {
      if (pendingPaidNightShieldPurchase(active)) await completeShieldPurchase(active)
      else if (betrayalsRewardEvents(active).length) {
        saveRun(saveStorage, saveId, active)
        const saved = await flushDurablePersistence()
        if (saved) {
          const credited = await profiles.wallet.claimRewards(betrayalsRewardEvents(active))
          if (mounted.current) setSaveIssue(!credited)
        }
      }
    } catch (error) {
      if (mounted.current) {
        setSaveIssue(true)
        if (pendingPaidNightShieldPurchase(active))
          setShieldIssue(
            error instanceof Error ? error.message : 'Please retry your Night Shield purchase.'
          )
      }
    } finally {
      financialBusy.current = false
      if (mounted.current && current.current !== active) void reconcileWallet()
    }
  }
  const reconcileWalletEffect = useEffectEvent(reconcileWallet)
  useEffect(() => {
    void reconcileWalletEffect()
  }, [run])

  const finishAdBreak = useEffectEvent(async () => {
    const active = current.current
    const event = active?.pendingAdBreak
    if (
      !active ||
      !event ||
      active.presentation?.length ||
      homeOpen ||
      playing ||
      adInFlight.current
    )
      return
    adInFlight.current = event.runId + ':' + event.id
    try {
      const resume = await adBreak.requestBreak(event)
      const latest = current.current
      if (resume && latest?.id === event.runId && latest.pendingAdBreak?.id === event.id) {
        await commit({ ...latest, pendingAdBreak: undefined }, false, false, latest)
      }
    } finally {
      adInFlight.current = undefined
    }
  })
  useEffect(() => {
    void finishAdBreak()
  }, [run, homeOpen, playing])

  const shieldOffer = paidNightShieldOffer(run, profiles?.wallet?.balance ?? 0)
  const market: BetrayalsStoreProps = {
    profileId: player?.id,
    profileName: player?.name,
    balance: profiles?.wallet?.balance ?? 0,
    transactions: profiles?.wallet?.transactions,
    onOpenProfile: profiles
      ? () => {
          utilities.closePanel()
          if (profiles.openWalletProfile) profiles.openWalletProfile()
          else profiles.openProfile()
        }
      : undefined,
    onOpenLooks: profiles
      ? () => {
          utilities.closePanel()
          profiles.openDressingRoom()
        }
      : undefined,
    onOpenLegal: profiles?.openAdvertisingPrivacy,
    shield: profiles?.wallet
      ? shieldOffer
      : { ...shieldOffer, available: false, reason: 'Select a profile to use Eyeros.' },
    onBuyShield: buyShield,
    focusProduct: storeFocus,
    section: storeSection,
    onSectionChange: (section) => {
      setStoreFocus(undefined)
      setStoreSection(section)
    },
  }

  async function claimSeasonReward(reward: SeasonReward) {
    const active = current.current
    if (
      !active ||
      active !== run ||
      active.presentation?.length ||
      active.pendingAdBreak ||
      pendingPaidNightShieldPurchase(active)
    )
      return false

    if (reward === 'roles') {
      if (!active.result || active.phase !== 'settled' || active.seasonRewards?.finaleRevealed) {
        return false
      }
      await commit({
        ...active,
        revision: active.revision + 1,
        seasonRewards: { ...active.seasonRewards, finaleRevealed: true },
      })
      return true
    }

    const offer = rewindOffer(active)
    const restored = rewindSeason(active)
    if (!offer || !restored) return false
    setSelected(undefined)
    setPulse(undefined)
    setClosedDiscussion(undefined)
    setCountReady(undefined)
    setConclaveProgress(undefined)
    setInboxReads((receipts) => {
      if (!receipts || receipts.runId !== active.id) return receipts
      return {
        ...receipts,
        ids: receipts.ids.filter((id) => {
          const [day, phase] = id.split(':')
          return (
            Number(day) < restored.day ||
            (offer.type === 'table' && Number(day) === restored.day && phase === 'social')
          )
        }),
      }
    })
    await commit(restored, false, true)
    return true
  }

  const firstCue = run?.presentation?.[0]
  const omitNightFilm =
    !playNightFilm &&
    (firstCue === 'nightfall' ||
      firstCue === 'castle-wakes' ||
      firstCue === 'conclave-arrival' ||
      firstCue === 'conclave-shadow' ||
      firstCue === 'conclave-seal')
  const dismissNightFilm = useEffectEvent(() => {
    if (!run?.presentation || current.current !== run) return
    const rest = run.presentation.slice(1)
    void commit({ ...run, presentation: rest.length ? rest : undefined })
  })
  useEffect(() => {
    if (omitNightFilm) dismissNightFilm()
  }, [omitNightFilm, firstCue])

  if (showHome) {
    const saved =
      player?.portrait && !run && !getDurableItem(legacyClaim)
        ? restoreRun(saveStorage, saveId)
        : undefined
    const previous =
      saved?.status === 'empty' && !saved.lastSeasonNumber ? restore(legacySave) : null
    const resumeLegacy =
      previous && player && previous.phase !== 'settled'
        ? () =>
            void commit(
              {
                ...previous,
                seats: previous.seats.map((seat) =>
                  seat.id === previous.humanId
                    ? { ...seat, name: player.name, portrait: player.portrait }
                    : seat
                ),
              },
              true
            )
        : undefined

    const exitDay = run?.seats.find(({ id }) => id === run.humanId)?.exit?.day

    return (
      <BetrayalsHome
        utilities={utilities}
        profiles={profiles}
        market={market}
        onOpenStore={() => openStore()}
        onUpgrade={openUpgrade}
        name={name}
        onNameChange={setName}
        castleRolesPreview={
          IS_BETRAYALS_QA_BUILD ||
          (import.meta.env.DEV && !(commerce.dramaMode && utilities.seasonOptions.castleRoles))
            ? { value: castleRolesPreview, onChange: setCastleRolesPreview }
            : undefined
        }
        milestones={
          run
            ? {
                runId: run.id,
                dayReached: exitDay ?? run.day,
                won: !!run.result && Object.hasOwn(run.result.payouts, run.humanId),
                rewards: betrayalsRewardEvents(run),
              }
            : undefined
        }
        seasonState={run ? (run.phase === 'settled' ? 'settled' : 'active') : undefined}
        onPlaySeason={() =>
          startSeason(
            player?.name ?? name,
            commerce.realityMode ? utilities.seasonOptions.realityMode : 'off'
          )
        }
        onReturnToSeason={() => setHomeOpen(false)}
        onResumeLegacy={resumeLegacy}
      />
    )
  }

  const token = commandToken(run)
  const human = run.seats.find(({ id }) => id === run.humanId)
  const participating = Boolean(human && !human.exit)
  const viewerId = participating ? run.humanId : null
  const view = viewFor(run, viewerId)
  const labels = new Map(run.seats.map(({ id, name }) => [id, name]))
  const label = (id: string) => labels.get(id) ?? 'Contestant'
  const stage = run.phase
  const cue = run.presentation?.[0]
  const castleRole = castleRoleFor(run, viewerId ?? run.private.departurePower?.guestId ?? null)
  const roleCard = castleRole && {
    role: castleRole,
    eligible: eligibleCastleRole(run, castleRole.guestId, castleRole.roleId),
    label,
    day: run.day,
  }
  const nightRole = !cue && viewerId ? nightCastleRoleFor(run, viewerId) : undefined
  const doctorChoice = nightRole?.roleId === 'doctor'
  const nightPower = nightRole && !nightRole.targetIds ? nightRole.roleId : undefined
  const nightPowerKey = `${run.id}:${run.day}:${nightPower}`
  const nightPowerArmed = Boolean(nightPower && armedNightPower === nightPowerKey)
  const columbusChoice = nightRole?.roleId === 'columbus'
  const columbusKey = `${run.id}:${run.day}`
  const columbusIds = columbusPick?.key === columbusKey ? columbusPick.ids : []
  const mayorChoice = !cue && viewerId ? mayorChoiceFor(run, viewerId) : false
  const castleDay = run.dayFlow?.castleDay
  const glance = castleGlance(run)
  const stageTitle = titleFor(run)
  const stageGroup = (castleDay && castlePhaseLabels[stage]?.[0]) || phaseGroupLabel[stage]
  const votePhase = stage === 'round-table' || stage === 'final-banishment'
  const audiencePending = publicShieldPending(run)
  const discussion = !audiencePending && tableDiscussionOpen(run)
  const counting = Boolean(run.tableCount)
  const dayPower = !cue && viewerId ? dayCastleRole(run, viewerId) : undefined
  const tablePower =
    !cue &&
    viewerId &&
    !audiencePending &&
    !discussion &&
    roleTableOpen(run) &&
    (eligibleCastleRole(run, viewerId, 'politician')
      ? 'politician'
      : eligibleCastleRole(run, viewerId, 'bad-witch')
        ? 'bad-witch'
        : undefined)
  const sleepyTable = Boolean(
    viewerId &&
    !cue &&
    !audiencePending &&
    roleTableOpen(run) &&
    eligibleCastleRole(run, viewerId, 'bad-witch')
  )
  const departure = run.private.departurePower
  const quietDay = Boolean(viewerId && introvertDay(run, viewerId))
  const roleActionKey = `${run.id}:${run.day}:${stage}:${dayPower?.roleId ?? tablePower}`
  const actionArmed = armedNightPower === roleActionKey
  const voterId = directedVoter?.key === roleActionKey ? directedVoter.voterId : undefined
  const conclave = getConclaveView(run, viewerId, selected)
  const recruitment = recruitmentFor(run, viewerId)
  const recruitmentTargets = recruitment?.kind === 'choose' ? recruitment.targetIds : undefined
  const recruitmentOffer = recruitment?.kind === 'offer' ? recruitment : undefined
  const conclaveChoice = Boolean(conclave || recruitmentTargets)
  const conclaveLines = conclave?.discussion ?? []
  const conclaveKey = `${run.id}:${run.day}`
  const conclaveStep = conclaveProgress?.key === conclaveKey ? conclaveProgress.step : 0
  const conclaveLine = conclaveLines[conclaveStep]
  let subphase = phaseSubphaseLabel[stage]
  if (stage === 'night') {
    if (nightPower === 'good-witch') subphase = 'The Lullaby'
    else if (nightPower === 'illusionist') subphase = 'The False Letter'
    else if (columbusChoice) subphase = 'The Circle'
    else if (nightRole) subphase = doctorChoice ? 'The Ward' : 'Beyond the Veil'
    else if (recruitmentOffer || recruitmentTargets) subphase = 'A Quiet Knock'
    else if (conclave)
      subphase = conclave.sealed
        ? 'The Sealed Ballot'
        : conclaveLine
          ? 'Under the Hoods'
          : conclave.runoff
            ? 'The Last Name'
            : 'Ink & Ash'
  }
  const moveConclave = (step: number) => setConclaveProgress({ key: conclaveKey, step })
  const targets =
    (departure ? run.seats.filter(({ exit }) => !exit).map(({ id }) => id) : undefined) ??
    (actionArmed && dayPower?.targets.length ? dayPower.targets : undefined) ??
    (tablePower === 'politician' && actionArmed
      ? voterId
        ? eligibleBanishmentTargets(run, voterId)
        : run.seats
            .filter(
              ({ id, exit }) =>
                !exit && id !== run.humanId && eligibleBanishmentTargets(run, id).length
            )
            .map(({ id }) => id)
      : undefined) ??
    nightRole?.targetIds ??
    (votePhase && !audiencePending && !discussion && !counting
      ? tableTargets(run, run.humanId)
      : conclaveLine
        ? []
        : (recruitmentTargets ?? conclave?.targetIds ?? []))
  const field = challengeContestantIds(run)
  const canPlay = field.includes(run.humanId)
  const game = challengeGame(run)
  const challengeName = game?.title ?? 'Challenge'
  const activeCast = view.seats.filter(({ exit }) => !exit)
  const countKey = [run.id, run.day, stage, activeCast.length, run.tableCount?.round].join(':')
  const selectedSeat = view.seats.find(({ id }) => id === selected)
  const isTarget = !!selected && targets.includes(selected)
  const investigate = (action: InvestigationAction) => {
    const product = investigationProductFor(action)
    if (!commerce[product]) return openUpgrade(product)
    void apply((active) => applyInvestigationAction(active, token, action))
  }
  const investigation = {
    open: investigationOpen(run),
    remaining: observationsRemaining(run),
    profile: (id: string) => profileForGuest(run, id),
    reason: (action: InvestigationAction) => investigationActionReason(run, action),
    act: investigate,
    openPulse: (guestId?: string) => {
      if (!commerce.myPulse) return openUpgrade('myPulse')
      utilities.playEffect('ui:navigate', 0.45)
      setSocialOpen(false)
      setIncomingOpen(false)
      setPulse({ tab: guestId ? 'Intel' : 'Today', guestId })
    },
  }
  const conversation = participating ? getSocialView(run, run.humanId) : []
  const lead = leadForPlayer(run)
  const recent = conversation
    .filter((entry) => entry.day === run.day && entry.actorId === run.humanId)
    .at(-1)
  const ordinaryMoves = socialMoveKinds(run)
  const moveKinds =
    commerce.dramaMode && revealableCastleRole(run)
      ? [...ordinaryMoves, 'reveal-castle-role' as const]
      : ordinaryMoves
  const canSocialize = participating && !quietDay && moveKinds.length > 0
  const socialResources = socialWalletFor(run, run.humanId)
  const incoming = getIncomingInteractions(run)
  const pendingIncoming = incoming.filter(({ response }) => !response)
  const requiredReply = pendingIncoming.some(({ required }) => required)
  const readIncoming = new Set(inboxReads?.runId === run.id ? inboxReads.ids : [])
  const unreadIncoming = pendingIncoming.filter(({ id }) => !readIncoming.has(id))
  const rewindTarget =
    qaOpen ||
    cue ||
    run.pendingAdBreak ||
    adBreak.active ||
    departure ||
    (stage === 'night-resolved' &&
      run.private.pendingNight?.targetId === run.humanId &&
      !run.private.pendingNight.blocked &&
      castleRole &&
      (castleRole.roleId === 'last-will' || castleRole.roleId === 'kamikaze') &&
      eligibleCastleRole(run, castleRole.guestId, castleRole.roleId))
      ? undefined
      : rewindOffer(run)?.type
  const showRevealReward =
    !cue && stage === 'settled' && !!run.result && !run.seasonRewards?.finaleRevealed
  const showSealedBallot = Boolean(
    conclave?.sealed &&
    !cue &&
    !requiredReply &&
    !run.pendingAdBreak &&
    !adBreak.active &&
    !pendingPaidNightShieldPurchase(run)
  )
  const sealedIntro = showSealedBallot && playNightFilm && seenSealedIntro !== conclaveKey
  const sealedVerdict =
    cue === 'conclave-seal' && run.private.pendingNight?.sealedBallot?.voterId === viewerId
  const openingConclave = sealedIntro
    ? 'sealed'
    : cue === 'conclave-arrival' && conclaveChoice
      ? run.day === 1
        ? 'first'
        : 'return'
      : undefined
  const conclaveVerdict =
    cue === 'conclave-seal' ? describeConclaveVerdict(run, viewerId) : undefined
  const showConclaveDialog =
    !qaOpen &&
    !departure &&
    Boolean(
      showSealedBallot ||
      (recruitmentTargets && !cue) ||
      (playNightFilm &&
        ((conclaveChoice && !conclave?.sealed && (!cue || openingConclave)) || conclaveVerdict))
    )
  const bypassHotel =
    cue === 'death-letter' && !playNightFilm && run.presentation?.includes('awakening')
  const shownCue = bypassHotel ? 'awakening' : cue
  const discussionKey = run.id + ':' + run.day
  const discussionVisible = discussion && !cue && !qaOpen && closedDiscussion !== discussionKey
  const cinematic =
    shownCue &&
    !showConclaveDialog &&
    !omitNightFilm &&
    shownCue !== 'safety-results' &&
    shownCue !== 'sunrise'
      ? cinematicFor(run, shownCue, viewerId, castleExterior)
      : undefined
  const compactExit =
    cinematic &&
    (utilities.preferences.reducedMotion ||
      (!playNightFilm && shownCue === 'death-letter' && castleDay)) &&
    (shownCue === 'departure' || shownCue === 'death-letter' || shownCue === 'elimination')
  const pendingNight = run.private.pendingNight
  const nightEffect = pendingNight?.castleEffect?.kind
  const cursedArrival =
    viewerId &&
    stage === 'dawn' &&
    run.private.castleRoles?.find(
      ({ guestId, used }) =>
        used?.roleId === 'cursed' &&
        used.day === run.day - 1 &&
        (guestId === viewerId || view.teammateIds.includes(guestId))
    )
  const mourning =
    (stage === 'dawn' || stage === 'final-challenge') &&
    run.lastDawn?.day === run.day &&
    !!run.lastDawn.eliminatedId
  const openWeather = shownCue === 'sunrise' || (stage === 'night-resolved' && !cue && !castleDay)
  const announcedNightId =
    stage === 'night-resolved' &&
    pendingNight &&
    !pendingNight.blocked &&
    (pendingNight.filmPlayed || pendingNight.targetId === run.humanId)
      ? (pendingNight.targetId ?? undefined)
      : undefined

  function getRosterSeat(id: string) {
    return (
      Array.from(rosterSection.current?.querySelectorAll<HTMLElement>('[data-seat-id]') ?? []).find(
        (seat) => seat.dataset.seatId === id
      ) ?? null
    )
  }

  function finishCue(completion?: CinematicCompletion) {
    const active = current.current
    if (!active?.presentation || active.presentation !== run?.presentation) return
    const playedHotel = cue === 'death-letter' && !bypassHotel && completion === 'played'
    const showedNightOutcome =
      cue === 'death-letter' &&
      active.phase === 'night-resolved' &&
      (playedHotel || active.dayFlow?.castleDay)
    const queued = active.presentation.slice(1)
    const rest = bypassHotel || playedHotel ? queued.filter((beat) => beat !== 'awakening') : queued
    const night = active.private.pendingNight
    const privateState =
      showedNightOutcome && night
        ? { ...active.private, pendingNight: { ...night, filmPlayed: true } }
        : active.private
    void commit({ ...active, private: privateState, presentation: rest.length ? rest : undefined })
  }

  function apply(transform: (active: Run) => Run) {
    const active = current.current
    if (
      !active ||
      active.presentation?.length ||
      active.pendingAdBreak ||
      pendingPaidNightShieldPurchase(active) ||
      active.id !== token.runId ||
      active.revision !== token.revision
    ) {
      return
    }
    const next = transform(active)
    if (next !== active) return commit(next)
  }

  async function simulateQa(advance: QaAdvance) {
    const active = current.current
    if (
      (import.meta.env.MODE !== 'betrayals-qa' && !import.meta.env.DEV) ||
      !active ||
      active !== run ||
      financialBusy.current ||
      recharging.current
    )
      return 'Wait for the current action to finish, then try again.'
    if (pendingPaidNightShieldPurchase(active))
      return 'Finish the pending Night Shield purchase first.'
    try {
      const { simulateCastleQa } = await import('./castleQa')
      if (current.current !== active || financialBusy.current || recharging.current)
        return 'The season changed. Try again.'
      const next = simulateCastleQa(active, advance, currentAudienceApproval)
      if (!next) return 'Simulation could not advance this position.'
      const saved = await commit(next, false, true, active)
      setArmedNightPower(undefined)
      setDirectedVoter(undefined)
      return saved ? 'Simulation saved.' : 'Simulation finished. The save could not be confirmed.'
    } catch {
      return 'Simulation could not finish.'
    }
  }

  async function watchEnergyRecharge() {
    const offered = current.current
    if (
      recharging.current ||
      !offered ||
      offered !== run ||
      !canSocialize ||
      !canRechargeSocialEnergy(offered) ||
      pendingPaidNightShieldPurchase(offered)
    )
      return

    recharging.current = true
    setRechargeNotice(undefined)
    try {
      const earned = await rechargeAd.request(BETRAYALS_SOCIAL_RECHARGE_PLACEMENT)
      const active = current.current
      if (
        !mounted.current ||
        !active ||
        active.id !== offered.id ||
        active.day !== offered.day ||
        pendingPaidNightShieldPurchase(active)
      )
        return
      if (!earned) {
        setRechargeNotice(getAdAvailabilityMessage() ?? 'The ad did not finish. Please try again.')
        return
      }
      const next = rechargeSocialEnergy(active)
      if (next !== active) await commit(next, false, false, active)
    } catch {
      if (mounted.current) setRechargeNotice('The ad reward could not be completed.')
    } finally {
      recharging.current = false
    }
  }

  function confirmNightRole() {
    void apply((active) => {
      if (nightPowerArmed) return resolveNightCastleRole(active, token, true)
      if (columbusChoice && columbusIds.length)
        return resolveNightCastleRole(active, token, columbusIds)
      const targetId = isTarget ? selected : undefined
      const answered = resolveNightCastleRole(active, token, targetId)
      if (answered === active || (targetId && !doctorChoice)) return answered
      return resolveConclave(answered, commandToken(answered))
    })
    if (nightPowerArmed) setArmedNightPower(undefined)
    if (columbusChoice) setColumbusPick(undefined)
    setSelected(undefined)
  }

  function advanceConclave(doubleVote = false) {
    if (conclaveLine) {
      moveConclave(conclaveStep + 1)
      return
    }
    apply((active) => resolveConclave(active, token, selected, doubleVote))
  }

  function end(continueVoting: boolean) {
    apply((active) => {
      const ballots = active.seats
        .filter(({ exit }) => !exit)
        .map(({ id: voterId }) => {
          const wantsEnd =
            voterId === active.humanId ? !continueVoting : intendsToEnd(active, voterId)
          return { voterId, choice: wantsEnd ? ('end' as const) : ('banish' as const) }
        })
      return resolveEndVote(active, token, ballots)
    })
  }

  function revealPublicShield() {
    apply((active) => {
      const pulse = currentAudienceApproval(active)
      const updated = awardPublicShield(active, token, pulse)
      if (updated === active) return active
      utilities.playEffect('tv:ceremony_reveal', 0.6)
      return { ...updated, audienceApproval: pulse }
    })
  }

  async function finishChallenge(
    score?: number,
    tieBreak?: number,
    completion?: ReactMinigameCompletion
  ) {
    if (!game) return false
    return (
      (await apply((active) =>
        resolveChallenge(
          active,
          token,
          scoreField(
            active,
            game,
            score === undefined ? undefined : { score, tieBreak, completion }
          ),
          game.key,
          game.publicResults
        )
      )) ?? false
    )
  }

  function saveEnergyForSafety() {
    if (!game) return
    apply((active) => {
      const prepared = chooseFatiguedSafety(active)
      if (prepared === active) return active
      return resolveChallenge(
        prepared,
        commandToken(prepared),
        scoreField(prepared, game),
        game.key,
        game.publicResults
      )
    })
  }

  if (playing && canPlay && game) {
    return (
      <>
        <BetrayalsChallengeStage
          key={run.id + ':' + run.revision}
          title={stageTitle}
          game={game}
          premiumGames={commerce.premiumGames}
          motion={motion}
          onForfeit={() => finishChallenge()}
        >
          <Suspense fallback={<p role="status">Loading {challengeName}…</p>}>
            <ChallengeGame
              run={run}
              game={game}
              premiumGames={commerce.premiumGames}
              onFinish={finishChallenge}
            />
          </Suspense>
        </BetrayalsChallengeStage>
        <PortraitOrientationGuard />
      </>
    )
  }

  let message: ReactNode = null
  let detail: ReactNode = null
  let play: NonNullable<BetrayalsDockProps['play']>
  const outcome = run.lastTable
  const tableExit = outcome
    ? view.seats.find(({ id }) => id === outcome.banishedId)?.exit
    : undefined
  const banishment = outcome
    ? label(outcome.banishedId) +
      ' was banished.' +
      (tableExit?.revealedRole
        ? ' ' + (tableExit.revealedRole === 'betrayer' ? 'A Betrayer.' : 'A Loyal.')
        : '')
    : undefined
  const enteredFinaleByBanishment = stage === 'final-challenge' && tableExit?.day === run.day
  const publicShieldId = run.publicShield?.day === run.day ? run.publicShield.id : undefined
  const visibleShieldResults = view.publicNightShieldWinnerIds.length > 0
  const tableFeed =
    !cue && (counting || (stage === 'round-table' && !run.runoffIds && run.tableSway)) ? (
      <RoundTableFeed
        key={counting ? countKey : run.id + ':debate:' + run.day}
        run={run}
        reducedMotion={utilities.preferences.reducedMotion}
        onCountComplete={() => setCountReady(countKey)}
        actionsTarget={voteActionsTarget}
      />
    ) : undefined
  switch (stage) {
    case 'role-reveal':
      message = view.role === 'betrayer' ? 'You are a Betrayer.' : 'You are a Loyal.'
      if (roleCard) detail = <CastleRoleCard {...roleCard} />
      else if (run.options.castleRoles) detail = 'Three guests hold Castle Roles.'
      play = {
        label: 'Play: open Day 1',
        onClick: () => apply((active) => acknowledgeRole(active, token)),
      }
      break
    case 'dawn': {
      message = !run.lastDawn && glance ? glance : dawnBroadcast(run)
      const reviewedCase = run.caseReviews?.find(
        ({ day, speakerId, result }) =>
          day === run.day - 1 && speakerId === run.humanId && result === 'missed'
      )
      const shieldSave = run.private.lastShieldSave
      if (participating && shieldSave?.day === run.day && shieldSave.id === viewerId) {
        detail = 'Your Night Shield stopped the Conclave’s attempt.'
      } else if (participating && reviewedCase) {
        detail = `After your case against ${label(reviewedCase.targetId)}, guests may ask for stronger proof next time.`
      }
      if (!detail && run.dayFlow?.delivery?.kind === 'account') {
        detail = `Your sealed account reached ${label(run.dayFlow.delivery.guestId)}.`
      }
      if (!detail && run.lastDawn) detail = glance
      if (!detail && glance && participating) detail = 'Guests are checking in through the Inbox.'
      play = {
        label: castleDay ? 'Go to Immunity Challenge' : 'Play: enter Social',

        onClick: () => apply(advanceDayBeat),
      }
      break
    }
    case 'social':
      message =
        glance ??
        (canSocialize ? 'Guests are taking a moment to talk.' : 'The survivors trade suspicions.')
      if (castleDay && participating) {
        detail = pendingIncoming.length
          ? 'Private conversations are waiting in your Inbox.'
          : 'Guests are spending time around the castle.'
      }
      play = {
        label: castleDay ? 'Go to Safety Challenge' : 'Play: begin Immunity Challenge',

        onClick: () => apply(advanceDayBeat),
      }
      break
    case 'after-immunity':
      message = run.immunityId ? `${label(run.immunityId)} won Immunity.` : 'Guests are at lunch.'
      detail = audiencePending
        ? 'Reveal the audience’s choice before agreeing to a vote.'
        : publicShieldId
          ? `${label(publicShieldId)} received the Public Shield.`
          : (glance ??
            (participating && pendingIncoming.length
              ? 'Check your Inbox for private vote plans.'
              : 'Guests can make private vote promises here.'))
      play = audiencePending
        ? { label: 'Reveal Public Shield', actionText: 'Reveal', onClick: revealPublicShield }
        : {
            label: castleDay ? 'Enter the castle afternoon' : 'Continue to Safety',

            onClick: () => apply((active) => advanceDayAftermath(active, token)),
          }
      break
    case 'shield-deals':
      message = view.hasNightShield
        ? `You hold ${view.nightShieldCount === 1 ? 'a Night Shield' : `${view.nightShieldCount} Night Shields`}.`
        : (glance ?? 'Shield Deals are open.')
      detail =
        participating && waitingShieldWitnesses(run)[0]
          ? `${label(waitingShieldWitnesses(run)[0])} asked for cover to testify.`
          : view.hasNightShield && glance
            ? glance
            : 'Opening the Table locks Night Shields.'
      play = {
        label: 'Continue to Round Table',

        onClick: () => apply((active) => advanceDayAftermath(active, token)),
      }
      break
    case 'immunity':
    case 'safety':
    case 'final-challenge':
      message = enteredFinaleByBanishment ? banishment : challengeName
      detail =
        stage === 'safety'
          ? `${run.immunityId ? label(run.immunityId) + ' is immune. ' : ''}The top ${NIGHT_SHIELD_COUNT} earn Night Shields.`
          : stage === 'final-challenge'
            ? (enteredFinaleByBanishment ? challengeName : 'This challenge') +
              ' adds to the pot. In the finale, banished roles stay sealed until the season ends.'
            : 'The winner is safe at the Round Table and at Night.'
      play = canPlay
        ? { label: 'Play ' + challengeName, actionText: 'Play', onClick: () => setPlaying(true) }
        : {
            label: 'See results',
            actionText: 'Results',

            onClick: () => finishChallenge(),
          }
      break
    case 'round-table':
    case 'final-banishment':
      if (audiencePending) {
        message = 'The audience has chosen a shield.'
        play = { label: 'Reveal Public Shield', actionText: 'Reveal', onClick: revealPublicShield }
      } else if (discussion) {
        message = publicShieldId
          ? label(publicShieldId) + ' has the Public Shield. The floor is open.'
          : 'The floor is open.'
        play = {
          label: 'Enter Round Table',

          onClick: () => {
            setClosedDiscussion(undefined)
          },
        }
      } else if (counting) {
        detail = tableFeed
        play = {
          label: 'Open runoff ballot',
          actionText: 'Runoff',

          disabled: countReady !== countKey,
          onClick: () => apply((active) => advanceTableRound(active, token)),
        }
      } else {
        message =
          isTarget && selected
            ? 'Your vote: ' + label(selected)
            : run.runoffIds
              ? 'Ballot ' + tableRoundNumber(run) + '. Choose among the tied contestants.'
              : participating
                ? 'Select a contestant to banish.'
                : 'The cast is ready to vote.'
        detail =
          tableFeed ??
          (stage === 'final-banishment'
            ? !run.runoffIds && run.lastTable?.blind
              ? 'At least one guest voted to banish again. This ballot keeps the banished role sealed.'
              : 'The banished guest’s role stays sealed until the season ends.'
            : publicShieldId
              ? label(publicShieldId) + ' has the Public Shield.'
              : view.hasNightShield
                ? nightShieldWindowOpen(run)
                  ? 'You hold a Night Shield. You can give it away in Social before voting.'
                  : 'Your Night Shield protects you at Night.'
                : undefined)
        play = {
          label: targets.length > 0 ? 'Lock vote' : 'View votes',
          actionText: targets.length > 0 ? 'Vote' : 'View votes',

          disabled: targets.length > 0 && !isTarget,
          onClick: () =>
            apply((active) => resolveTable(active, token, buildTableBallots(active, selected))),
        }
      }
      break
    case 'table-reveal':
      message = counting ? null : 'The ballots are sealed.'
      detail = tableFeed
      play = {
        label: 'Reveal result',
        actionText: 'Reveal',

        disabled: counting && countReady !== countKey,
        onClick: () => apply((active) => revealTable(active, token)),
      }
      break
    case 'cocktail':
      message = banishment
      detail = (
        <>
          {glance ?? 'The guests gather for a drink after the vote.'}
          {!cue && <RoundTableFeed run={run} actionsTarget={voteActionsTarget} />}
        </>
      )
      play = {
        label: 'Continue to Night',

        onClick: () => apply((active) => advanceDayAftermath(active, token)),
      }
      break
    case 'night':
      if (recruitmentOffer) {
        message = 'A sealed invitation'
        detail = recruitmentOffer.shielded
          ? 'The Conclave asks you to join. Your Night Shield lets you decline and stay Loyal.'
          : 'The Conclave asks you to join. If you decline, you leave the castle.'
        play = {
          label: 'Join the Betrayers',
          actionText: 'Join',

          onClick: () => apply((active) => answerRecruitment(active, token, true)),
        }
        break
      }
      if (recruitmentTargets) {
        message = 'Choose a Loyal to recruit.'
        play = {
          label: 'Send invitation',
          actionText: 'Invite',

          disabled: !isTarget,
          onClick: () => advanceConclave(),
        }
        break
      }
      message = conclave?.sealed
        ? 'The Sealed Ballot'
        : conclave
          ? undefined
          : (!castleDay && banishment) || nightBroadcast(run)
      detail = conclave?.sealed
        ? requiredReply
          ? 'Reply in the Inbox to open the shortlist.'
          : conclave.nominationBlocked
            ? 'A ward blocked your choice. Choose another guest from the shortlist.'
            : 'The shortlist is ready. Choose who receives the murder letter.'
        : conclave
          ? !playNightFilm && (
              <BetrayalsConclave
                line={conclaveLine}
                vote={conclave}
                selectedName={isTarget && selected ? label(selected) : undefined}
              />
            )
          : !castleDay && banishment
            ? nightBroadcast(run)
            : undefined
      play = {
        label: conclave?.sealed
          ? 'Cast sealed murder vote'
          : conclaveLine
            ? 'Play: next Conclave speaker'
            : conclave?.runoff
              ? 'Lock runoff vote'
              : targets.length
                ? 'Lock Night choice'
                : run.dayFlow && participating
                  ? 'Go to sleep'
                  : 'Play: follow the Night',
        actionText: !conclaveLine && (conclave?.runoff || targets.length) ? 'Vote' : undefined,
        disabled: !conclaveLine && targets.length > 0 && !isTarget,
        onClick: () =>
          advanceConclave(Boolean(conclave?.alphaAvailable && armedNightPower === conclaveKey)),
      }
      break
    case 'night-resolved':
      message =
        nightEffect === 'good-witch'
          ? 'The castle stayed quiet through the night.'
          : ((!playNightFilm ||
              pendingNight?.recruitedId ||
              pendingNight?.sealedBallot?.voterId === viewerId) &&
              describeConclaveVerdict(run, viewerId)) ||
            nightBroadcast(run)
      play = {
        label: 'Open Dawn',

        onClick: () => apply((active) => revealDawn(active, token)),
      }
      break
    case 'end-vote':
      message = banishment ? banishment + ' Their role stays sealed.' : 'Will you end the season?'
      detail = (
        <div className="betrayals-finale-detail">
          <p>
            Ending takes a unanimous vote. One Banish Again vote starts another ballot. At{' '}
            {FINAL_SURVIVOR_COUNT} guests, the season ends automatically. Any surviving Betrayer
            wins the pot for their side.
          </p>
        </div>
      )
      play = {
        label: participating ? 'End Season' : 'View decision',
        actionText: participating ? 'End season' : 'View decision',

        onClick: () => end(false),
      }
      break
    case 'settled':
      message = run.result?.winningRole === 'loyal' ? 'The Loyals win.' : 'The Betrayers win.'
      detail = run.result && (
        <div className="betrayals-finale-detail">
          <p>{finaleEnding[run.result.reason]}</p>
          <p>
            {run.result.winningRole === 'loyal'
              ? 'Only Loyals remained, so they split the pot.'
              : 'A Betrayer was still in the game. The surviving Betrayers take the pot.'}
          </p>
          <p>
            {Object.entries(run.result.payouts)
              .map(([id, amount]) => label(id) + ' ' + amount.toLocaleString())
              .join(', ')}
          </p>
          {run.seasonRewards?.finaleRevealed && (
            <p>
              Betrayers:{' '}
              {view.seats
                .filter(({ finaleRole }) => finaleRole === 'betrayer')
                .map(({ name }) => name)
                .join(', ')}
              .
            </p>
          )}
        </div>
      )
      play = {
        label: 'New season',
        actionText: 'New season',

        onClick: () => startSeason(human?.name ?? 'You', utilities.seasonOptions.realityMode),
      }
      break
  }

  if ((stage === 'round-table' || stage === 'shield-deals') && visibleShieldResults && !counting) {
    detail = (
      <>
        {detail}
        <p>Night Shield winners are marked. They may have passed their shields on in secret.</p>
      </>
    )
  }

  const finaleDiscussion =
    stage === 'final-banishment' &&
    run.dayFlow &&
    !run.dayFlow.finale &&
    !counting &&
    !run.runoffIds &&
    participating &&
    isTarget &&
    selectedSeat
  const finaleActions = finaleDiscussion && (
    <div className="betrayals-on-air__actions" role="group" aria-label="Finale statements">
      <button
        type="button"
        className="betrayals-inline-action"
        onClick={() =>
          apply((active) => recordFinalePosition(active, token, selectedSeat.id, 'trust'))
        }
      >
        Back {selectedSeat.name}
      </button>
      <button
        type="button"
        className="betrayals-inline-action"
        onClick={() =>
          apply((active) => recordFinalePosition(active, token, selectedSeat.id, 'doubt'))
        }
      >
        Question {selectedSeat.name}
      </button>
    </div>
  )

  if (stage === 'night' && run.dayFlow && !conclaveChoice && !recruitmentOffer && participating) {
    const order = run.dayFlow.night
    detail =
      order?.kind === 'meeting'
        ? `You are meeting ${label(order.guestId)} at breakfast.`
        : order?.kind === 'account'
          ? `You left ${label(order.guestId)} a sealed account.`
          : detail
  }
  const tableSpell = run.private.castleRoles?.some(
    ({ used }) => used?.roleId === 'bad-witch' && used.day === run.day
  )
  const publicRoleResult = run.private.castleRoles?.find(
    ({ used }) =>
      (used?.roleId === 'last-will' || used?.roleId === 'kamikaze' || used?.roleId === 'medium') &&
      used.day === run.day
  )?.used
  if (tableSpell && (stage === 'cocktail' || (stage === 'night' && !conclaveChoice))) {
    message = 'The Round Table fell asleep.'
    detail = 'The ballot was cancelled. Nobody was banished.'
  }
  if (
    publicRoleResult &&
    (stage === 'dawn' || stage === 'cocktail' || (stage === 'night' && !conclaveChoice))
  ) {
    if (publicRoleResult.roleId === 'last-will') {
      detail = `Last Will revealed ${label(publicRoleResult.targetId)} as ${publicRoleResult.allegiance === 'betrayer' ? 'a Betrayer' : 'a Loyal'}${publicRoleResult.revealedRole ? ` with the ${CASTLE_ROLE_CATALOG[publicRoleResult.revealedRole].title} role` : ''}.`
    } else if (publicRoleResult.roleId === 'kamikaze') {
      detail = publicRoleResult.blocked
        ? `${label(publicRoleResult.targetId)} was protected from the Kamikaze.`
        : `${label(publicRoleResult.targetId)} was taken out by the Kamikaze.`
    } else if (publicRoleResult.roleId === 'medium') {
      message = `${label(publicRoleResult.targetId)} returned to the castle.`
      if (castleRole?.used?.roleId === 'medium')
        detail = <CastleRoleResult role={castleRole} label={label} />
    }
  }
  if (quietDay && stage === 'social')
    detail = 'The Introvert is taking a quiet day. Your Inbox is still open.'
  const unsealed = run.private.castleRoles?.find(
    ({ used }) => used?.roleId === 'secret-betrayer' && used.day === run.day
  )
  if (
    (stage === 'dawn' || stage === 'cocktail' || (stage === 'night' && !conclaveChoice)) &&
    viewerId &&
    unsealed &&
    (unsealed.guestId === viewerId || view.teammateIds.includes(unsealed.guestId))
  )
    detail =
      unsealed.guestId === viewerId
        ? 'You can now join the Conclave and see your teammates.'
        : `${label(unsealed.guestId)} is your new Conclave teammate.`
  const order = stage === 'round-table' && !discussion && politicianOrder(run, run.humanId)
  if (order)
    detail = `The Politician directed your first ballot to ${label(order.targetId)}. Runoff votes are yours.`

  function armRole(text: string) {
    return (
      <button
        type="button"
        className="betrayals-ceremony-action--compact betrayals-broadcast__role-action"
        aria-pressed={actionArmed}
        onClick={() => {
          setArmedNightPower(actionArmed ? undefined : roleActionKey)
          setSelected(undefined)
          setDirectedVoter(undefined)
        }}
      >
        {text}
      </button>
    )
  }
  if (nightPower) {
    const witch = nightPower === 'good-witch'
    message = CASTLE_ROLE_CATALOG[nightPower].title
    detail = (
      <>
        <p>
          {nightPowerArmed
            ? witch
              ? 'Press Play to stop the Conclave.'
              : 'Press Play to send the letter to a random guest.'
            : witch
              ? 'Stop the Conclave before it can choose a victim. One use per season.'
              : 'Send the letter to a random different guest. Shields still apply. One use per season.'}
        </p>
        <button
          type="button"
          className="betrayals-ceremony-action--compact betrayals-broadcast__role-action"
          aria-pressed={nightPowerArmed}
          disabled={requiredReply || Boolean(pendingPaidNightShieldPurchase(run))}
          onClick={() => setArmedNightPower(nightPowerArmed ? undefined : nightPowerKey)}
        >
          {witch ? 'Arm the spell' : 'Ready the decoy'}
        </button>
      </>
    )
    play = {
      label: nightPowerArmed
        ? witch
          ? 'Cast sleep spell'
          : 'Redirect the letter'
        : 'Skip power and advance',
      actionText: nightPowerArmed ? (witch ? 'Cast spell' : 'Redirect') : 'Skip',
      onClick: confirmNightRole,
    }
  } else if (columbusChoice) {
    message = CASTLE_ROLE_CATALOG.columbus.title
    detail = `Choose ${COLUMBUS_GROUP_SIZE} guests to learn if at least one is a Betrayer. ${columbusIds.length}/${COLUMBUS_GROUP_SIZE} selected.`
    play = {
      label: columbusIds.length ? 'Check the Columbus group' : 'Skip Columbus and advance',
      actionText: columbusIds.length ? 'Check group' : 'Skip',
      disabled: columbusIds.length > 0 && columbusIds.length !== COLUMBUS_GROUP_SIZE,
      onClick: confirmNightRole,
    }
  } else if (nightRole) {
    message = CASTLE_ROLE_CATALOG[nightRole.roleId].title
    const action = doctorChoice ? 'protect' : 'check'
    detail = (
      <p>
        {isTarget && selected
          ? `Press Play to ${action} ${label(selected)} tonight.`
          : `Select a guest to ${action}${doctorChoice ? '' : ' for a Castle Role'}, or press Play to skip.`}
      </p>
    )
    play = {
      label: isTarget
        ? doctorChoice
          ? 'Confirm protection and advance'
          : 'Check for a Castle Role'
        : doctorChoice
          ? 'Skip protection and advance'
          : 'Skip Extrasense and advance',
      actionText: isTarget ? (doctorChoice ? 'Protect' : 'Check') : 'Skip',
      onClick: confirmNightRole,
    }
  } else if (departure && !cue) {
    const will = departure.roleId === 'last-will'
    message = CASTLE_ROLE_CATALOG[departure.roleId].title
    detail = will
      ? 'Select one guest to reveal their allegiance and Castle Role, or press Play to pass.'
      : 'Select a guest to take with you, or press Play to pass. Immunity and Night Shields still apply.'
    play = {
      label: isTarget
        ? will
          ? 'Reveal selected guest'
          : 'Take selected guest'
        : 'Pass departure power',
      actionText: isTarget ? (will ? 'Reveal' : 'Take with you') : 'Pass',
      onClick: () =>
        apply((active) => resolveDeparturePower(active, token, isTarget ? selected : undefined)),
    }
  } else if (tablePower === 'bad-witch') {
    detail = (
      <>
        {detail}
        {armRole('Ready the sleep spell')}
      </>
    )
    if (actionArmed)
      play = {
        label: 'Put the Round Table to sleep',
        actionText: 'Cast spell',
        onClick: () => apply((active) => sleepRoundTable(active, token)),
      }
  } else if (tablePower === 'politician') {
    if (actionArmed) {
      message = 'The Politician'
      detail = voterId
        ? `Choose who ${label(voterId)} must vote for.`
        : 'Choose the guest whose first ballot you want to direct.'
      play = {
        label: voterId ? 'Confirm voting instruction' : 'Choose the voter',
        actionText: voterId ? 'Direct vote' : 'Choose voter',
        disabled: !isTarget,
        onClick: () => {
          if (!selected) return
          if (voterId) {
            apply((active) => resolvePolitician(active, token, voterId, selected))
            setArmedNightPower(undefined)
            setDirectedVoter(undefined)
          } else setDirectedVoter({ key: roleActionKey, voterId: selected })
          setSelected(undefined)
        },
      }
    }
    detail = (
      <>
        {detail}
        {armRole('Direct a vote')}
      </>
    )
  } else if (dayPower) {
    const { roleId } = dayPower
    message = actionArmed ? CASTLE_ROLE_CATALOG[roleId].title : message
    const needsTarget = roleId !== 'change-of-heart'
    const action =
      roleId === 'medium' ? 'Revive' : roleId === 'diva' ? 'Ask privately' : 'Join the Betrayers'
    if (actionArmed)
      play = {
        label: action,
        actionText: action,
        disabled: needsTarget && !isTarget,
        onClick: () => {
          apply((active) => resolveDayCastleRole(active, token, roleId, selected))
          setArmedNightPower(undefined)
          setSelected(undefined)
        },
      }
    detail = (
      <>
        {actionArmed && needsTarget
          ? roleId === 'medium'
            ? 'Select a murdered guest to bring back.'
            : 'Select a guest to ask for a truthful answer.'
          : actionArmed
            ? 'Press Play to accept. Your former allegiance changes permanently.'
            : detail}
        {armRole(
          roleId === 'medium'
            ? 'Contact the dead'
            : roleId === 'diva'
              ? 'Ask for the truth'
              : 'Consider joining the Betrayers'
        )}
      </>
    )
  } else if (stage === 'immunity' && viewerId && eligibleCastleRole(run, viewerId, 'fatigued')) {
    detail = (
      <>
        <p>
          You must sit out one challenge today. Play Immunity or save your energy for the Shield
          Trial.
        </p>
        <button
          type="button"
          className="betrayals-ceremony-action--compact betrayals-broadcast__role-action"
          onClick={saveEnergyForSafety}
        >
          Save energy for shields
        </button>
      </>
    )
  } else if (
    stage === 'safety' &&
    participating &&
    !canPlay &&
    castleRole?.used?.roleId === 'fatigued' &&
    castleRole.used.day === run.day
  ) {
    detail = 'You played Immunity today, so you must sit out the Shield Trial.'
  } else if (stage === 'social' && castleRole?.used?.roleId === 'diva') {
    detail = <CastleRoleResult role={castleRole} label={label} />
  } else if (mayorChoice) {
    message = CASTLE_ROLE_CATALOG.mayor.title
    detail = (
      <p>
        {isTarget && selected
          ? `Press Play to cast a double vote for ${label(selected)}. Tap their portrait again to clear.`
          : 'Select a guest for a double vote, or press Play to open the regular ballot.'}
      </p>
    )
    play = {
      label: isTarget ? 'Lock double vote' : 'Skip Mayor power and open regular ballot',
      actionText: isTarget ? 'Double vote' : 'Skip',
      onClick: () =>
        apply((active) => {
          const answered = resolveMayorChoice(active, token, isTarget)
          if (!isTarget || answered === active) return answered
          const voted = resolveTable(
            answered,
            commandToken(answered),
            buildTableBallots(answered, selected)
          )
          return voted === answered ? active : voted
        }),
    }
  } else if (nightEffect === 'cursed' && pendingNight?.targetId === viewerId) {
    message = 'The curse has awakened.'
    detail = 'The letter was meant for you. At dawn, you’ll join the Betrayers.'
  } else if (cursedArrival) {
    detail = (
      <>
        {detail}
        <p>
          {cursedArrival.guestId === viewerId
            ? 'You joined the Betrayers at dawn.'
            : `${label(cursedArrival.guestId)} joined your side at dawn.`}
        </p>
      </>
    )
  } else if (
    stage === 'night-resolved' &&
    (castleRole?.used?.roleId === 'good-witch' || castleRole?.used?.roleId === 'illusionist') &&
    castleRole.used.day === run.day
  ) {
    detail = <CastleRoleResult role={castleRole} label={label} />
  } else if (
    (stage === 'night' || (stage === 'night-resolved' && castleRole?.roleId === 'doctor')) &&
    !recruitmentOffer &&
    castleRole?.used?.day === run.day &&
    (castleRole.used.roleId === 'doctor' ||
      castleRole.used.roleId === 'extrasense' ||
      castleRole.used.roleId === 'columbus')
  ) {
    detail = (
      <>
        {detail}
        <CastleRoleResult role={castleRole} label={label} />
      </>
    )
  } else if (
    castleRole?.used?.roleId === 'mayor' &&
    castleRole.used.day === run.day &&
    stage === 'round-table' &&
    !counting &&
    !run.runoffIds
  ) {
    detail = (
      <>
        {detail}
        <p>Your first ballot counts twice.</p>
      </>
    )
  }
  if (finaleDiscussion) {
    const { kept, broke, againstYou } = finaleMemory(run, selectedSeat.id)
    if (kept || broke || againstYou)
      detail = `${kept} promises kept · ${broke} broken · ${againstYou} public votes against you`
  }
  const alphaArmed = Boolean(conclave?.alphaAvailable && armedNightPower === conclaveKey)
  const alphaControl = conclave?.alphaAvailable && !conclaveLine && (
    <button
      type="button"
      className="betrayals-ceremony-action--compact betrayals-broadcast__role-action"
      aria-pressed={alphaArmed}
      onClick={() => setArmedNightPower(alphaArmed ? undefined : conclaveKey)}
    >
      Double this nomination
    </button>
  )
  if (alphaControl && !showConclaveDialog) {
    detail = (
      <>
        {detail}
        {alphaControl}
      </>
    )
    if (alphaArmed) play = { ...play, label: 'Lock double nomination', actionText: 'Double vote' }
  }

  const council =
    votePhase || stage === 'table-reveal' || stage === 'end-vote' || stage === 'settled'
  const afterDark = stage === 'night' || stage === 'night-resolved' || stage === 'role-reveal'
  const scene = council || stage === 'cocktail' ? 'council' : afterDark ? 'night' : 'observatory'
  const beat =
    run.runoffIds?.join('|') ?? (audiencePending ? 'audience' : discussion ? 'discussion' : '')
  const broadcastMode =
    stage === 'immunity' || stage === 'after-immunity'
      ? 'immunity'
      : stage === 'safety' || stage === 'shield-deals'
        ? 'safety'
        : stage === 'settled'
          ? 'finale'
          : council || stage === 'cocktail'
            ? 'ceremony'
            : afterDark
              ? 'night'
              : stage === 'dawn'
                ? 'daybreak'
                : 'default'
  return (
    <>
      <main
        className="betrayals-layout betrayals-layout--game"
        data-phase={stage}
        data-scene={scene}
        data-conclave-cover={
          showConclaveDialog ||
          (cue === 'nightfall' &&
            (conclave?.sealed || run.presentation?.includes('conclave-arrival'))) ||
          undefined
        }
        data-betrayals-motion={motion}
        data-round-table-view={
          stage === 'round-table'
            ? discussionVisible
              ? 'room'
              : closedDiscussion === discussionKey || run.tableSway !== undefined
                ? 'return'
                : undefined
            : undefined
        }
        inert={
          Boolean(cue) ||
          discussionVisible ||
          showConclaveDialog ||
          Boolean(run.pendingAdBreak) ||
          adBreak.active
        }
      >
        <div className="betrayals-room" aria-hidden="true">
          <img
            key={scene}
            src={
              scene === 'observatory' || stage === 'role-reveal'
                ? castleExterior
                : artBase + scene + '.jpg'
            }
            alt=""
          />
        </div>
        <div className="betrayals-board">
          <header className="betrayals-header">
            <div className="betrayals-brand-row">
              <div className="betrayals-wordmark">
                <span className="betrayals-eye" aria-hidden="true" />
                <div className="betrayals-wordmark__copy">
                  <span className="betrayals-wordmark__signature">Betrayals</span>
                  <sup className="betrayals-wordmark__season">Season {run.seasonNumber ?? 1}</sup>
                </div>
              </div>
            </div>
            <div className="betrayals-phase-strip">
              <div className="betrayals-phase-strip__copy" aria-live="polite">
                <span className="betrayals-phase-strip__group">{stageGroup}</span>
                <span className="betrayals-phase-strip__subphase">{subphase}</span>
              </div>
              <div
                className="betrayals-phase-strip__tools"
                role="group"
                aria-label="Season shortcuts"
              >
                {roleCard && stage !== 'role-reveal' && (
                  <button
                    className="betrayals-phase-strip__log"
                    type="button"
                    aria-label="View your Castle Role"
                    aria-haspopup="dialog"
                    aria-expanded={castleRoleOpen}
                    title="Your Castle Role"
                    onClick={() => setCastleRoleOpen(true)}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="5" y="3" width="14" height="18" rx="2" />
                      <path d="m12 7 3.5 5-3.5 5-3.5-5z" />
                    </svg>
                  </button>
                )}
                <button
                  className="betrayals-phase-strip__log"
                  type="button"
                  aria-label="Open My Pulse"
                  aria-haspopup="dialog"
                  aria-expanded={Boolean(pulse)}
                  title="My Pulse"
                  onClick={() => investigation.openPulse()}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M7 3h12v16H7a2 2 0 0 0 0 4h12M7 3a2 2 0 0 0-2 2v16M9 8h6m-6 4h6" />
                    <path d="M12 3v3l1.5-1 1.5 1V3" />
                  </svg>
                </button>
                <button
                  className="betrayals-phase-strip__store"
                  type="button"
                  aria-label="Open Store"
                  aria-haspopup="dialog"
                  title="Store"
                  onClick={() => openStore('home')}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 8h14l-1 13H6L5 8Z" />
                    <path d="M9 8V6a3 3 0 0 1 6 0v2" />
                    <path d="M9 12v1m6-1v1" />
                  </svg>
                </button>
                {(import.meta.env.DEV || import.meta.env.MODE === 'betrayals-qa') && (
                  <button
                    className="betrayals-phase-strip__log betrayals-phase-strip__qa"
                    type="button"
                    aria-haspopup="dialog"
                    aria-label="Open Castle QA"
                    onClick={() => setQaOpen(true)}
                  >
                    QA
                  </button>
                )}
              </div>
            </div>
          </header>

          <BetrayalsBroadcast
            title={
              conclave?.sealed ? 'The Sealed Ballot' : conclaveChoice ? 'The Conclave' : stageTitle
            }
            message={message}
            detail={detail}
            interactive={Boolean(
              tableFeed || nightPower || dayPower || tablePower || conclave?.alphaAvailable
            )}
            controlsRef={
              !cue && (counting || stage === 'cocktail') ? setVoteActionsTarget : undefined
            }
            cueKey={run.id + ':' + run.day + ':' + stage + ':' + beat}
            mode={broadcastMode}
            art={artBase + scene + '.jpg'}
            opener={
              openWeather && (
                <DawnWeather
                  key={[run.id, run.day, stage].join(':')}
                  weather={castleWeather(run, run.day + Number(stage === 'night-resolved'))}
                  reducedMotion={!playNightFilm}
                  onFinish={shownCue === 'sunrise' ? finishCue : undefined}
                />
              )
            }
          />

          <div className="betrayals-status" role="group" aria-label="Season status">
            <span className="betrayals-status__day">
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <circle cx="10" cy="10" r="3" />
                <path d="M10 2v2m0 12v2M2 10h2m12 0h2M4.4 4.4l1.4 1.4m8.4 8.4 1.4 1.4m0-11.2-1.4 1.4m-8.4 8.4-1.4 1.4" />
              </svg>
              Day <strong>{String(run.day).padStart(2, '0')}</strong>
            </span>
            <span className="betrayals-status__cast">
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <circle cx="10" cy="7" r="2.5" />
                <path d="M5 16v-1a5 5 0 0 1 10 0v1M5 6a2 2 0 0 0 0 4m10-4a2 2 0 0 1 0 4M3.5 12a3 3 0 0 0-2 3m15-3a3 3 0 0 1 2 3" />
              </svg>
              <span>
                <strong>{activeCast.length}</strong>/{view.seats.length} left
              </span>
            </span>
            <span className="betrayals-status__pot">
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M5 6h10l3 4-8 7-8-7zm0 0 2.5 4L10 17m5-11-2.5 4-2.5 7M2 10h16M10 2v1" />
              </svg>
              <strong>{run.pot.toLocaleString()}</strong> pot
            </span>
          </div>

          <section ref={rosterSection} className="betrayals-cast" aria-label="Cast seats">
            <Roster
              view={view}
              selectedId={selected}
              selectedIds={columbusChoice ? columbusIds : undefined}
              humanId={run.humanId}
              sleeping={
                (stage === 'night' && (!conclaveChoice || conclave?.sealed || Boolean(cue))) ||
                stage === 'night-resolved' ||
                shownCue === 'awakening'
              }
              selectableIds={
                columbusChoice && columbusIds.length === COLUMBUS_GROUP_SIZE
                  ? columbusIds
                  : targets.length
                    ? targets
                    : undefined
              }
              runoffIds={votePhase ? run.runoffIds : undefined}
              announcedNightId={announcedNightId}
              compactExitId={compactExit ? cinematic.subject?.id : undefined}
              mourning={mourning}
              onSelect={(id) => {
                if (columbusChoice) {
                  const ids = columbusIds.includes(id)
                    ? columbusIds.filter((guestId) => guestId !== id)
                    : [...columbusIds, id]
                  setColumbusPick({ key: columbusKey, ids })
                } else setSelected((nightRole || mayorChoice) && selected === id ? undefined : id)
              }}
            />
            {!participating && stage !== 'settled' && (
              <div className="betrayals-cast__caption">Spectator</div>
            )}
          </section>
        </div>

        {saveIssue && (
          <p className="betrayals-save-issue" role="status">
            This device could not save your progress.
          </p>
        )}
        {pendingPaidNightShieldPurchase(run) && (
          <p className="betrayals-save-issue" role="status">
            {shieldIssue ?? 'Finishing your Night Shield purchase…'}{' '}
            <button
              type="button"
              onClick={() => {
                void reconcileWallet()
              }}
            >
              Retry purchase
            </button>
          </p>
        )}

        {pulse && commerce.myPulse && (
          <BetrayalsPulse
            day={run.day}
            humanId={run.humanId}
            entries={gameLogFor(run)}
            view={pulseView(run)}
            initial={pulse}
            onClose={() => setPulse(undefined)}
            onAction={investigate}
            investigation={investigation}
          />
        )}

        <BetrayalsDock
          play={
            requiredReply
              ? {
                  ...play,
                  disabled: true,
                  label: 'Reply in the Inbox to continue',
                  actionText: undefined,
                }
              : {
                  ...play,
                  onClick: () => {
                    utilities.playEffect('ui:risk_wheel_click', 0.5)
                    play.onClick()
                  },
                  disabled: play.disabled || Boolean(pendingPaidNightShieldPurchase(run)),
                }
          }
          utility={
            finaleActions ||
            recruitmentOffer ||
            (stage === 'end-vote' && participating) ||
            showRevealReward ? (
              <>
                {finaleActions}
                {recruitmentOffer && (
                  <button
                    type="button"
                    className="betrayals-inline-action"
                    disabled={requiredReply || Boolean(pendingPaidNightShieldPurchase(run))}
                    onClick={() => apply((active) => answerRecruitment(active, token, false))}
                  >
                    {recruitmentOffer.shielded ? 'Decline and stay Loyal' : 'Decline and leave'}
                  </button>
                )}
                {stage === 'end-vote' && participating && (
                  <button
                    type="button"
                    className="betrayals-inline-action"
                    onClick={() => end(true)}
                  >
                    Banish Again
                  </button>
                )}
                {showRevealReward && (
                  <BetrayalsRewardActions key={run.id} onClaim={claimSeasonReward} />
                )}
              </>
            ) : undefined
          }
          home={{
            onClick: () => {
              utilities.playEffect('ui:navigate', 0.45)
              setName(human?.name ?? '')
              if (run.phase === 'settled') setHomeOpen(true)
              else setLeaveOpen(true)
            },
          }}
          social={{
            onClick: () => openSocial(),
            active: socialOpen,
            disabled: !participating || quietDay,
            count: canSocialize ? socialResources.energy : undefined,
          }}
          incoming={{
            onClick: openIncoming,
            active: incomingOpen,
            count: pendingIncoming.length,
            unread: unreadIncoming.length,
            attentionKey: run.id + ':' + run.day + ':' + stage,
          }}
          settings={{
            onClick: () => {
              utilities.playEffect('ui:navigate', 0.45)
              utilities.openPanel('settings')
            },
            active: utilities.panel === 'settings',
          }}
        />

        {socialOpen && (
          <BetrayalsSocialPanel
            key={run.id}
            actorId={run.humanId}
            prospects={activeCast}
            cast={view.seats}
            resources={socialResources}
            energyRecharge={{
              watch: () => void watchEnergyRecharge(),
              pending: rechargeAd.pending,
              dailyLimit: rechargeAd.dailyLimitReached(BETRAYALS_SOCIAL_RECHARGE_PLACEMENT),
              notice: rechargeNotice,
            }}
            realityMode={run.options.realityMode}
            hasRealityMode={commerce.realityMode}
            hasDramaMode={commerce.dramaMode}
            hasMyPulse={commerce.myPulse}
            onUpgrade={openUpgrade}
            canAct={canSocialize}
            phase={stage}
            initialContact={socialEntry?.guestId}
            initialAction={socialEntry?.action}
            dayContext={daySocialContext(run)}
            nightShieldCount={view.nightShieldCount}
            publicNightShieldWinnerIds={view.publicNightShieldWinnerIds}
            moveKinds={moveKinds}
            voteTargetIds={eligibleBanishmentTargets(run, run.humanId)}
            day={run.day}
            conversation={conversation}
            recent={recent}
            investigation={investigation}
            intel={
              lead &&
              commerce.realityMode &&
              stage === 'social' && (
                <WitnessLeadCard
                  lead={lead}
                  onAsk={() => apply((active) => askWitness(active, token))}
                />
              )
            }
            onClose={() => setSocialOpen(false)}
            onGeneralMove={
              generalSocialOpen(run)
                ? (kind, guests, details) => {
                    if (!canUseBetrayalsAction(kind, commerce.realityMode))
                      return openUpgrade('realityMode')
                    return apply((active) =>
                      applyGeneralSocialMove(active, token, kind, guests, details)
                    )
                  }
                : undefined
            }
            onAllianceChange={(id, change, value) => {
              if (!commerce.realityMode) return openUpgrade('realityMode')
              return apply((active) => applyCastleAllianceChange(active, token, id, change, value))
            }}
            onMove={(kind, suspectId, recipientId, options) => {
              if (kind === 'reveal-castle-role')
                return apply((active) =>
                  revealCastleRole(active, token, recipientId, commerce.dramaMode)
                )
              if (!canUseBetrayalsAction(kind, commerce.realityMode))
                return openUpgrade('realityMode')
              return apply((active) => {
                if (!canSocialize) return active
                const choice =
                  kind === 'question'
                    ? chooseTarget(
                        resolutionPerspective(
                          active,
                          recipientId,
                          activeCast
                            .map((seat) => seat.id)
                            .filter(
                              (candidate) => candidate !== recipientId && candidate !== run.humanId
                            )
                        ),
                        'table'
                      )
                    : suspectId
                return applySocialMove(active, token, {
                  actorId: active.humanId,
                  recipientId,
                  kind,
                  suspectId: choice,
                  ...options,
                })
              })
            }}
          />
        )}
        {incomingOpen && (
          <BetrayalsIncomingInteractions
            interactions={incoming}
            hasRealityMode={commerce.realityMode}
            hasMyPulse={commerce.myPulse}
            readIds={readIncoming}
            onRead={markIncomingRead}
            onOpenIntel={(guestId) => investigation.openPulse(guestId)}
            onClose={() => setIncomingOpen(false)}
            onDiscussVote={
              run.dayFlow && (stage === 'after-immunity' || (castleDay && stage === 'social'))
                ? (id) => openSocial(id, 'vote-plan')
                : undefined
            }
            onRespond={(id, answer) => {
              const choice = CASTLE_CHOICES.find((choice) => choice === answer)
              if (
                choice &&
                incoming.some((entry) => entry.id === id && entry.kind === 'castle-moment') &&
                !commerce.realityMode &&
                isPremiumCastleChoice(choice)
              )
                return openUpgrade('realityMode')
              return apply((active) => respondToIncomingInteraction(active, token, id, answer))
            }}
          />
        )}
        {roleCard && castleRoleOpen && (
          <CastleRoleDialog {...roleCard} onClose={() => setCastleRoleOpen(false)} />
        )}
        <BetrayalsUtilityPanel
          utilities={utilities}
          profiles={profiles}
          market={market}
          onUpgrade={openUpgrade}
        />
      </main>
      {showConclaveDialog && (
        <ConclaveDiscussion
          key={conclaveKey}
          subphase={subphase}
          cast={showSealedBallot || sealedVerdict ? [] : conclaveGuests(run, viewerId)}
          view={view}
          vote={conclave ?? undefined}
          recruitmentTargets={recruitmentTargets}
          showFilm={playNightFilm}
          line={conclaveLine}
          step={conclaveStep}
          total={conclaveLines.length}
          selectedId={selected}
          onSelect={setSelected}
          onAdvance={() => {
            if (showSealedBallot) utilities.playEffect('ui:risk_wheel_click', 0.5)
            advanceConclave(alphaArmed)
          }}
          ballotControl={alphaControl}
          doubleVote={alphaArmed}
          onBack={() => moveConclave(conclaveStep - 1)}
          onSkip={() => moveConclave(conclaveLines.length)}
          onOpenQa={CastleQaDialog ? () => setQaOpen(true) : undefined}
          opening={openingConclave}
          verdict={conclaveVerdict}
          sealedVerdict={sealedVerdict}
          playEffect={utilities.playEffect}
          onFinishFilm={sealedIntro ? () => setSeenSealedIntro(conclaveKey) : finishCue}
        />
      )}
      {discussion && !cue && (
        <RoundTableDiscussion
          key={discussionKey}
          run={run}
          open={discussionVisible}
          art={artBase + 'council.jpg'}
          shieldName={publicShieldId ? label(publicShieldId) : undefined}
          reducedMotion={utilities.preferences.reducedMotion}
          onBack={() => {
            utilities.playEffect('ui:navigate', 0.45)
            setClosedDiscussion(discussionKey)
          }}
          onAskWitness={() => apply((active) => askWitness(active, token))}
          investigation={investigation}
          hasRealityMode={commerce.realityMode}
          onUpgrade={() => openUpgrade('realityMode')}
          onSleepTable={
            sleepyTable && !requiredReply
              ? () => apply((active) => sleepRoundTable(active, token))
              : undefined
          }
          onOpenQa={CastleQaDialog ? () => setQaOpen(true) : undefined}
          onSway={(choice) => {
            if (!canUseBetrayalsTableSway(choice, commerce.realityMode))
              return openUpgrade('realityMode')
            utilities.playEffect('ui:risk_wheel_click', 0.5)
            apply((active) => recordTableSway(active, token, choice))
          }}
        />
      )}
      {cue === 'safety-results' && (
        <SafetyResults
          rows={safetyResultsFor(run, viewerId)}
          publicResults={visibleShieldResults}
          gameKey={run.challengeHistory?.at(-1)}
          onComplete={finishCue}
        />
      )}
      {cinematic && compactExit && (
        <BriefRosterExit key={cinematic.id} scene={cinematic} onComplete={finishCue} />
      )}
      {cinematic && !compactExit && (
        <CinematicScene
          key={cinematic.id}
          scene={cinematic}
          reducedMotion={utilities.preferences.reducedMotion || shownCue === 'awakening'}
          autoAdvance={
            cue !== 'death-letter' && cue !== 'departure' && (run.presentation?.length ?? 0) > 1
          }
          fadeToGame={(run.presentation?.length ?? 0) <= 1}
          playEffect={utilities.playEffect}
          getRosterSeat={getRosterSeat}
          onComplete={finishCue}
        />
      )}
      {leaveOpen && (
        <BetrayalsLeaveDialog
          onClose={() => setLeaveOpen(false)}
          onLeave={leaveSeason}
          motion={motion}
        />
      )}
      {rewindTarget && (
        <BetrayalsRewardActions
          key={run.id}
          rewindTarget={rewindTarget}
          onClaim={claimSeasonReward}
          onLeave={() => {
            setName(human?.name ?? '')
            return leaveSeason(stage !== 'settled', true)
          }}
          motion={motion}
        />
      )}
      <BetrayalsAdBreak active={adBreak.active} />
      {CastleQaDialog && qaOpen && (
        <Suspense fallback={null}>
          <CastleQaDialog run={run} onClose={() => setQaOpen(false)} onSimulate={simulateQa} />
        </Suspense>
      )}
      <PortraitOrientationGuard />
    </>
  )
}

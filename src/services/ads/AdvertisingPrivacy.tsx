import { useId, useState, useSyncExternalStore, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import GameBackButton from '../../components/ui/GameBackButton/GameBackButton'
import { ageBandForAge, declarePlayerAge } from '../../safety/playerSafety'
import { usePlayerSafety } from '../../safety/usePlayerSafety'
import { usesContextualAdTreatment } from './adAudience'
import {
  checkAdMobAvailability,
  hasAdMobPrivacyOptions,
  openAdMobPrivacyOptions,
} from './admobBridge'
import { getAdAvailabilityMessage, subscribeAdAvailability } from './adAvailability'
import '../../safety/PlayerSafetyScreen.css'

export default function AdvertisingPrivacy({ betrayals = false }: { betrayals?: boolean }) {
  const navigate = useNavigate()
  const location = useLocation()
  const openedFromSettings =
    (location.state as { fromSettings?: boolean } | null)?.fromSettings === true
  const returnToCompetition = (location.state as { returnTo?: string } | null)?.returnTo === '/game'
  return (
    <main className={betrayals ? 'player-safety player-safety--betrayals' : 'player-safety'}>
      <section className="player-safety__card" aria-labelledby="advertising-privacy-title">
        <p className="player-safety__eyebrow">
          {betrayals ? 'THE BIG EYE: BETRAYALS' : 'THE BIG EYE'}
        </p>
        <h1 id="advertising-privacy-title">Advertising privacy</h1>
        <AdvertisingPrivacyControls betrayals={betrayals} />
        <div className="player-safety__actions">
          <PrivacyPolicy />
          <a href="mailto:kolequant@gmail.com?subject=The%20Big%20Eye%20ad%20report">
            Report an ad
          </a>
          <GameBackButton
            label={
              returnToCompetition
                ? 'Back to competition'
                : betrayals
                  ? 'Back to Betrayals'
                  : 'Back to settings'
            }
            showLabel
            onClick={() => {
              if (returnToCompetition) navigate('/game', { replace: true })
              else if (openedFromSettings) navigate(-1)
              else navigate(betrayals ? '/' : '/settings', { replace: true })
            }}
          />
        </div>
      </section>
    </main>
  )
}

function PrivacyPolicy() {
  return (
    <a
      href={`${import.meta.env.BASE_URL}legal/privacy-policy.html`}
      target="_blank"
      rel="noreferrer"
    >
      Privacy policy
    </a>
  )
}

export function AdvertisingPrivacyControls({
  betrayals,
  insideReward = false,
}: {
  betrayals: boolean
  insideReward?: boolean
}) {
  const ageId = useId()
  const record = usePlayerSafety()
  const [age, setAge] = useState('')
  const [notice, setNotice] = useState('')
  const [checking, setChecking] = useState(false)
  const availabilityMessage = useSyncExternalStore(
    subscribeAdAvailability,
    getAdAvailabilityMessage
  )
  function submitAge(event: FormEvent) {
    event.preventDefault()
    setNotice('')
    if (!declarePlayerAge(age)) setNotice('Your choice could not be saved. Please try again.')
    setAge('')
  }
  return (
    <>
      {betrayals && !insideReward && (
        <p>
          Standard play includes an automatic break after banishment and the night result, and after
          each Final Five vote. No Ads and VIP remove these breaks.
        </p>
      )}
      {!record ? (
        <form onSubmit={submitAge}>
          <p>
            Enter your real age, rather than your character’s age. We keep only an age group on this
            device.
          </p>
          <label htmlFor={ageId}>Your age</label>
          <input
            id={ageId}
            type="number"
            min="0"
            max="120"
            step="1"
            required
            value={age}
            onChange={(event) => setAge(event.target.value)}
          />
          <button type="submit" disabled={ageBandForAge(age) === null}>
            {insideReward ? 'Save age' : 'Continue'}
          </button>
        </form>
      ) : !usesContextualAdTreatment() ? (
        <>
          {insideReward ? null : betrayals ? (
            <p>Rewarded ads are optional. You can choose to watch one when a reward is offered.</p>
          ) : (
            <p>
              Standard play includes automatic ad breaks. No Ads and VIP remove those breaks.
              Rewarded ads are optional: choose Watch Ad when you want a reward.
            </p>
          )}
          <p>
            Google may receive device information, your IP address, and ad interactions. Manage
            Google's privacy choices below. Ads are subject to availability and privacy
            requirements.
          </p>
          <p role="status">
            {availabilityMessage ??
              'Ad rewards are subject to availability. Google privacy setup is checked before live ads.'}
          </p>
          <button
            type="button"
            className="player-safety__secondary"
            disabled={checking}
            onClick={() => {
              setChecking(true)
              setNotice('')
              void checkAdMobAvailability()
                .then((message) => {
                  setNotice(message ?? 'Advertising setup is ready. You can return to your reward.')
                })
                .finally(() => setChecking(false))
            }}
          >
            {checking ? 'Checking advertising…' : 'Check advertising setup'}
          </button>
          {hasAdMobPrivacyOptions() && (
            <button
              type="button"
              className="player-safety__secondary"
              onClick={() => {
                void openAdMobPrivacyOptions().catch(() =>
                  setNotice(
                    'Google privacy choices are unavailable right now. Please try again later.'
                  )
                )
              }}
            >
              Advertising privacy choices
            </button>
          )}
        </>
      ) : (
        <p>
          {betrayals
            ? insideReward
              ? availabilityMessage
              : 'Rewarded ads and Eyeros pack purchases are available to adults only.'
            : 'Rewarded ads and Survival run purchases are available to adults only.'}
        </p>
      )}
      {!insideReward && usesContextualAdTreatment() && (
        <p>
          Standard play may include short contextual ad breaks. These ads are selected without
          behavioral profiling. They apply to players under 18 and when no age is on file.
        </p>
      )}
      {!insideReward && record?.ageBand === 'adult' && usesContextualAdTreatment() && (
        <p>Restart the app to use adult ad choices and rewards.</p>
      )}
      {notice && <p role="status">{notice}</p>}
      {insideReward && <PrivacyPolicy />}
    </>
  )
}

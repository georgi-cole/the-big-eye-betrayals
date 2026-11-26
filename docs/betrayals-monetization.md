# Betrayals monetization

Product and implementation reference for the 23 November 2026 monetization work.
The runtime catalog is `src/betrayals/commerce/catalog.ts`. It is separate from
the original Big Eye catalog and entitlements. This document describes code and
store setup targets; it does not certify that products, live ads, or payments have
been activated in Apple, Google Play, or AdMob.

## Products and ownership

Betrayals uses one-time purchases. Permanent features are non-consumables;
Eyeros packs are consumables. All default product identifiers below start with
`com.georgicole.thebigeye.betrayals.`. The app's native bundle/application ID is
`com.georgicole.thebigeye.betrayals` on both platforms.

Prices in this table are nominal EUR setup targets. The shop displays the
localized price returned by the native store and disables checkout when a native
product or price is unavailable. A browser preview does not simulate a paid
purchase or silently grant ownership.

| Product        | ID suffix      | Type       | Setup target | Includes                                                                                                                |
| -------------- | -------------- | ---------- | ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Betrayals VIP  | `vip`          | Permanent  | €14.99       | My Pulse, Reality Mode, Drama Mode, supported premium challenge versions, changing-room looks, removal of automatic ads |
| My Pulse       | `mypulse`      | Permanent  | €2.99        | Personal season chronicle, relationships, turning points, pressures, saved Intel and private notes                      |
| Reality Mode   | `realitymode`  | Permanent  | €6.99        | Full guest profiles and advanced social/investigation actions                                                           |
| Drama Mode     | `dramamode`    | Permanent  | €4.99        | Castle Roles and private role reveals                                                                                   |
| No Ads         | `noads`        | Permanent  | €2.99        | Removal of automatic interstitials; optional rewarded opportunities remain available                                    |
| 10,000 Eyeros  | `eyeros10000`  | Consumable | €1.99        | Currency delivered to the profile selected at checkout                                                                  |
| 35,000 Eyeros  | `eyeros35000`  | Consumable | €4.99        | Currency delivered to the profile selected at checkout                                                                  |
| 100,000 Eyeros | `eyeros100000` | Consumable | €9.99        | Currency delivered to the profile selected at checkout                                                                  |

VIP does not grant Eyeros packs or free purchased Night Shields. The original Big
Eye VIP is not treated as a Betrayals purchase.

### Standalone-to-VIP upgrade

Owned My Pulse, Reality Mode, Drama Mode and No Ads qualify for a VIP upgrade. The catalog
calculates 75% of their nominal catalog value as credit, applies a €4.99 minimum
upgrade target, and selects the nearest configured upgrade SKU. The customer
sees that SKU's actual localized store price. This is catalog-based pricing, not
a stored cash balance or a promise to refund 75% of a historical transaction.
Eyeros packs do not count toward the upgrade.

| Upgrade ID suffix | Setup target |
| ----------------- | ------------ |
| `vip.upgrade1249` | €12.49       |
| `vip.upgrade1049` | €10.49       |
| `vip.upgrade999`  | €9.99        |
| `vip.upgrade749`  | €7.49        |
| `vip.upgrade499`  | €4.99        |

Every upgrade SKU grants the same permanent VIP access. These are separate
non-consumables which must exist in both platform catalogs before an eligible
upgrade can be purchased. They are offered through the eligible VIP card, not
as separate shelves of interchangeable VIP products.

Product-ID overrides are supported by `VITE_BETRAYALS_VIP_PRODUCT_ID`,
`VITE_BETRAYALS_PULSE_PRODUCT_ID`, `VITE_BETRAYALS_REALITY_PRODUCT_ID`,
`VITE_BETRAYALS_DRAMA_PRODUCT_ID`,
`VITE_BETRAYALS_NO_ADS_PRODUCT_ID`,
`VITE_BETRAYALS_EYEROS10000_PRODUCT_ID`,
`VITE_BETRAYALS_EYEROS35000_PRODUCT_ID`,
`VITE_BETRAYALS_EYEROS100000_PRODUCT_ID`, and
`VITE_BETRAYALS_VIP_UPGRADE_<CENTS>_PRODUCT_ID` for each listed upgrade tier.

## Store sections and wallet

The Store opens on a compact overview with a wallet balance and links to distinct
destinations. Product details and currency packs appear after choosing a
destination, keeping the overview short enough to scan on a phone.

| Destination     | Contents                                                                    | Purchase behavior                                                      |
| --------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| VIP             | Permanent bundle benefits, current ownership and any eligible upgrade price | Uses the existing native VIP offer                                     |
| Feature unlocks | My Pulse, Reality Mode, Drama Mode and No Ads                               | Each card keeps its localized native price and ownership state         |
| Season items    | Night Shield availability and a changing-room link                          | Uses the current season's shield eligibility and existing Eyeros debit |
| Wallet          | Selected profile, Eyeros balance, recent activity and a top-up entry        | Viewing activity does not start a purchase                             |
| Top up Eyeros   | The three currency packs and their delivery/storage explanation             | Uses the selected profile and existing native consumable checkout      |

The changing room remains directly accessible from the Store overview. Detail
views return to the overview, and the top-up view returns to the wallet before
leaving it. A locked feature opens its corresponding section directly: VIP opens
the bundle, My Pulse/Reality Mode/Drama Mode/No Ads open feature unlocks, and a currency-pack
entry opens wallet top-up. Returning from a focused product does not reopen that
product automatically.

The wallet shows existing profile transactions as recent activity, with an
option to expand the list. It is a view of the same profile balance used for
season earnings, Night Shields and looks; it does not create another wallet.
Without a selected profile, the wallet offers profile selection and prevents a
currency-pack checkout. Purchases, restore, native prices, earned amounts and
Night Shield eligibility retain their existing contracts.

Standalone review links are `#/store`, `#/store/vip`, `#/store/features`,
`#/store/items` and `#/wallet`. Home and the in-season balance open Wallet in
the utility dialog; season items keep the active run's eligibility there.
Choosing or creating a profile from Wallet preserves its return destination.
Restore, advertising privacy and legal links remain under **Purchases & support**.

## Gameplay access

A standard player can complete a season, participate in its challenges, cast
votes, form a view of the cast, and use the basic social actions. Basic actions
include rapport, questioning, debriefing, mending fences, End Season pacts,
laying low, exploring the castle and the basic shield request/gift interactions.
Careful Round Table questioning and the normal vote remain accessible.

Reality Mode expands the action set and full profiles. It does not reveal hidden
roles or insert a verified "Betrayer probability" into a profile. My Pulse is a
separate purchase; Reality Mode does not implicitly grant it. VIP grants both.
Drama Mode is a permanent unlock (default SKU
`com.georgicole.thebigeye.betrayals.dramamode`, nominal EUR 4.99), also included
in Betrayals VIP. It qualifies for the same VIP upgrade credit as other
standalone features. Owners enable it under Settings → Next season. The deal
adds three Castle Roles and lets a holder of a Loyal Castle Role privately tell
a guest the role in Social. The guest can pass it on.
Unlocking a feature does not change a guest's role, replace an already drawn
challenge, or automatically make an AI interaction succeed.

The paid Night Shield is an intentional survival aid. This monetization model
therefore includes gameplay-affecting purchases as well as presentation and
convenience. The shield's restrictions below are part of its product contract.

## Eyeros earned through play

Eyeros use the existing profile wallet. The public label remains **Eyeros**;
legacy internal `eyeoleans` identifiers remain compatible.

| Event                           | Earned Eyeros | Limit                                         |
| ------------------------------- | ------------: | --------------------------------------------- |
| Completed social action         |            50 | First four qualifying actions per in-game day |
| Completed challenge             |           150 | Once per challenge; forfeits do not earn it   |
| Won immunity                    |           500 | Once for that day's immunity challenge        |
| Earned a Safety shield          |           400 | Eligible top-two Safety result                |
| Survived a night                |           400 | Once for that night                           |
| Won the final challenge         |         1,000 | Once                                          |
| Reached the Final Five          |         2,500 | Once per run                                  |
| Reached the season result alive |         1,000 | Once per run                                  |
| Won the season                  |        10,000 | Once per run                                  |

Awards have stable run/event identifiers. The profile keeps a permanent receipt
ledger so repeated callbacks, reloads and season rewinds cannot award the same
event twice. Spectator progression does not earn player participation/survival
awards. The season pot and the profile's Eyeros balance are separate values.

### Night Shield

The price is **3,000 Eyeros**. The purchase is available only after banishment,
during the `night` phase, for a living human Loyal with at least six guests still
in the game. The player cannot buy another shield for the same named night, or
buy one while already protected by immunity or an earned night shield.

The purchased shield is personal, cannot be transferred, and protects against
murder for that night only. It does not prevent banishment. Resolution rechecks
that the protected player is eligible and at least six guests remain; there is
no purchased protection in the Final Five. The protection expires at dawn and
does not move to a different night following a rewind. Current Betrayals has no
recruitment mechanic, so no recruitment behavior is implied by this product.

Purchase processing saves the pending shield, durably debits the profile wallet,
then confirms protection. The night cannot progress while the debit is pending.
A repeated operation uses its existing receipt instead of charging again.

## Premium challenges

`BetrayalsChallengeGame` receives `premiumGames` from Betrayals ownership and
captures the selected experience, participant field and seed when a competition
starts. A purchase or restore arriving during play cannot restart the game or
change its active variant. The next eligible challenge can use the new access.

| Challenge                 | VIP experience used in Betrayals                                                      |
| ------------------------- | ------------------------------------------------------------------------------------- |
| Quick Tap Race            | Actual shared VIP wrapper: three 25-second rounds, shared rules and VIP AI simulation |
| Quick Tap Race 2: Seasons | Actual VIP Seasons variant: three 28-second rounds and its seasonal rules             |
| Deck of Light             | Existing premium card/tool presentation; Betrayals keeps independent parallel boards  |
| Risk Wheel                | Existing premium wheel presentation                                                   |
| Crystal Path              | Existing `premium` presentation prop                                                  |
| Crystal Path: Infinity    | Existing `premium` presentation prop                                                  |
| Chain of Greed            | Existing premium presentation; Betrayals keeps Solo Rush                              |
| Deck of Darkness          | Existing premium presentation and current competitive AI configuration                |
| Majority Rules            | Existing premium studio/content treatment                                             |

The shared registry controls premium presentation availability, with an explicit
Majority Rules adapter because that component already supports a premium
treatment separately from its registry flag. The small-roster social games and
Risk Wheel: Abyss retain their edition-owned Betrayals artwork for all players;
that artwork is not advertised here as a newly exclusive VIP benefit.

Quick Tap VIP results report the entire field's actual VIP scores and ordering.
The host never compares a played VIP human result against classic AI scores.
The completion carries its frozen variant to `scoreField`; only the season-pot
target is scaled for the longer active duration (75/30 for Race, 84/40 for
Seasons). Raw scores and placements stay intact. The rules modal uses the
variant's actual round count and duration.

Existing edition adaptations remain in place: the actual Betrayals participants
and seed are used, private Safety aliases stay private, Battery Low vote effects
remain disabled, and competition results flow back through Betrayals' challenge
resolver. Purchased access does not grant the challenge prize automatically.

## Automatic advertising schedule

These are in-game-day boundaries, not real-world daily frequency caps. No
additional elapsed-time cooldown or every-other-day rule is introduced.

| Placement                    | Exact boundary                                                                                                                                                  |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `betrayals_banishment_break` | Once after an ordinary banishment result and its queued presentation have closed                                                                                |
| `betrayals_murder_break`     | Once after the completed night/murder result and its queued presentation have closed                                                                            |
| `betrayals_final_vote_break` | After each completed Final Five vote: a banishment, a closed tied-vote count before a runoff, or an End Season vote, including the vote that settles the season |

An ordinary day has the two banishment/night slots. A shield-prevented murder
still completes the night slot. If a night result leaves five guests, its break
belongs to the ordinary night just completed. Final Five banishment uses one
final-vote slot instead of also adding an ordinary banishment slot.

The engine transition creates `Run.pendingAdBreak`. The screen waits for all
associated cinematics/results to close before requesting the ad. A durable
receipt keyed by run, day, event kind and event ID is claimed before native UI
opens. Ordinary day keys do not repeat on rewind; individual final votes have
distinct IDs. Reloading or invoking a result callback twice cannot stack the
same commercial.

VIP and standalone No Ads suppress all three automatic placements. Optional
rewarded actions remain voluntary. The break screen prevents game interaction
while the native ad is pending. Missing inventory, an absent native bridge,
failed storage or a native failure allows the game to continue. A 45-second
fallback releases a stuck request and invalidates late native loading. Unmounts
and run switches cancel the old continuation; an old callback cannot advance a
different run. An automatic ad never awards a prize or makes progression depend
on ad completion.

### AdMob activation

The three placement strings are application-level routing identifiers. The
existing bridge routes all interstitial placements through the configured native
interstitial unit; this change does not create three new units in AdMob.

For each platform, configure the correct Betrayals AdMob app and unit IDs using
`VITE_ADMOB_APP_ID`, `VITE_ADMOB_INTERSTITIAL_ID`, and
`VITE_ADMOB_REWARDED_ID`, with `VITE_ADMOB_MODE=live` only for a live build. A
separate `VITE_ADMOB_CONTEXTUAL_INTERSTITIAL_ID` is required for contextual
automatic ads when that audience treatment applies. The shared privacy and
audience guards remain authoritative; optional rewarded ads retain their
existing audience restrictions. `test` mode uses Google's platform demo units
and does not produce live advertising revenue.

The built-in bridge returns `Promise<boolean>` after native dismissal/failure.
Any alternative native wrapper used with the Betrayals coordinator must preserve
that completion contract. A legacy void-returning bridge cannot report the
actual dismissal boundary.

## Purchase recovery and delivery

Permanent purchases are reconciled from the native store's current entitlements,
including VIP upgrade SKUs. Restore purchases restores permanent features for
the platform account. A permanent purchase made in the original Big Eye is a
different app product and is not reused as a Betrayals unlock.

Eyeros checkout captures its destination profile. Currency delivery retains the
native transaction receipt and profile grant before consuming/finishing the
store transaction. An unfinished transaction can be recovered; an already
consumed pack is not re-granted by ordinary Restore purchases. Permanent-product
refunds and revocations are reconciled from current native entitlements.
Reversing consumed Eyeros after a refund or chargeback requires a backend ledger
and store notifications; that recovery flow is not implemented here.

The Eyeros wallet and receipts are device-local in this implementation. Spent or
consumed packs are not restored after reinstalling or moving to another device;
the shop states this before purchase. There is no new cloud wallet or server
receipt-verification backend in this change. Cross-device currency recovery
would require a separate account-ledger implementation.

## Production activation still required

Create the permanent, consumable and upgrade products in the correct Betrayals
App Store Connect and Google Play apps, configure localized prices and purchase
types, and complete each store's product/release submission. Configure the
Betrayals AdMob IDs and live consent setup separately. Code and a merged PR do
not perform those external actions.

Before a monetizing release, use physical-device sandbox/license-test purchases
to verify successful/cancelled/pending checkout, restored permanent ownership,
each VIP discount tier, currency delivery after interruption, profile switching
during checkout, and native ad dismissal/No Ads suppression. The local unit
tests cover policy and callback behavior; they do not certify a live store
catalog, real ad inventory or a successful financial transaction.

Repository gates remain `npm run check:pr` after the final edit plus the targeted
Betrayals commerce, economy, ad and challenge-adapter tests. If dependency
manifests change, also run the repository's required production dependency audit.

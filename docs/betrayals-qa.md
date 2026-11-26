# Betrayals QA

Run `npx vite --mode betrayals-qa` from the repository to open the local QA site at [127.0.0.1:4392](http://127.0.0.1:4392/).

For a compiled QA build, run `npx vite build --mode betrayals-qa`, then `npx vite preview --mode betrayals-qa`. The QA output lives in `dist-betrayals-qa`. Use port 4392 for QA so its browser saves stay separate from other local previews.

- Choose a test profile and any look. VIP, My Pulse, Reality Mode, Drama Mode, premium challenge versions, and paid looks are available. Season modes still use the normal game settings.
- Before starting a season, use **QA starting role** to pick Loyal, Betrayer, a Castle Role, or a random deal. **Use season settings** runs the normal role draw. **Standard season** switches Castle Roles off for that run.
- Open **QA** above the castle TV, at the Round Table, or in the Conclave. Inspect the full cast or simulate a phase, a day, or the rest of the season. Simulation advances the saved season, skips optional player powers, and preserves the existing Eyeros ledger.
- In **Store → Wallet → Top up**, choose a pack and select **Simulate top-up**. The adjustment is credited to the selected test profile. Automatic ads are disabled, and eligible optional rewards can use simulated ads.

## Private hosting

The **Deploy private Betrayals QA** workflow is manual and deploys from `main`. Set up a dedicated Cloudflare Pages Direct Upload project and protect the custom domain, project `pages.dev` hostname, and wildcard preview hostnames with Cloudflare Access before enabling it. Verify the signed-out gate on each hostname. Configure the `betrayals-qa` GitHub environment with `CLOUDFLARE_QA_ACCESS_CONFIGURED=true`, `CLOUDFLARE_QA_PAGES_PROJECT`, `CLOUDFLARE_ACCOUNT_ID`, and the `CLOUDFLARE_API_TOKEN` secret scoped to Cloudflare Pages.

Use a separate hostname from production. QA uses local test data and ignores the production Vite environment, including Supabase credentials. The production GitHub Pages workflow continues to build the release from `dist`.

## Internal TestFlight

**Build Betrayals QA for TestFlight** runs on pushes to `main` and can be started manually on a `release/testflight-*` branch. It validates the selected source, syncs the isolated QA bundle to Capacitor, and uses Xcode to archive, sign, and upload an Internal Only build. The QA build disables the native ad bridge and uses simulated purchases.

Configure the signing and upload inputs in the Betrayals repository's Actions secrets. The Apple Distribution identity and App Store Connect API key may be reused if their access covers this app. Supply an App Store distribution provisioning profile specifically for `com.georgicole.thebigeye.betrayals`.

| Secrets                                                        | Purpose                                  |
| -------------------------------------------------------------- | ---------------------------------------- |
| `IOS_DISTRIBUTION_P12_BASE64`, `IOS_DISTRIBUTION_P12_PASSWORD` | Apple Distribution signing identity      |
| `IOS_PROVISIONING_PROFILE_BASE64`                              | Betrayals App Store distribution profile |
| `ASC_API_ISSUER_ID`, `ASC_API_KEY_ID`, `ASC_API_KEY_P8_BASE64` | App Store Connect upload access          |

After Apple processes the first build, complete its export-compliance review and assign it to **Betrayals QA** in [TestFlight](https://appstoreconnect.apple.com/teams/784da51c-4744-46ce-83d3-dfca3ce1152c/apps/6839538320/testflight). The original Big Eye's approved declaration and internal tester group are app-specific. Once the declaration is approved, record its build ID and reviewed input hashes in `scripts/betrayals-testflight-readiness-policy.json`, using the same schema as the existing readiness policy. Future runs will verify the declaration, add the exact processed build to **Betrayals QA**, and confirm internal availability.

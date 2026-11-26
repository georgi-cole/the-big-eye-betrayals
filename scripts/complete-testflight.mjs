import { appendFile, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import {
  completeTestFlight,
  createAppleClient,
  verifyEncryptionInputs,
} from './lib/testflight-readiness.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const args = process.argv.slice(2)
const betrayals = args.includes('--betrayals')
const checkOnly = args.includes('--check-policy')
if (args.some((arg) => arg !== '--betrayals' && arg !== '--check-policy'))
  throw new Error('Use --betrayals for Betrayals and --check-policy to validate without uploading.')
const policyName = betrayals
  ? 'betrayals-testflight-readiness-policy.json'
  : 'testflight-readiness-policy.json'
const policy = JSON.parse(await readFile(new URL(policyName, import.meta.url), 'utf8'))
if (
  betrayals &&
  (policy.appId !== '6839538320' ||
    policy.internalGroupId !== 'd7a334e3-0eba-4c19-aeee-5609861042df')
)
  throw new Error('The Betrayals policy must target the Betrayals app and internal QA group.')
await verifyEncryptionInputs(root, policy)
if (checkOnly) {
  console.log('TestFlight encryption inputs match the user-approved baseline.')
} else {
  const api = createAppleClient({
    issuerId: process.env.ASC_API_ISSUER_ID,
    keyId: process.env.ASC_API_KEY_ID,
    privateKeyBase64: process.env.ASC_API_KEY_P8_BASE64,
  })
  const result = await completeTestFlight({
    api,
    policy,
    buildNumber: process.env.IOS_BUILD_NUMBER,
  })
  const summary = `## TestFlight ready\n- Build: ${result.buildNumber}\n- Status: ${result.internalBuildState}\n- Group: ${betrayals ? 'Betrayals QA' : 'The Big Eye Internal'}\n- Reused the completed encryption answer from approved build ${policy.approvedBuildId}.\n`
  console.log(summary)
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary)
}

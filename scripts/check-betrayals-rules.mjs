import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const repo = new URL('../', import.meta.url)
const reviewFile = new URL('src/betrayals/rules-review.json', repo)
const rulesSources = [
  'src/betrayals/BetrayalsRules.tsx',
  'src/betrayals/BetrayalsScreen.tsx',
  'src/betrayals/allianceRecords.ts',
  'src/betrayals/challengeRotation.ts',
  'src/betrayals/challenges.ts',
  'src/betrayals/daySocial.ts',
  'src/betrayals/economy.ts',
  'src/betrayals/generalSocial.ts',
  'src/betrayals/incoming.ts',
  'src/betrayals/investigation.ts',
  'src/betrayals/night.ts',
  'src/betrayals/nightShields.ts',
  'src/betrayals/premiumAccess.ts',
  'src/betrayals/publicShield.ts',
  'src/betrayals/run.ts',
  'src/betrayals/seasonPhases.ts',
  'src/betrayals/seasonRewards.ts',
  'src/betrayals/settlement.ts',
  'src/betrayals/shieldSocial.ts',
  'src/betrayals/social.ts',
  'src/betrayals/socialResources.ts',
  'src/betrayals/table.ts',
  'src/services/ads/adsService.ts',
  'src/social/socialResourceCalibration.ts',
  'src/social/socialResourceEconomy.ts',
]

function fingerprint(path) {
  const source = readFileSync(new URL(path, repo), 'utf8').replaceAll('\r\n', '\n')
  return createHash('sha256').update(source).digest('hex')
}

const current = Object.fromEntries(rulesSources.map((path) => [path, fingerprint(path)]))
const args = process.argv.slice(2)
if (args.length === 1 && args[0] === '--record-reviewed') {
  writeFileSync(reviewFile, JSON.stringify(current, null, 2) + '\n')
  console.log('Recorded the reviewed Betrayals rules and game flow.')
} else if (args.length === 0) {
  const reviewed = JSON.parse(readFileSync(reviewFile, 'utf8'))
  const changed = [...new Set([...Object.keys(reviewed), ...Object.keys(current)])].filter(
    (path) => reviewed[path] !== current[path]
  )
  if (changed.length === 0) {
    console.log('Betrayals rules review is current.')
  } else {
    console.error('Betrayals rules review required. Changed sources:')
    console.error(changed.map((path) => `  ${path}`).join('\n'))
    console.error(
      'Check these changes against BetrayalsRules.tsx and update the guide where needed. ' +
        'Then run node scripts/check-betrayals-rules.mjs --record-reviewed.'
    )
    process.exitCode = 1
  }
} else {
  console.error('Usage: node scripts/check-betrayals-rules.mjs [--record-reviewed]')
  process.exitCode = 1
}

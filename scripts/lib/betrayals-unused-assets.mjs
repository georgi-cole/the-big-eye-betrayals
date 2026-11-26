import { readFile, readdir, realpath, unlink } from 'node:fs/promises'
import path from 'node:path'

const originalOnlyDirectories = [
  'assets/credits/',
  'assets/diary-room/',
  'assets/season-recap-moments/',
  'assets/tabloid_photos/',
  'assets/tribunal/',
  'assets/twin-shock/',
  'minigames/twin-remastered/',
]

const originalOnlyFiles = new Set([
  'assets/cinematic-backgrounds/tribunal-chamber.webp',
  'assets/finale_stage/final-two-hub-living-room.webp',
  'assets/music/jury_voting.mp3',
  'assets/music/move into me confessional.mp3',
  'assets/music/move into me instrumental general.mp3',
  'assets/music/public_voting.mp3',
  'assets/music/season_recap.mp3',
  'assets/music/weekend_1.mp3',
  'assets/music/weekend_2.mp3',
  'assets/music/weekend_3.mp3',
  'assets/sounds/cinematic/Twin_shock_presentation.mp4',
  'config/afterTheEyeOutcomes.json',
  'config/credits.json',
  'iphone-simulator.html',
  'vite.svg',
])

// Betrayals still uses front poses, rear poses and walk atlases at Round Table.
const originalOnlyCeremonyPose =
  /^assets\/ceremonies\/characters\/[^/]+\/ceremony-(?:decision-back|royal-seated|royal-standing(?:-r2)?|safety-knight)\.webp$/

function isWithin(parent, child) {
  const relative = path.relative(parent, child)
  return relative !== '' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)
}

export async function excludeBetrayalsUnusedAssets(root, outputDirectory) {
  const project = await realpath(root)
  const source = await realpath(path.join(project, 'public'))
  const output = await realpath(outputDirectory)
  if (
    !isWithin(project, output) ||
    source === output ||
    isWithin(source, output) ||
    isWithin(output, source)
  ) {
    throw new Error('Betrayals output must be inside the project and separate from public assets.')
  }

  const entries = await readdir(output, { recursive: true, withFileTypes: true })
  if (entries.some((entry) => entry.isSymbolicLink())) {
    throw new Error('Unexpected symbolic link in Betrayals build output.')
  }

  const excludedPaths = []
  let excludedBytes = 0
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const target = path.join(entry.parentPath, entry.name)
    const relative = path.relative(output, target).split(path.sep).join('/')
    if (
      !originalOnlyFiles.has(relative) &&
      !originalOnlyDirectories.some((prefix) => relative.startsWith(prefix)) &&
      !originalOnlyCeremonyPose.test(relative)
    ) {
      continue
    }
    const original = await readFile(path.join(source, relative))
    const bundled = await readFile(target)
    if (!original.equals(bundled))
      throw new Error(`Unexpected bundled Betrayals asset: ${relative}`)
    await unlink(target)
    excludedPaths.push(relative)
    excludedBytes += bundled.length
  }
  return { excludedPaths, excludedBytes }
}

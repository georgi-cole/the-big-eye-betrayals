import { readFile, readdir, realpath, unlink } from 'node:fs/promises'
import path from 'node:path'

export const BETRAYALS_STREAMED_TRACKS = [
  'inside-the-castle-quietly-suspenseful.mp3',
  'introhub-main-the-four-note-motif.mp3',
  'loyals-win-the-final-chord.mp3',
  'the-betrayers-win-the-hollow-withdrawal.mp3',
  'the-conclave-the-hollow-withdrawal.mp3',
  'the-murder-the-castles-final-bell.mp3',
  'the-round-table-candlelit-intrigue.mp3',
].map((name) => `assets/betrayals/music/streamed/${name}`)

const isWithin = (parent, candidate) => {
  const relative = path.relative(parent, candidate)
  return Boolean(relative) && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

async function publicFiles(directory, prefix = '') {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`Unexpected public symlink: ${entry.name}`)
    const relative = `${prefix}${entry.name}`
    if (entry.isDirectory())
      files.push(...(await publicFiles(path.join(directory, entry.name), `${relative}/`)))
    else if (entry.isFile()) files.push(relative)
  }
  return files
}

async function resolveDirectories(root, outputDirectory) {
  const output = await realpath(outputDirectory)
  const source = await realpath(path.join(root, 'public'))
  if (!isWithin(path.resolve(root), output) || !isWithin(path.resolve(root), source)) {
    throw new Error('Mobile output and public source must stay inside the project root.')
  }
  if (output === source || isWithin(source, output) || isWithin(output, source)) {
    throw new Error('Mobile output must be separate from public source assets.')
  }
  return { output, source }
}

/** Remove only the seven full-length tracks from native output, retaining offline excerpts. */
export async function excludeMobileBetrayalsSoundtrack(
  root,
  outputDirectory,
  previouslyExcluded = []
) {
  const { output, source } = await resolveDirectories(root, outputDirectory)
  let excludedBytes = 0
  for (const file of BETRAYALS_STREAMED_TRACKS) {
    const original = await readFile(path.join(source, file))
    const target = path.join(output, file)
    const bundled = await readFile(target)
    if (!original.equals(bundled)) throw new Error(`Unexpected generated soundtrack: ${file}`)
    excludedBytes += original.length
    await unlink(target)
  }
  const verification = await verifyMobileBetrayalsSoundtrack(root, output, previouslyExcluded)
  return {
    excludedFiles: BETRAYALS_STREAMED_TRACKS.length,
    excludedBytes,
    retainedFiles: verification.retainedFiles,
  }
}

/** Verify full tracks are absent and every other public asset stays byte-identical. */
export async function verifyMobileBetrayalsSoundtrack(
  root,
  outputDirectory,
  previouslyExcluded = []
) {
  const { output, source } = await resolveDirectories(root, outputDirectory)
  const excluded = new Set([...BETRAYALS_STREAMED_TRACKS, ...previouslyExcluded])
  const outputSet = new Set(await publicFiles(output))
  for (const file of BETRAYALS_STREAMED_TRACKS) {
    if (outputSet.has(file)) throw new Error(`Full Betrayals track still bundled: ${file}`)
  }
  let retainedFiles = 0
  for (const file of await publicFiles(source)) {
    if (excluded.has(file)) continue
    const original = await readFile(path.join(source, file))
    const retained = await readFile(path.join(output, file))
    if (!original.equals(retained)) throw new Error(`Bundled public asset changed: ${file}`)
    retainedFiles += 1
  }
  return { retainedFiles }
}

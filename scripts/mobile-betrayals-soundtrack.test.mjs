import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  BETRAYALS_STREAMED_TRACKS,
  excludeMobileBetrayalsSoundtrack,
  verifyMobileBetrayalsSoundtrack,
} from './lib/mobile-betrayals-soundtrack.mjs'

test('native packaging streams full tracks and retains compact offline fallbacks', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'mobile-betrayals-soundtrack-'))
  t.after(async () => {
    assert.equal(path.dirname(root), path.resolve(tmpdir()))
    assert.ok(path.basename(root).startsWith('mobile-betrayals-soundtrack-'))
    await rm(root, { recursive: true, force: true })
  })
  const write = async (file, data) => {
    const target = path.join(root, file)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, data)
  }

  for (const file of BETRAYALS_STREAMED_TRACKS) await write(`public/${file}`, `full:${file}`)
  for (const file of BETRAYALS_STREAMED_TRACKS) {
    const fallback = file.replace('/streamed/', '/offline/')
    await write(`public/${fallback}`, `offline:${file}`)
  }
  await write('public/assets/sounds/confirmation.wav', 'retained UI sound')

  const output = path.join(root, 'dist')
  await cp(path.join(root, 'public'), output, { recursive: true })
  await assert.rejects(verifyMobileBetrayalsSoundtrack(root, output), /still bundled/)
  const result = await excludeMobileBetrayalsSoundtrack(root, output)
  assert.deepEqual(result, {
    excludedFiles: BETRAYALS_STREAMED_TRACKS.length,
    excludedBytes: BETRAYALS_STREAMED_TRACKS.reduce(
      (sum, file) => sum + Buffer.byteLength(`full:${file}`),
      0
    ),
    retainedFiles: BETRAYALS_STREAMED_TRACKS.length + 1,
  })

  for (const file of BETRAYALS_STREAMED_TRACKS) {
    await assert.rejects(readFile(path.join(output, file)), { code: 'ENOENT' })
    const fallback = file.replace('/streamed/', '/offline/')
    assert.equal(await readFile(path.join(output, fallback), 'utf8'), `offline:${file}`)
  }
  assert.equal(
    await readFile(path.join(output, 'assets/sounds/confirmation.wav'), 'utf8'),
    'retained UI sound'
  )
  await assert.rejects(
    excludeMobileBetrayalsSoundtrack(root, path.join(root, 'public')),
    /separate from public/
  )
  await write('dist/assets/sounds/confirmation.wav', 'damaged')
  await assert.rejects(verifyMobileBetrayalsSoundtrack(root, output), /changed/)
})

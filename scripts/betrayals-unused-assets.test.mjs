import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { excludeBetrayalsUnusedAssets } from './lib/betrayals-unused-assets.mjs'

test('Betrayals packaging prunes legacy media and preserves shared gameplay media', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'betrayals-unused-assets-'))
  t.after(async () => {
    assert.equal(path.dirname(root), path.resolve(tmpdir()))
    assert.ok(path.basename(root).startsWith('betrayals-unused-assets-'))
    await rm(root, { recursive: true, force: true })
  })

  const source = path.join(root, 'public')
  const output = path.join(root, 'dist')
  const removed = [
    'assets/credits/big-eye-cinematic-background.mp4',
    'assets/music/weekend_2.mp3',
    'assets/music/move into me confessional.mp3',
    'assets/ceremonies/characters/pax/ceremony-royal-standing-r2.webp',
    'minigames/twin-remastered/part2/index.html',
  ]
  const retained = [
    'assets/music/final_three_week.mp3',
    'assets/ceremonies/characters/pax/ceremony-front.webp',
    'assets/ceremonies/characters/pax/ceremony-exit-back.webp',
    'assets/ceremonies/walks/pax.webp',
    'assets/minigames/boxed-out/stage.webp',
    'assets/sounds/cinematic/HousematesBio.mp4',
  ]
  for (const file of [...removed, ...retained]) {
    const target = path.join(source, file)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, file)
  }
  await cp(source, output, { recursive: true })

  const audit = await excludeBetrayalsUnusedAssets(root, output)
  assert.deepEqual(audit.excludedPaths.sort(), removed.slice().sort())
  assert.equal(
    audit.excludedBytes,
    removed.reduce((bytes, file) => bytes + Buffer.byteLength(file), 0)
  )
  for (const file of retained) assert.equal(await readFile(path.join(output, file), 'utf8'), file)
  for (const file of removed) {
    assert.equal(await readFile(path.join(source, file), 'utf8'), file)
    await assert.rejects(readFile(path.join(output, file)), { code: 'ENOENT' })
  }
  await assert.rejects(excludeBetrayalsUnusedAssets(root, source), /separate from public assets/)
})

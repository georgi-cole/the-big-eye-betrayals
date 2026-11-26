import { expect, test } from '@playwright/test'

test.use({ reducedMotion: 'reduce' })

for (const { width, height, topInset, bottomInset } of [
  { width: 320, height: 568, topInset: 20, bottomInset: 0 },
  { width: 390, height: 844, topInset: 47, bottomInset: 34 },
  { width: 402, height: 874, topInset: 59, bottomInset: 34 },
  { width: 500, height: 900, topInset: 59, bottomInset: 34 },
  { width: 844, height: 390, topInset: 0, bottomInset: 21 },
]) {
  test(`Betrayals intro fills the viewport at ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.goto('./#/betrayals')
    await page.addStyleTag({
      content: `:root { --safe-area-inset-top: ${topInset}px; --safe-area-inset-bottom: ${bottomInset}px; }`,
    })

    const home = page.locator('.betrayals-home')
    const primary = home.getByRole('button', { name: 'Create profile', exact: true })
    const shortcuts = home.getByRole('navigation', { name: 'Game controls' })
    await expect(primary).toBeVisible()
    await expect(primary).toHaveCSS(
      'background-image',
      /^url\("[^"]+entrance-primary-plaque\.png"\)$/
    )
    await expect(shortcuts).toBeInViewport({ ratio: 1 })

    for (const layer of [home, home.locator('.betrayals-home__scene')]) {
      const bounds = await layer.evaluate((element) => {
        const { left, top, right, bottom } = element.getBoundingClientRect()
        return [left, top, right, bottom].map(Math.round)
      })
      expect(bounds).toEqual([0, 0, width, height])
    }
    const bottomGap = await shortcuts.evaluate((element) => {
      return innerHeight - element.getBoundingClientRect().bottom
    })
    expect(bottomGap).toBeGreaterThanOrEqual(bottomInset)
    expect(bottomGap).toBeLessThanOrEqual(bottomInset + 12)
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(height)
  })
}

test('Betrayals keeps the season controls reachable on a short phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./#/betrayals')
  await page.getByRole('button', { name: 'Create profile', exact: true }).click()
  await page.getByRole('button', { name: 'Choose this look' }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByLabel('Display Name').fill('Georgi')
  await page.getByLabel(/^Age/).fill('38')
  await page.getByLabel(/^Location/).fill('Sofia')
  await page.getByLabel('Sex (Reality storylines)').selectOption('Male')
  await page.getByRole('button', { name: 'Save Profile', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'My profile' })).toBeVisible()
  await page.getByRole('button', { name: 'Go back', exact: true }).click()
  await page.getByRole('button', { name: 'Start season' }).click()

  const game = page.locator('.betrayals-layout--game')
  const board = game.locator('.betrayals-board')
  const dock = page.getByRole('navigation', { name: 'Season actions' })
  const lastSeat = page.getByRole('list', { name: 'Contestant roster' }).getByRole('button').last()
  await expect(dock).toBeVisible()

  await page.setViewportSize({ width: 320, height: 500 })
  await page.addStyleTag({
    content: ':root { --app-safe-area-top-fallback: 47px; --safe-area-inset-bottom: 34px; }',
  })
  await expect(game).toHaveCSS('padding-top', '47px')
  await expect(dock).toBeInViewport({ ratio: 1 })
  const dockBottom = await dock.evaluate((element) => element.getBoundingClientRect().bottom)
  expect(dockBottom).toBeLessThanOrEqual(500 - 34)
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(500)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
  expect(await board.evaluate((element) => element.scrollHeight)).toBeGreaterThan(
    await board.evaluate((element) => element.clientHeight)
  )

  await board.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect(lastSeat).toBeInViewport({ ratio: 1 })
  const seat = (await lastSeat.boundingBox())!
  const actions = (await dock.boundingBox())!
  expect(seat.height).toBeGreaterThanOrEqual(44)
  expect(seat.y + seat.height).toBeLessThanOrEqual(actions.y)

  const phase = await game.getAttribute('data-phase')
  const rotate = page.getByRole('heading', { name: 'Rotate your device' })
  await page.setViewportSize({ width: 844, height: 390 })
  await expect(rotate).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(rotate).toBeHidden()
  await expect(game).toHaveAttribute('data-phase', phase!)
  await expect(dock).toBeInViewport({ ratio: 1 })
})

test('Betrayals starts a new store route at the top inside the safe area', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 500 })
  await page.goto('./#/store/features')
  await page.addStyleTag({
    content:
      ':root { --app-safe-area-top-fallback: 47px; --safe-area-inset-left: 24px; --safe-area-inset-right: 16px; }',
  })

  const shell = page.locator('.betrayals-profile-shell')
  const shop = page.locator('.betrayals-shop-page')
  await expect(page.getByRole('heading', { name: 'Betrayals Store' })).toBeVisible()
  await expect(shop).toHaveCSS('padding-top', '47px')
  await expect(shell).toHaveCSS('padding-left', '24px')
  await expect(shell).toHaveCSS('padding-right', '16px')
  const previousOffset = await shell.evaluate((element) => {
    element.scrollTop = element.scrollHeight
    return element.scrollTop
  })
  expect(previousOffset).toBeGreaterThan(0)

  await page.evaluate(() => {
    location.hash = '#/store/features?view=features'
  })
  await expect(page).toHaveURL(/view=features$/)
  await expect.poll(() => shell.evaluate((element) => element.scrollTop)).toBe(0)
  await expect(page.getByRole('button', { name: 'Back to game' })).toBeInViewport({ ratio: 1 })
})

import { expect, test } from '@playwright/test'

for (const viewport of [
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  test(`Betrayals opens with a five-column cast at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('./#/betrayals')
    await expect(page.getByRole('button', { name: 'Music' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Store' })).toBeVisible()
    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
    await page.getByRole('button', { name: 'Close settings' }).click()
    await page.getByLabel('Your name').fill('Georgi')
    await page.getByRole('button', { name: 'Start season' }).click()
    const television = page.getByRole('region', { name: 'Faux TV' })
    const dock = page.getByRole('navigation', { name: 'Season actions' })
    await expect(television.getByRole('heading', { name: 'Your role' })).toBeVisible()
    await expect(dock.getByRole('button', { name: 'Music' })).toBeVisible()
    await expect(dock.getByRole('button', { name: 'Store' })).toBeVisible()

    const roster = page.getByRole('list', { name: 'Contestant roster' })
    const tiles = roster.getByRole('button')
    await expect(tiles).toHaveCount(25)

    const layout = await tiles.evaluateAll((elements) => {
      const rects = elements.map((element) => element.getBoundingClientRect())
      return {
        columns: new Set(rects.map(({ left }) => Math.round(left))).size,
        rows: new Set(rects.map(({ top }) => Math.round(top))).size,
        minWidth: Math.min(...rects.map(({ width }) => width)),
        bottom: Math.max(...rects.map(({ bottom }) => bottom)),
        windowHeight: window.innerHeight,
        width: document.documentElement.scrollWidth,
        windowWidth: window.innerWidth,
      }
    })
    expect(layout.columns).toBe(5)
    expect(layout.rows).toBe(5)
    expect(layout.minWidth).toBeGreaterThanOrEqual(44)
    expect(layout.width).toBeLessThanOrEqual(layout.windowWidth)
    if (viewport.width === 390) expect(layout.bottom).toBeLessThanOrEqual(layout.windowHeight)
    await expect
      .poll(async () =>
        roster
          .locator('img')
          .evaluateAll(
            (images) =>
              images.filter((image) => image instanceof HTMLImageElement && image.naturalWidth > 0)
                .length
          )
      )
      .toBe(24)

    await dock.getByRole('button', { name: 'Play: open Day 1' }).click()
    await expect(page.getByRole('dialog')).toHaveAttribute('data-scene', 'sunrise')
    await page.reload()
    await expect(page.getByRole('dialog')).toHaveAttribute('data-scene', 'sunrise')
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Skip cinematic|Continue/ })
      .click()
    await expect(television.getByRole('heading', { name: 'Dawn' })).toBeVisible()
    await dock.getByRole('button', { name: 'Play: enter Social' }).click()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Skip cinematic|Continue/ })
      .click()
    await dock.getByRole('button', { name: /^Social/ }).click()
    await expect(page.getByRole('dialog', { name: 'Social' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Social' })).toHaveCount(0)
    await expect(tiles).toHaveCount(25)
  })
}

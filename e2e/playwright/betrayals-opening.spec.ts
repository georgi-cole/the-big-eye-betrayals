import { expect, test } from '@playwright/test'

for (const viewport of [
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  test(`Betrayals opens with a five-column cast at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('./#/betrayals')
    await page.getByLabel('Your name').fill('Georgi')
    await page.getByRole('button', { name: 'Start season' }).click()
    await expect(page.getByRole('heading', { name: 'Your role' })).toBeVisible()

    const roster = page.getByRole('list', { name: 'Active contestants' })
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

    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByRole('heading', { name: 'Dawn' })).toBeVisible()
  })
}

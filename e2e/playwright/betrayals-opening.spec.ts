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
    await expect(dock.getByRole('button', { name: 'Music' })).toHaveCount(0)
    await expect(dock.getByRole('button', { name: 'Store' })).toHaveCount(0)
    const inboxButton = dock.getByRole('button', { name: /^Incoming requests/ })
    const incoming = page.getByRole('dialog', { name: 'Incoming interactions' })
    await expect(dock.locator('[data-target="social"] + [data-target="incoming"]')).toBeVisible()
    await expect(inboxButton).toHaveAccessibleName('Incoming requests')
    await inboxButton.click()
    await expect(incoming.getByText('No incoming interactions.')).toBeVisible()
    await incoming.getByRole('button', { name: 'Close inbox' }).click()
    await dock.getByRole('button', { name: 'Settings' }).click()
    const settings = page.getByRole('dialog', { name: 'Settings' })
    await expect(settings.getByRole('switch', { name: 'Music' })).toBeVisible()
    await settings.getByRole('button', { name: 'Close settings' }).click()

    await dock.getByRole('button', { name: 'Home' }).click()
    await expect(page.getByRole('heading', { name: 'Betrayals' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Start season' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Store' }).click()
    await expect(page.getByRole('dialog', { name: 'Store' })).toBeVisible()
    await page.getByRole('button', { name: 'Close store' }).click()
    await page.getByRole('button', { name: 'Continue season' }).click()
    await expect(television.getByRole('heading', { name: 'Your role' })).toBeVisible()

    const social = page.getByRole('dialog', { name: 'Social', exact: true })
    const guestCards = social.getByRole('region', { name: 'Player roster' }).getByRole('button')
    const socialButton = dock.getByRole('button', { name: /^Social/ })
    await socialButton.click()
    await expect(guestCards).toHaveCount(24)
    await expect(guestCards.first()).toBeVisible()
    await guestCards.first().click()
    await expect(social.getByRole('heading', { level: 2 })).toBeVisible()
    await social.getByRole('button', { name: /Introduce yourself/ }).click()
    await expect(social.getByRole('button', { name: /Plan a vote/ })).toHaveCount(0)
    await social.getByRole('button', { name: 'Execute' }).click()
    await expect(social.getByLabel('Energy: 4')).toBeVisible()
    await expect(social.getByLabel('Influence: 3')).toBeVisible()
    await page.keyboard.press('Escape')
    await socialButton.click()
    await expect(guestCards).toHaveCount(24)
    await page.keyboard.press('Escape')

    const roster = page.getByRole('list', { name: 'Contestant roster' })
    const tiles = roster.getByRole('button')
    await expect(tiles).toHaveCount(25)
    const firstSeat = await tiles.first().boundingBox()

    const layout = await tiles.evaluateAll((elements) => {
      const rects = elements.map((element) => element.getBoundingClientRect())
      const dock = document.querySelector('.betrayals-dock')?.getBoundingClientRect()
      return {
        columns: new Set(rects.map(({ left }) => Math.round(left))).size,
        rows: new Set(rects.map(({ top }) => Math.round(top))).size,
        minWidth: Math.min(...rects.map(({ width }) => width)),
        minHeight: Math.min(...rects.map(({ height }) => height)),
        bottom: Math.max(...rects.map(({ bottom }) => bottom)),
        dockTop: dock?.top ?? 0,
        pageHeight: document.documentElement.scrollHeight,
        windowHeight: window.innerHeight,
        width: document.documentElement.scrollWidth,
        windowWidth: window.innerWidth,
      }
    })
    expect(layout.columns).toBe(5)
    expect(layout.rows).toBe(5)
    expect(layout.minWidth).toBeGreaterThanOrEqual(44)
    expect(layout.minHeight).toBeGreaterThanOrEqual(44)
    expect(layout.width).toBeLessThanOrEqual(layout.windowWidth)
    expect(layout.pageHeight).toBeLessThanOrEqual(layout.windowHeight)
    expect(layout.bottom).toBeLessThanOrEqual(layout.dockTop)
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
    expect(await tiles.first().boundingBox()).toEqual(firstSeat)
    await dock.getByRole('button', { name: 'Play: enter Social' }).click()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Skip cinematic|Continue/ })
      .click()
    await socialButton.click()
    await expect(social.getByLabel('Energy: 4')).toBeVisible()
    await guestCards.first().click()
    await social.getByRole('button', { name: /Build trust/ }).click()
    await social.getByRole('button', { name: 'Execute' }).click()
    await expect(social.getByLabel('Energy: 3')).toBeVisible()
    await expect(social.getByRole('status')).toContainText('You built trust')
    await page.keyboard.press('Escape')
    await expect(social).toHaveCount(0)
    await expect(inboxButton).toHaveAccessibleName('Incoming requests (1)')
    await inboxButton.click()
    await expect(incoming).toBeVisible()
    await incoming.getByRole('button', { name: 'Pass' }).first().click()
    await expect(incoming.getByLabel('Response').first()).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(incoming).toHaveCount(0)
    await expect(inboxButton).toHaveAccessibleName('Incoming requests')
    await dock.getByRole('button', { name: 'Play: begin Immunity Challenge' }).click()
    await socialButton.click()
    await guestCards.first().click()
    await expect(social.getByRole('button', { name: /Plan a vote/ })).toBeDisabled()
    await expect(social.getByLabel('Influence cost: 20')).toBeVisible()
    await expect(social.getByLabel('Info cost: 50')).toBeVisible()
    await expect(social.getByRole('button', { name: /Propose an alliance/ })).toHaveCount(0)
    await social.getByRole('button', { name: /Talk about the challenge/ }).click()
    await social.getByRole('button', { name: 'Execute' }).click()
    await expect(social.getByLabel('Energy: 2')).toBeVisible()
    await social.getByRole('button', { name: /Hear a suspicion/ }).click()
    await social.getByRole('button', { name: 'Execute' }).click()
    await expect(social.getByLabel('Energy: 1')).toBeVisible()
    await expect(social.getByLabel('Info: 100')).toBeVisible()
    await social.getByRole('button', { name: /Ask about a player/ }).click()
    const topics = social.getByRole('group', { name: 'Guest to discuss' })
    await expect(social.getByRole('button', { name: 'Execute' })).toBeDisabled()
    await topics.getByRole('button').first().click()
    await social.getByRole('button', { name: 'Execute' }).click()
    await expect(social.getByLabel('Energy: 0')).toBeVisible()
    await expect(social.getByLabel('Info: 150')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(tiles).toHaveCount(25)
  })
}

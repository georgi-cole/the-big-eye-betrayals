import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

async function wardrobe(betrayals = true) {
  vi.stubEnv('VITE_BETRAYALS_EDITION', String(betrayals))
  vi.resetModules()
  const appearance = await import('./betrayalsAppearance')
  const access = await import('../appearance/lookAccess')
  return { ...appearance, ...access }
}

describe('Betrayals expanded wardrobe', () => {
  it('preserves the three launch portraits and names while exposing all 35 looks', async () => {
    const catalog = await wardrobe()
    expect(catalog.BETRAYALS_PORTRAITS).toHaveLength(35)
    expect(new Set(catalog.BETRAYALS_LOOKS.map(({ id }) => id)).size).toBe(35)
    expect(catalog.BETRAYALS_PORTRAITS.slice(0, 3)).toEqual([
      { id: 'pc-005', name: 'The Envoy' },
      { id: 'pc-015', name: 'The Heiress' },
      { id: 'pc-025', name: 'The Insider' },
    ])
    for (const { id } of catalog.BETRAYALS_PORTRAITS) {
      expect(catalog.isBetrayalsLook(id)).toBe(true)
      expect(catalog.getBetrayalsPortrait(id)).toMatch(/\.webp(?:\?.*)?$/)
    }
    expect(catalog.isBetrayalsLook('unknown-look')).toBe(false)
  })

  it('offers five free choices and 30 permanent unlocks, with purchased ownership or VIP required', async () => {
    const catalog = await wardrobe()
    const free = catalog.BETRAYALS_LOOKS.filter(({ id }) => catalog.isFreeAppearanceLook(id))
    const paid = catalog.BETRAYALS_LOOKS.filter(({ id }) => catalog.isPaidAppearanceLook(id))
    expect(free.map(({ id }) => id)).toEqual(['pc-005', 'pc-015', 'pc-025', 'pc-001', 'pc-002'])
    expect(paid).toHaveLength(30)
    expect(catalog.APPEARANCE_LOOK_PRICE_EYEROS).toBe(30_000)
    for (const { id } of free) expect(catalog.hasAppearanceLookAccess(id, null, false)).toBe(true)
    for (const { id } of paid) {
      expect(catalog.hasAppearanceLookAccess(id, {}, false)).toBe(false)
      expect(catalog.hasAppearanceLookAccess(id, {}, true)).toBe(true)
    }
    const bought = { unlockedAppearanceLookIds: [paid[0].id] }
    expect(catalog.hasAppearanceLookAccess(paid[0].id, bought, false)).toBe(true)
    expect(catalog.hasAppearanceLookAccess(paid[1].id, bought, false)).toBe(false)
    expect(catalog.hasAppearanceLookAccess('unknown-look', {}, true)).toBe(false)
  })

  it('keeps the original edition’s first-five rule when Betrayals mode is disabled', async () => {
    const catalog = await wardrobe(false)
    expect(catalog.IS_BETRAYALS_EDITION).toBe(false)
    for (const id of ['pc-001', 'pc-002', 'pc-003', 'pc-004', 'pc-005']) {
      expect(catalog.isFreeAppearanceLook(id)).toBe(true)
    }
    expect(catalog.isFreeAppearanceLook('pc-015')).toBe(false)
    expect(catalog.isPaidAppearanceLook('pc-015')).toBe(true)
  })
})

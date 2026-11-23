import { describe, expect, it } from 'vitest'
import { observatorySky } from './observatoryWeather'

describe('observatory exterior', () => {
  it.each([
    [0, 'night'],
    [4, 'night'],
    [5, 'sunrise'],
    [7, 'morning'],
    [11, 'noon'],
    [14, 'afternoon'],
    [18, 'evening'],
    [21, 'night'],
  ])('picks its exterior plate at device-local hour %i', (hour, period) => {
    expect(observatorySky(new Date(2026, 10, 23, hour)).time).toBe(period)
  })

  it('rotates through the weather variations without changing the daypart', () => {
    const noon = Array.from({ length: 7 }, (_, day) =>
      observatorySky(new Date(2026, 10, 23 + day, 12))
    )
    expect(noon.every(({ time }) => time === 'noon')).toBe(true)
    expect(new Set(noon.map(({ sky }) => sky))).toEqual(
      new Set(['clear', 'clouds', 'mist', 'rain', 'storm', 'snow'])
    )
    expect(observatorySky(new Date(2026, 10, 23, 12, 59))).toEqual(noon[0])
    expect(observatorySky(new Date(2026, 10, 23, 13)).sky).not.toBe(noon[0].sky)
  })
})

import { describe, expect, it } from 'vitest'
import { getBetrayalsAccess } from './commerce/catalog'
import type { InvestigationAction } from './investigation'
import {
  canUseBetrayalsAction,
  canUseBetrayalsTableSway,
  investigationProductFor,
} from './premiumAccess'
import type { SocialEntry, TableSway } from './run'

describe('Betrayals premium action boundaries', () => {
  it('keeps ordinary conversations, relationship repair and existing shield management free', () => {
    const basic: SocialEntry['kind'][] = [
      'rapport',
      'question',
      'debrief',
      'mend-fences',
      'end-pact',
      'lay-low',
      'explore-castle',
      'shield-gift',
      'shield-request',
      'ask-shield',
    ]
    for (const kind of basic) {
      expect(canUseBetrayalsAction(kind, false), kind).toBe(true)
    }
  })

  it('requires Reality ownership or VIP for advanced strategy without treating Pulse or No Ads as that entitlement', () => {
    const strategy: SocialEntry['kind'][] = [
      'alliance',
      'vote-plan',
      'ask-about',
      'share-suspicion',
      'defend-guest',
      'ask-end',
      'group-chat',
      'eavesdrop',
      'found-alliance',
      'consult-alliance',
      'alliance-update',
      'shield-plans',
      'shield-claim',
      'shield-deny',
      'shield-tip',
    ]
    for (const owned of [{}, { myPulse: true }, { noAds: true }]) {
      const access = getBetrayalsAccess(owned)
      for (const kind of strategy)
        expect(canUseBetrayalsAction(kind, access.realityMode), kind).toBe(false)
    }
    for (const owned of [{ realityMode: true }, { vip: true }]) {
      const access = getBetrayalsAccess(owned)
      for (const kind of strategy)
        expect(canUseBetrayalsAction(kind, access.realityMode), kind).toBe(true)
    }
  })

  it('routes saved records and personal notes to My Pulse, and active investigations to Reality Mode', () => {
    const journal: InvestigationAction[] = [
      { kind: 'save', reportId: 'intel:1' },
      { kind: 'note', guestId: 'guest', note: { leaning: 'suspect', text: 'My own read.' } },
    ]
    const active: InvestigationAction[] = [
      { kind: 'observe', guestId: 'guest', focus: 'contacts' },
      { kind: 'ask', guestId: 'guest', speakerId: 'source' },
      { kind: 'source', reportId: 'intel:1' },
      { kind: 'confront', reportId: 'intel:1' },
      { kind: 'witness', reportId: 'intel:1' },
      { kind: 'watch', guestId: 'guest', speakerId: 'watcher' },
      { kind: 'share', reportId: 'intel:1', speakerId: 'ally', mode: 'attribute' },
    ]
    const pulse = getBetrayalsAccess({ myPulse: true })
    const reality = getBetrayalsAccess({ realityMode: true })
    const vip = getBetrayalsAccess({ vip: true })
    for (const action of journal) {
      const required = investigationProductFor(action)
      expect(required).toBe('myPulse')
      expect(pulse[required]).toBe(true)
      expect(reality[required]).toBe(false)
      expect(vip[required]).toBe(true)
    }
    for (const action of active) {
      const required = investigationProductFor(action)
      expect(required).toBe('realityMode')
      expect(reality[required]).toBe(true)
      expect(pulse[required]).toBe(false)
      expect(vip[required]).toBe(true)
    }
  })

  it('always allows voting and a careful basic contribution while gating advanced table tactics', () => {
    const ordinary: Array<TableSway | null> = [
      null,
      { targetId: 'guest', tone: 'careful' },
      { targetId: 'guest', tone: 'careful', stance: 'question' },
    ]
    const advanced: TableSway[] = [
      { targetId: 'guest', tone: 'forceful' },
      { targetId: 'guest', tone: 'careful', stance: 'defend' },
      { targetId: 'guest', tone: 'careful', evidence: 'name-source' },
      { targetId: 'guest', tone: 'careful', evidence: 'call-witness' },
      { targetId: 'guest', tone: 'careful', investigation: { reportId: 'intel:1' } },
      { targetId: 'guest', tone: 'careful', investigation: { reportId: 'intel:1', witness: true } },
    ]
    for (const choice of ordinary) {
      expect(canUseBetrayalsTableSway(choice, false)).toBe(true)
      expect(canUseBetrayalsTableSway(choice, true)).toBe(true)
    }
    for (const choice of advanced) {
      expect(canUseBetrayalsTableSway(choice, false)).toBe(false)
      expect(canUseBetrayalsTableSway(choice, true)).toBe(true)
    }
  })
})

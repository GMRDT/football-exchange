import { describe, expect, it } from 'vitest'
import en from '../messages/en.json'
import es from '../messages/es.json'

function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return flattenKeys(value as Record<string, unknown>, fullKey)
    }
    return fullKey
  })
}

describe('i18n key parity', () => {
  it('es.json has exactly the same keys as en.json', () => {
    const enKeys = flattenKeys(en as Record<string, unknown>).sort()
    const esKeys = flattenKeys(es as Record<string, unknown>).sort()

    const missingInEs = enKeys.filter((k) => !esKeys.includes(k))
    const extraInEs = esKeys.filter((k) => !enKeys.includes(k))

    expect(missingInEs, 'Keys in en.json missing from es.json').toEqual([])
    expect(extraInEs, 'Extra keys in es.json not in en.json').toEqual([])
  })
})

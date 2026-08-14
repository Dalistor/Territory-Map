import { describe, expect, it } from 'vitest'
import { SHARED_PLACEHOLDER } from './index'

// Smoke test only: proves the Vitest + TypeScript + jsdom setup works end to
// end. Task 02 (spec 0003) onward replaces this with real shared-domain tests.
describe('shared placeholder', () => {
  it('exists so the test runner has something to execute', () => {
    expect(SHARED_PLACEHOLDER).toBe('territory-map-admin-shared')
  })
})

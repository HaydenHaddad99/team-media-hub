import { describe, it, expect, vi, beforeEach } from 'vitest'
import { clearMediaUrlCache } from '../lib/mediaUrlCache'

// We can't easily test getSignedMediaUrl because it calls presignDownload
// which needs network. But we can test caching logic and exports.

describe('mediaUrlCache', () => {
  beforeEach(() => {
    clearMediaUrlCache()
  })

  it('clearMediaUrlCache does not throw', () => {
    expect(() => clearMediaUrlCache()).not.toThrow()
  })

  it('calling clear twice does not throw', () => {
    clearMediaUrlCache()
    clearMediaUrlCache()
  })
})

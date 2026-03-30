import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { applyThumbUrlCache, clearThumbUrlCache, parseCloudFrontExpiry } from '../lib/thumbUrlCache'
import type { MediaItem } from '../lib/api'

// Build a CloudFront-style signed URL with a specific Expires value
function cfUrl(expiresUnix: number): string {
  return `https://d1234.cloudfront.net/thumbnails/t1/m1/thumb.jpg?Expires=${expiresUnix}&Signature=abc&Key-Pair-Id=xyz`
}

function makeItem(mediaId: string, thumbUrl: string | null = null, previewUrl: string | null = null): MediaItem {
  return {
    team_id: 'team1',
    media_id: mediaId,
    object_key: `media/team1/${mediaId}/photo.jpg`,
    filename: 'photo.jpg',
    content_type: 'image/jpeg',
    size_bytes: 1000,
    created_at: 1000,
    thumb_url: thumbUrl,
    preview_url: previewUrl,
  }
}

const NOW_MS = 1_700_000_000_000 // fixed "now" in ms
const ONE_HOUR_S = 3600

describe('parseCloudFrontExpiry', () => {
  it('extracts Expires timestamp and converts to ms', () => {
    const url = cfUrl(1_700_001_000)
    expect(parseCloudFrontExpiry(url)).toBe(1_700_001_000 * 1000)
  })

  it('returns 0 for null', () => {
    expect(parseCloudFrontExpiry(null)).toBe(0)
  })

  it('returns 0 for undefined', () => {
    expect(parseCloudFrontExpiry(undefined)).toBe(0)
  })

  it('returns 0 when no Expires param', () => {
    expect(parseCloudFrontExpiry('https://example.com/image.jpg')).toBe(0)
  })

  it('returns 0 for a malformed URL', () => {
    expect(parseCloudFrontExpiry('not a url !!!')).toBe(0)
  })
})

describe('applyThumbUrlCache', () => {
  beforeEach(() => {
    clearThumbUrlCache()
    vi.useFakeTimers()
    vi.setSystemTime(NOW_MS)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns item unchanged when no cache entry exists', () => {
    const expiresUnix = Math.floor(NOW_MS / 1000) + ONE_HOUR_S
    const item = makeItem('m1', cfUrl(expiresUnix))
    const [result] = applyThumbUrlCache([item])
    expect(result.thumb_url).toBe(item.thumb_url)
  })

  it('caches the URL on first call and returns it on second call with different URL', () => {
    const expiresUnix = Math.floor(NOW_MS / 1000) + ONE_HOUR_S
    const originalUrl = cfUrl(expiresUnix)
    const freshUrl = originalUrl.replace('Signature=abc', 'Signature=xyz')

    // First call — populates cache
    applyThumbUrlCache([makeItem('m1', originalUrl)])

    // Second call with a brand-new signed URL — should return the cached original
    const [result] = applyThumbUrlCache([makeItem('m1', freshUrl)])
    expect(result.thumb_url).toBe(originalUrl)
  })

  it('replaces stale cache entry with fresh URL after expiry', () => {
    const expiresUnix = Math.floor(NOW_MS / 1000) + ONE_HOUR_S
    const originalUrl = cfUrl(expiresUnix)

    // Populate cache
    applyThumbUrlCache([makeItem('m1', originalUrl)])

    // Advance time past expiry (+ buffer)
    vi.setSystemTime(NOW_MS + ONE_HOUR_S * 1000 + 1)

    const freshExpiresUnix = Math.floor((NOW_MS + ONE_HOUR_S * 1000 + 1) / 1000) + ONE_HOUR_S
    const freshUrl = cfUrl(freshExpiresUnix)
    const [result] = applyThumbUrlCache([makeItem('m1', freshUrl)])
    expect(result.thumb_url).toBe(freshUrl)
  })

  it('does not cache URLs with no Expires param (non-CloudFront)', () => {
    const plainUrl = 'https://example.com/image.jpg'
    applyThumbUrlCache([makeItem('m1', plainUrl)])

    const freshUrl = 'https://example.com/image.jpg?v=2'
    const [result] = applyThumbUrlCache([makeItem('m1', freshUrl)])
    // No cache entry — fresh URL is returned as-is
    expect(result.thumb_url).toBe(freshUrl)
  })

  it('falls back to preview_url expiry when thumb_url has no Expires', () => {
    const expiresUnix = Math.floor(NOW_MS / 1000) + ONE_HOUR_S
    const previewUrl = cfUrl(expiresUnix)
    const thumbUrl = 'https://example.com/thumb.jpg' // no Expires

    applyThumbUrlCache([makeItem('m1', thumbUrl, previewUrl)])

    const freshThumb = 'https://example.com/thumb.jpg?v=2'
    const [result] = applyThumbUrlCache([makeItem('m1', freshThumb, cfUrl(expiresUnix))])
    expect(result.thumb_url).toBe(thumbUrl)
  })

  it('handles items with null thumb_url without throwing', () => {
    expect(() => applyThumbUrlCache([makeItem('m1', null)])).not.toThrow()
  })

  it('preserves cached URL for one item while passing through another uncached item', () => {
    const expiresUnix = Math.floor(NOW_MS / 1000) + ONE_HOUR_S
    const originalUrl = cfUrl(expiresUnix)

    applyThumbUrlCache([makeItem('m1', originalUrl)])

    const freshUrl = cfUrl(expiresUnix).replace('Signature=abc', 'Signature=zzz')
    const newItem = makeItem('m2', freshUrl)
    const results = applyThumbUrlCache([makeItem('m1', freshUrl), newItem])

    expect(results[0].thumb_url).toBe(originalUrl) // cached
    expect(results[1].thumb_url).toBe(freshUrl)    // not cached yet
  })

  it('clearThumbUrlCache forces fresh URLs to be used', () => {
    const expiresUnix = Math.floor(NOW_MS / 1000) + ONE_HOUR_S
    const originalUrl = cfUrl(expiresUnix)
    applyThumbUrlCache([makeItem('m1', originalUrl)])

    clearThumbUrlCache()

    const freshUrl = cfUrl(expiresUnix).replace('Signature=abc', 'Signature=new')
    const [result] = applyThumbUrlCache([makeItem('m1', freshUrl)])
    expect(result.thumb_url).toBe(freshUrl)
  })
})

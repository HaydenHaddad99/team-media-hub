import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock import.meta.env before importing api module
vi.stubEnv('VITE_API_BASE_URL', 'https://api.test.example.com')

// We need to dynamically import after env is set
let api: typeof import('../lib/api')

describe('api module', () => {
  beforeEach(async () => {
    // Reset modules for fresh import
    vi.resetModules()
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.test.example.com')
    api = await import('../lib/api')

    // Mock localStorage
    const store: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value },
      removeItem: (key: string) => { delete store[key] },
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('setStoredToken / clearStoredToken', () => {
    it('stores and retrieves invite token', () => {
      api.setStoredToken('my-token-123')
      expect(localStorage.getItem('tmh_invite_token')).toBe('my-token-123')
    })

    it('clears stored token', () => {
      api.setStoredToken('tok')
      api.clearStoredToken()
      expect(localStorage.getItem('tmh_invite_token')).toBeNull()
    })
  })

  describe('getTokenFromUrl', () => {
    it('extracts token from URL query param', () => {
      // Stub window.location.href
      Object.defineProperty(window, 'location', {
        value: { href: 'https://app.example.com?token=abcdefghijklm' },
        writable: true,
      })
      const token = api.getTokenFromUrl()
      expect(token).toBe('abcdefghijklm')
    })

    it('returns null for short token', () => {
      Object.defineProperty(window, 'location', {
        value: { href: 'https://app.example.com?token=short' },
        writable: true,
      })
      const token = api.getTokenFromUrl()
      expect(token).toBeNull()
    })

    it('returns null when no token param', () => {
      Object.defineProperty(window, 'location', {
        value: { href: 'https://app.example.com' },
        writable: true,
      })
      const token = api.getTokenFromUrl()
      expect(token).toBeNull()
    })
  })

  describe('request', () => {
    it('throws on non-ok response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve(JSON.stringify({ error: { message: 'Server error' } })),
      }))

      await expect(api.request('/test')).rejects.toThrow('Server error')
    })

    it('sends x-invite-token header when token stored', async () => {
      api.setStoredToken('my-invite-token')

      let capturedHeaders: Record<string, string> = {}
      vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, opts: any) => {
        capturedHeaders = opts.headers
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve('{"data": 1}'),
        })
      }))

      await api.request('/test')
      expect(capturedHeaders['x-invite-token']).toBe('my-invite-token')
    })

    it('sends to correct API base URL', async () => {
      let capturedUrl = ''
      vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
        capturedUrl = url
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve('{}'),
        })
      }))

      await api.request('/health')
      expect(capturedUrl).toBe('https://api.test.example.com/health')
    })
  })

  describe('listMedia', () => {
    it('returns CloudFront thumb_url without modification', async () => {
      api.setStoredToken('test-token')

      const mockItems = [
        {
          team_id: 't1', media_id: 'm1', object_key: 'media/t1/m1/photo.jpg',
          filename: 'photo.jpg', content_type: 'image/jpeg', size_bytes: 1000,
          created_at: 1000,
          thumb_url: 'https://d2t84d8g2oon37.cloudfront.net/thumbnails/t1/m1/thumb.jpg?Signature=abc',
          preview_url: 'https://d2t84d8g2oon37.cloudfront.net/previews/t1/m1/preview.jpg?Signature=abc',
        },
      ]

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ items: mockItems, next_cursor: null })),
      }))

      const result = await api.listMedia()
      // thumb_url should be the full CloudFront URL, not modified
      expect(result.items[0].thumb_url).toBe(mockItems[0].thumb_url)
      expect(result.items[0].thumb_url).toContain('cloudfront.net')
      expect(result.items[0].thumb_url).not.toContain('/media/thumbnail')
    })

    it('returns null thumb_url when no thumbnail exists', async () => {
      api.setStoredToken('test-token')

      const mockItems = [
        {
          team_id: 't1', media_id: 'm1', object_key: 'media/t1/m1/video.mp4',
          filename: 'video.mp4', content_type: 'video/mp4', size_bytes: 5000,
          created_at: 1000,
          thumb_url: null,
          preview_url: null,
        },
      ]

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ items: mockItems, next_cursor: null })),
      }))

      const result = await api.listMedia()
      expect(result.items[0].thumb_url).toBeNull()
    })
  })
})

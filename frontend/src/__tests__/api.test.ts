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
})

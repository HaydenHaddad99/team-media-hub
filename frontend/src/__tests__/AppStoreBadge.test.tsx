import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { AppStoreBadge, APP_STORE_URL } from '../components/AppStoreBadge'
import { IOSInstallModal } from '../components/IOSInstallModal'

describe('AppStoreBadge', () => {
  it('links to the App Store listing and opens safely in a new tab', () => {
    render(<AppStoreBadge />)
    const link = screen.getByRole('link', { name: /app store/i })
    expect(link).toHaveAttribute('href', APP_STORE_URL)
    expect(link).toHaveAttribute('target', '_blank')
    // rel prevents the opened page from reaching back via window.opener
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('points at the real listing id', () => {
    expect(APP_STORE_URL).toContain('id6797296928')
  })
})

describe('IOSInstallModal', () => {
  const realUA = navigator.userAgent

  function setUserAgent(ua: string) {
    Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true })
  }

  function stubLocalStorage(seed: Record<string, string> = {}) {
    const store: Record<string, string> = { ...seed }
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => {
          store[k] = v
        },
        removeItem: (k: string) => {
          delete store[k]
        },
        clear: () => {},
      },
    })
    return store
  }

  beforeEach(() => {
    vi.useFakeTimers()
    // signed-in iPhone Safari, not yet dismissed, not standalone
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Safari/604.1')
    stubLocalStorage({ tmh_invite_token: 'tok' })
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as never
  })

  afterEach(() => {
    vi.useRealTimers()
    setUserAgent(realUA)
  })

  it('offers the App Store app instead of Add to Home Screen', () => {
    render(<IOSInstallModal />)
    act(() => {
      vi.advanceTimersByTime(2500)
    })

    expect(screen.getByRole('link', { name: /app store/i })).toHaveAttribute('href', APP_STORE_URL)
    // the old PWA walkthrough should be gone
    expect(screen.queryByText(/Add to Home Screen/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Tap the Share button/i)).not.toBeInTheDocument()
  })

  it('stays hidden on Android, which keeps the PWA install prompt', () => {
    setUserAgent('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36')
    render(<IOSInstallModal />)
    act(() => {
      vi.advanceTimersByTime(2500)
    })
    expect(screen.queryByRole('link', { name: /app store/i })).not.toBeInTheDocument()
  })

  it('stays hidden when already running as an installed app', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never
    render(<IOSInstallModal />)
    act(() => {
      vi.advanceTimersByTime(2500)
    })
    expect(screen.queryByRole('link', { name: /app store/i })).not.toBeInTheDocument()
  })

  it('stays hidden for signed-out visitors', () => {
    stubLocalStorage({})
    render(<IOSInstallModal />)
    act(() => {
      vi.advanceTimersByTime(2500)
    })
    expect(screen.queryByRole('link', { name: /app store/i })).not.toBeInTheDocument()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Feed } from '../pages/Feed'
import type { MediaItem } from '../lib/api'

vi.mock('react-router-dom', () => ({ useParams: () => ({ team_id: 't1' }) }))
// heic2any (via UploadButton) constructs a Worker at import time — no such
// thing in jsdom.
vi.mock('heic2any', () => ({ default: vi.fn() }))
vi.mock('embla-carousel-react', () => ({ default: () => [vi.fn(), null] }))
vi.mock('react-zoom-pan-pinch', () => ({
  TransformWrapper: ({ children }: any) => <div>{children}</div>,
  TransformComponent: ({ children }: any) => <div>{children}</div>,
}))

const item = (over: Partial<MediaItem> = {}): MediaItem =>
  ({
    team_id: 't1',
    media_id: 'm1',
    object_key: 'media/a.jpg',
    filename: 'a.jpg',
    content_type: 'image/jpeg',
    size_bytes: 10,
    created_at: 100,
    album_name: 'Game Day',
    thumb_url: 'https://cdn/t.jpg',
    preview_url: 'https://cdn/p.jpg',
    ...over,
  }) as MediaItem

vi.mock('../lib/api', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  listMedia: vi.fn(async () => ({ items: [item()], next_cursor: null })),
  getMe: vi.fn(async () => ({
    team: { team_id: 't1', team_name: 'Hornets', plan: 'free', used_bytes: 0, storage_limit_bytes: 1000 },
    invite: { role: 'uploader' },
    user_id: 'u1',
  })),
  getUploaderIdentifier: vi.fn(async () => 'u1'),
  presignDownload: vi.fn(async () => ({ download_url: 'https://cdn/d.jpg', expires_in: 900 })),
}))

describe('Feed album navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const store: Record<string, string> = {}
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
  })

  async function renderFeed() {
    render(<Feed onLogout={() => {}} />)
    // wait for the album browser to appear
    await screen.findByText('Team Albums')
  }

  /** The bottom tab-bar "Albums" button (not the heading). */
  function bottomAlbumsTab() {
    const labels = Array.from(document.querySelectorAll('.feed-tab-label'))
    const label = labels.find((l) => l.textContent === 'Albums')!
    return label.closest('button') as HTMLElement
  }

  it('opens an album, then the bottom Albums tab returns to the album list', async () => {
    await renderFeed()

    // open the album
    fireEvent.click(screen.getByText('Game Day'))
    await waitFor(() => {
      expect(screen.queryByText('Team Albums')).not.toBeInTheDocument()
    })

    // the bottom tab is now the way back
    fireEvent.click(bottomAlbumsTab())
    await waitFor(() => {
      expect(screen.getByText('Team Albums')).toBeInTheDocument()
    })
  })

  it('no longer renders the redundant top back button', async () => {
    await renderFeed()
    fireEvent.click(screen.getByText('Game Day'))

    await waitFor(() => {
      expect(screen.queryByText('Team Albums')).not.toBeInTheDocument()
    })
    expect(document.querySelector('.feed-v2-album-back')).toBeNull()
    expect(screen.queryByText(/←\s*Albums/)).not.toBeInTheDocument()
  })
})

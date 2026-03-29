import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AlbumGrid, AlbumData } from '../components/AlbumGrid'

// embla-carousel-react uses DOM layout APIs unavailable in jsdom.
// Stub it to render children directly so we can test tile behavior.
vi.mock('embla-carousel-react', () => ({
  default: () => [vi.fn(), null],
}))

function makeAlbum(name: string, count = 3, cover: string | null = 'https://example.com/thumb.jpg'): AlbumData {
  return { name, count, cover, lastUpdated: 1000 }
}

describe('AlbumGrid', () => {
  describe('tile rendering', () => {
    it('renders a tile for each album', () => {
      const albums = [makeAlbum('Spring Soccer'), makeAlbum('Basketball')]
      render(<AlbumGrid albums={albums} onSelect={() => {}} />)
      expect(screen.getByText('Spring Soccer')).toBeInTheDocument()
      expect(screen.getByText('Basketball')).toBeInTheDocument()
    })

    it('renders item count for each tile', () => {
      const albums = [makeAlbum('Soccer', 7), makeAlbum('Basketball', 1)]
      render(<AlbumGrid albums={albums} onSelect={() => {}} />)
      expect(screen.getByText('7 items')).toBeInTheDocument()
      expect(screen.getByText('1 item')).toBeInTheDocument()
    })

    it('uses singular "item" when count is 1', () => {
      render(<AlbumGrid albums={[makeAlbum('Solo', 1)]} onSelect={() => {}} />)
      expect(screen.getByText('1 item')).toBeInTheDocument()
    })

    it('applies cover CSS variable when cover URL is provided', () => {
      render(<AlbumGrid albums={[makeAlbum('Spring', 3, 'https://example.com/cover.jpg')]} onSelect={() => {}} />)
      const tile = screen.getByRole('button', { name: /Spring/i })
      expect(tile.style.getPropertyValue('--album-cover')).toBe('url(https://example.com/cover.jpg)')
    })

    it('does not apply cover CSS variable when cover is null', () => {
      render(<AlbumGrid albums={[makeAlbum('No Cover', 2, null)]} onSelect={() => {}} />)
      const tile = screen.getByRole('button', { name: /No Cover/i })
      expect(tile.style.getPropertyValue('--album-cover')).toBe('')
    })

    it('adds has-cover class when cover is present', () => {
      render(<AlbumGrid albums={[makeAlbum('WithCover', 2, 'https://example.com/img.jpg')]} onSelect={() => {}} />)
      const tile = screen.getByRole('button', { name: /WithCover/i })
      expect(tile.classList.contains('album-tile--has-cover')).toBe(true)
    })

    it('does not add has-cover class when cover is null', () => {
      render(<AlbumGrid albums={[makeAlbum('NoCover', 2, null)]} onSelect={() => {}} />)
      const tile = screen.getByRole('button', { name: /NoCover/i })
      expect(tile.classList.contains('album-tile--has-cover')).toBe(false)
    })
  })

  describe('onSelect callback', () => {
    it('calls onSelect with album name when tile is clicked', () => {
      const onSelect = vi.fn()
      render(<AlbumGrid albums={[makeAlbum('Spring Soccer')]} onSelect={onSelect} />)
      fireEvent.click(screen.getByRole('button', { name: /Spring Soccer/i }))
      expect(onSelect).toHaveBeenCalledOnce()
      expect(onSelect).toHaveBeenCalledWith('Spring Soccer')
    })

    it('calls onSelect with correct album when multiple tiles exist', () => {
      const onSelect = vi.fn()
      const albums = [makeAlbum('Soccer'), makeAlbum('Basketball'), makeAlbum('Baseball')]
      render(<AlbumGrid albums={albums} onSelect={onSelect} />)
      fireEvent.click(screen.getByRole('button', { name: /Basketball/i }))
      expect(onSelect).toHaveBeenCalledWith('Basketball')
    })

    it('does not call onSelect when other tiles are not clicked', () => {
      const onSelect = vi.fn()
      render(<AlbumGrid albums={[makeAlbum('A'), makeAlbum('B')]} onSelect={onSelect} />)
      fireEvent.click(screen.getByRole('button', { name: /^A/i }))
      expect(onSelect).toHaveBeenCalledTimes(1)
    })
  })

  describe('layout thresholds', () => {
    it('renders static grid (no carousel wrapper) for 4 or fewer albums', () => {
      const albums = [1, 2, 3, 4].map(n => makeAlbum(`Album ${n}`))
      const { container } = render(<AlbumGrid albums={albums} onSelect={() => {}} />)
      // Static grid renders directly, no carousel wrapper
      expect(container.querySelector('.album-carousel-wrap')).toBeNull()
      expect(container.querySelector('.album-grid-static')).toBeInTheDocument()
    })

    it('renders carousel wrapper for more than 4 albums', () => {
      const albums = [1, 2, 3, 4, 5].map(n => makeAlbum(`Album ${n}`))
      const { container } = render(<AlbumGrid albums={albums} onSelect={() => {}} />)
      expect(container.querySelector('.album-carousel-wrap')).toBeInTheDocument()
    })

    it('shows swipe hint when carousel has multiple pages (> 4 albums)', () => {
      const albums = [1, 2, 3, 4, 5].map(n => makeAlbum(`Album ${n}`))
      render(<AlbumGrid albums={albums} onSelect={() => {}} />)
      expect(screen.getByText(/swipe to see more/i)).toBeInTheDocument()
    })

    it('does not show swipe hint for 4 or fewer albums', () => {
      const albums = [1, 2, 3, 4].map(n => makeAlbum(`Album ${n}`))
      render(<AlbumGrid albums={albums} onSelect={() => {}} />)
      expect(screen.queryByText(/swipe to see more/i)).toBeNull()
    })

    it('returns null when albums array is empty', () => {
      const { container } = render(<AlbumGrid albums={[]} onSelect={() => {}} />)
      expect(container.firstChild).toBeNull()
    })
  })
})

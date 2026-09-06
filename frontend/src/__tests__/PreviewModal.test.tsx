import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { PreviewModal } from '../components/PreviewModal'
import type { MediaItem } from '../lib/api'

// embla-carousel-react uses DOM layout APIs unavailable in jsdom.
vi.mock('embla-carousel-react', () => ({
  default: () => [vi.fn(), null],
}))

const resetTransform = vi.fn()

// react-zoom-pan-pinch also needs real layout; render children and hand the
// component an onInit ref exposing resetTransform, which immersive-exit calls.
vi.mock('react-zoom-pan-pinch', () => ({
  TransformWrapper: ({ children, onInit }: any) => {
    onInit?.({ resetTransform, state: { scale: 1 } })
    return <div data-testid="transform-wrapper">{children}</div>
  },
  TransformComponent: ({ children }: any) => <div>{children}</div>,
}))

vi.mock('../lib/api', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  presignDownload: vi.fn(async () => ({ download_url: 'https://cdn/x.jpg', expires_in: 900 })),
}))

function makeItem(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    team_id: 't1',
    media_id: 'm1',
    object_key: 'media/x.jpg',
    filename: 'x.jpg',
    content_type: 'image/jpeg',
    size_bytes: 1000,
    created_at: 1,
    preview_url: 'https://cdn/preview.jpg',
    thumb_url: 'https://cdn/thumb.jpg',
    ...overrides,
  } as MediaItem
}

function getCard() {
  return document.querySelector('.modalCard') as HTMLElement
}

/**
 * The element that actually carries the tap handlers. Deliberately the slide
 * container, not the <img>: the zoom library's wrapper div sits above the
 * image and receives the pointer events on a real device.
 */
function getTapTarget() {
  return document.querySelector('.embla__slide__inner') as HTMLElement
}

/** A tap: pointer down and up at the same spot. */
function tap(el: HTMLElement) {
  fireEvent.pointerDown(el, { clientX: 100, clientY: 100 })
  fireEvent.pointerUp(el, { clientX: 100, clientY: 100 })
}

describe('PreviewModal immersive mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function renderModal() {
    return render(
      <PreviewModal open items={[makeItem()]} currentIndex={0} onSelectIndex={() => {}} onClose={() => {}} />
    )
  }

  it('starts with chrome visible and not immersive', () => {
    renderModal()
    expect(getCard().className).not.toContain('modalCard--immersive')
    expect(document.querySelector('.modalHeader')).not.toHaveAttribute('hidden')
    expect(document.querySelector('.modalFooter')).not.toHaveAttribute('hidden')
  })

  it('a single tap enters immersive and hides the chrome', () => {
    renderModal()
    tap(getTapTarget())
    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(getCard().className).toContain('modalCard--immersive')
    expect(document.querySelector('.modalHeader')).toHaveAttribute('hidden')
    expect(document.querySelector('.modalFooter')).toHaveAttribute('hidden')
  })

  it('tapping again exits immersive, restores chrome, and resets zoom', () => {
    renderModal()
    const target = getTapTarget()

    tap(target)
    act(() => vi.advanceTimersByTime(300))
    expect(getCard().className).toContain('modalCard--immersive')

    tap(target)
    act(() => vi.advanceTimersByTime(300))

    expect(getCard().className).not.toContain('modalCard--immersive')
    expect(document.querySelector('.modalHeader')).not.toHaveAttribute('hidden')
    // returning to framed size is the behavior asked for
    expect(resetTransform).toHaveBeenCalled()
  })

  // A second tap cancels the pending chrome toggle so the gesture belongs to
  // the zoom library. (On a real device the resulting zoom then triggers
  // immersive via onTransformed — that path is driven by the library, which is
  // stubbed here, so this asserts only the cancellation.)
  it('a second tap cancels the pending chrome toggle', () => {
    renderModal()
    const target = getTapTarget()

    tap(target)
    act(() => vi.advanceTimersByTime(100)) // inside the double-tap window
    tap(target)
    act(() => vi.advanceTimersByTime(500))

    expect(getCard().className).not.toContain('modalCard--immersive')
  })

  it('a drag does not toggle chrome', () => {
    renderModal()
    const target = getTapTarget()

    fireEvent.pointerDown(target, { clientX: 100, clientY: 100 })
    fireEvent.pointerUp(target, { clientX: 180, clientY: 240 })
    act(() => vi.advanceTimersByTime(500))

    expect(getCard().className).not.toContain('modalCard--immersive')
  })

  it('Escape leaves immersive before closing the modal', () => {
    const onClose = vi.fn()
    render(<PreviewModal open items={[makeItem()]} currentIndex={0} onSelectIndex={() => {}} onClose={onClose} />)

    tap(getTapTarget())
    act(() => vi.advanceTimersByTime(300))
    expect(getCard().className).toContain('modalCard--immersive')

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(getCard().className).not.toContain('modalCard--immersive')
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})

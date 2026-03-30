import { MediaItem } from "./api";

type CacheEntry = {
  thumbUrl: string | null;
  previewUrl: string | null;
  expiresAt: number; // ms
};

const cache = new Map<string, CacheEntry>();

// Parse the Unix `Expires` timestamp embedded in a CloudFront signed URL.
// Returns 0 if the URL is absent or unparseable.
export function parseCloudFrontExpiry(url: string | null | undefined): number {
  if (!url) return 0;
  try {
    const expires = new URL(url).searchParams.get("Expires");
    return expires ? parseInt(expires, 10) * 1000 : 0;
  } catch {
    return 0;
  }
}

/**
 * Merge fresh API items with cached signed URLs.
 *
 * CloudFront signed URLs are re-generated on every listMedia call, so their
 * query-string changes even though the underlying image bytes are identical.
 * The browser therefore treats each new URL as a cache miss and re-downloads
 * the image. By keeping the first URL we saw (until it actually expires) the
 * browser cache works correctly across refreshes.
 *
 * We keep a 60-second buffer before the real expiry so we never serve an
 * URL that is about to expire.
 */
export function applyThumbUrlCache(items: MediaItem[]): MediaItem[] {
  const now = Date.now();
  const BUFFER_MS = 60_000;

  return items.map((item) => {
    const cached = cache.get(item.media_id);
    if (cached && cached.expiresAt > now) {
      // Serve the stable cached URL — browser will hit its disk cache
      return { ...item, thumb_url: cached.thumbUrl, preview_url: cached.previewUrl };
    }

    // Populate cache from the fresh URL
    const expiry =
      parseCloudFrontExpiry(item.thumb_url) ||
      parseCloudFrontExpiry(item.preview_url);

    if (expiry - BUFFER_MS > now) {
      cache.set(item.media_id, {
        thumbUrl: item.thumb_url ?? null,
        previewUrl: item.preview_url ?? null,
        expiresAt: expiry - BUFFER_MS,
      });
    }

    return item;
  });
}

export function clearThumbUrlCache() {
  cache.clear();
}

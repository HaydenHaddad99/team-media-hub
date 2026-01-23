import { presignDownload } from "./api";

type CacheEntry = { url: string; expiresAt: number };

const cache = new Map<string, CacheEntry>();

// Cache slightly less than backend TTL (900s default). Keep it short.
const LOCAL_TTL_MS = 2 * 60 * 1000;

export async function getSignedMediaUrl(mediaId: string): Promise<string> {
  const now = Date.now();
  const hit = cache.get(mediaId);
  if (hit && hit.expiresAt > now) return hit.url;

  const res = await presignDownload(mediaId);
  const url = res.download_url;

  cache.set(mediaId, { url, expiresAt: now + LOCAL_TTL_MS });
  return url;
}

export function clearMediaUrlCache() {
  cache.clear();
}

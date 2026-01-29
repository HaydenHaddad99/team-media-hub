# Performance Optimizations Roadmap

## ✅ Implemented (Immediate Wins)
1. **Thumbnail as placeholder** - Modal shows thumbnail immediately while loading full-res (Instagram-style)
2. **Prefetch next/prev** - Adjacent items pre-fetch in background for instant navigation
3. **URL caching** - Signed URLs cached to avoid redundant API calls
4. **Preview images (1600px)** - Generate preview.jpg alongside thumbnails for 5-20x faster modal loads

**Expected impact**: Modal feels instant, navigation is instant after first load, images load 5-20x faster

---

## 🔥 High Priority (Big Wins Remaining)

### 1. CloudFront CDN for Media (Biggest Win)
**Impact**: 2-10x faster loads, especially thumbnails

**Current**: Signed URLs point directly to S3 (high latency)
**Better**: CloudFront signed URLs with edge caching

**Setup**:
```python
# In CDK stack, add media CloudFront distribution
media_distribution = cloudfront.Distribution(
    self, "MediaCDN",
    default_behavior=cloudfront.BehaviorOptions(
        origin=origins.S3Origin(
            media_bucket,
            origin_access_identity=oai
        ),
        viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cache_policy=cloudfront.CachePolicy(
            self, "MediaCachePolicy",
            default_ttl=Duration.minutes(5),  # Short TTL for security
            max_ttl=Duration.hours(1),
        ),
    )
)
```

Update presign logic to use CloudFront signed URLs instead of S3.

**Tradeoff**: Need CloudFront signed URLs or signed cookies (more complex than S3 presign)

---

### 2. Generate Preview-Size Images (preview.jpg)
**Impact**: 3-5x faster full-res loads (100-400ms vs 1-2s)

~~**Current**: Loading 3-8MB iPhone originals in modal~~
~~**Better**: Generate 1600px "preview.jpg" in thumbnail Lambda~~

**✅ IMPLEMENTED** - Preview pipeline now generates:
- `thumb.jpg` (512px) for grid
- `preview.jpg` (1600px) for modal
- Original kept for download

---

### 3. Return Preview URLs in List Response
**Impact**: Eliminates API round-trip (saves 200-800ms)

~~**Current**:~~
~~- `/media/list` → get items~~
~~- Click → `/media/download-url` → get signed URL~~
~~- Load image~~

**✅ IMPLEMENTED** - Preview URLs now included:
- `/media/list` → returns `preview_url` (presigned, 1hr TTL)
- Click → load immediately (no API call for images)
- Videos still use presign endpoint

---

## 🎯 Medium Priority

### 4. Lambda Optimization
**Impact**: Shave 100-400ms from presign calls

- Bump Lambda memory to 512-1024MB (faster CPU)
- Keep imports minimal
- Enable HTTP keep-alive in boto3

```python
# In Lambda config
import boto3
from botocore.config import Config

s3_client = boto3.client(
    's3',
    config=Config(
        max_pool_connections=50,
        retries={'max_attempts': 2}
    )
)
```

---

## 📊 Recommended Implementation Order

**Week 1** ✅ **COMPLETE**:
- ✅ Thumbnail placeholder in modal
- ✅ Prefetch adjacent items
- ✅ Generate preview.jpg (1600px) in thumbnail Lambda
- ✅ Update schema + list endpoint to return preview_url
- ✅ Use preview_url in modal (fallback to presign for videos)

**Next** (Week 2-3):
1. Set up CloudFront distribution for media
2. Implement CloudFront signed URLs
3. Update all media URLs to use CloudFront

**Result**: Sub-500ms loads for most images, instant-feeling navigation

---

## Measuring Success

**Current baseline**:
- First load: ~1000-2000ms
- Navigation: ~1000ms per click

**After all optimizations**:
- First load: ~200-500ms (CloudFront + preview.jpg)
- Navigation: ~0ms (prefetch + cache)
- Thumbnails: ~50-150ms (CloudFront edge cache)

**Tools to measure**:
- Chrome DevTools Network tab
- Add timing logs: `console.time('load-media')`

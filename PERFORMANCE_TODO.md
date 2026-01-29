# Performance Optimizations Roadmap

## ✅ Implemented (Immediate Wins)
1. **Thumbnail as placeholder** - Modal shows thumbnail immediately while loading full-res (Instagram-style)
2. **Prefetch next/prev** - Adjacent items pre-fetch in background for instant navigation
3. **URL caching** - Signed URLs cached to avoid redundant API calls

**Expected impact**: Modal feels instant, navigation is instant after first load

---

## 🔥 High Priority (Big Wins)

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

**Current**: Loading 3-8MB iPhone originals in modal
**Better**: Generate 1600px "preview.jpg" in thumbnail Lambda

**Changes needed**:
```python
# In thumbnail_handler.py, generate two sizes:
# 1. thumb.jpg (512px) - for grid
# 2. preview.jpg (1600px) - for modal viewing
# Original stays unchanged for "Download" button
```

Update DynamoDB schema to store:
- `thumb_key`
- `preview_key` ← new

Update `/media/list` to return `preview_url` alongside `thumb_url`

**Estimated work**: 2-3 hours

---

### 3. Return Preview URLs in List Response
**Impact**: Eliminates API round-trip (saves 200-800ms)

**Current**: 
- `/media/list` → get items
- Click → `/media/download-url` → get signed URL
- Load image

**Better**:
- `/media/list?include_preview=1` → items with preview URLs pre-signed
- Click → load immediately (no API call)

**Implementation**:
```python
# In media_list.py
if include_preview:
    for item in items:
        if item.get('preview_key'):
            item['preview_url'] = s3.generate_presigned_url(
                'get_object',
                Params={'Bucket': bucket, 'Key': item['preview_key']},
                ExpiresIn=3600
            )
```

**Tradeoff**: 
- More presigning work on list (but cheap)
- URLs expire faster (solve with prefetch or CloudFront)

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

**Week 1** (already done ✅):
- Thumbnail placeholder in modal
- Prefetch adjacent items

**Week 2**:
1. Generate preview.jpg (1600px) in thumbnail Lambda
2. Update schema + list endpoint to return preview_url
3. Use preview_url in modal (fallback to full presign if missing)

**Week 3**:
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

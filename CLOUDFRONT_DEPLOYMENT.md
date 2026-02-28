# CloudFront Media Distribution & Signed URLs Implementation

## Summary of Changes

This implementation adds CloudFront as a content delivery layer for media downloads, replacing direct S3 presigned URLs with secure CloudFront signed URLs.

### What Changed

1. **Infrastructure (CDK)**:
   - Added `media_distribution`: CloudFront distribution for media bucket
   - Media bucket is now served exclusively through CloudFront
   - OAI (Origin Access Identity) restricts S3 bucket to CloudFront only
   - Environment variables for CloudFront signing credentials passed to Lambda

2. **Backend Code**:
   - New: `backend/src/common/cloudfront_signer.py` - CloudFront URL signing utility
   - Updated: `backend/src/handlers/media_presign_download.py` - Uses CloudFront signed URLs instead of S3 presigned URLs
   - Updated: `backend/src/common/config.py` - Added CloudFront configuration variables
   - Updated: `backend/requirements.txt` - Added `cryptography` library for signing

3. **Security Benefits**:
   - S3 bucket URLs are never exposed to browsers
   - CloudFront handles caching and DDoS protection
   - Signed URLs are cryptographically secure
   - Team-based authorization remains in place (enforced before URL generation)
   - URLs expire after 15 minutes (configurable via `SIGNED_URL_TTL_SECONDS`)

### Key Features

- **Custom Domain**: `media.teammediahub.co` (configure via DNS after deployment)
- **Token-Based Access**: Each download URL is cryptographically signed and time-limited
- **Backward Compatible**: Same API response format, just different URL scheme
- **Team Isolation**: Users can only download media from their own team
- **No S3 Exposure**: S3 bucket is completely private, no direct access possible

---

## Prerequisites & Deployment Steps

### 1. Create CloudFront Key Pair

You need a CloudFront key pair for signing URLs. This is a one-time setup:

```bash
# Create key pair in AWS Console or via AWS CLI
# Go to: AWS Console → CloudFront → Public keys
# OR use AWS CLI:

aws cloudfront create-distribution-key-group \
  --key-group-config Comment="TMH Media Signing",Items={Quantity=1,Items=["<KEY_PAIR_ID>"]}
```

**Alternatively**, if you already have a CloudFront key pair:
1. Get the Key Pair ID and Private Key from AWS CloudFront console
2. Export them as Base64-encoded environment variables (see step 3)

### 2. Generate or Retrieve Credentials

#### Option A: Create New Key Pair (AWS CLI)

```bash
# Generate a new CloudFront public/private key pair
# This requires AWS Account root or specific IAM permissions

aws cloudfront create-public-key \
  --public-key-config EncodedCertificate='<your-cert-file>',CallerReference='<unique-id>',Name='TMH-Media-Signing'

# Save the returned KeyPairId
```

#### Option B: Use Existing Key Pair

If you already have a CloudFront key pair, retrieve it:

```bash
# List existing key pairs
aws cloudfront list-public-keys

# Get the key ID (format: APKXXXXXX)
# Store the private key securely (already have it on file)
```

### 3. Set Environment Variables for Deployment

Before running `cdk deploy`, set these environment variables:

```bash
# Base64-encoded private key (replace backslashes with \n)
export CLOUDFRONT_KEY_PAIR_ID="APKXXXXXXXXXXXXXX"
export CLOUDFRONT_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"

# Example with actual newlines (for shell):
export CLOUDFRONT_PRIVATE_KEY=$(cat /path/to/private-key.pem)

# Deploy
cd infra
cdk deploy
```

### 4. Configure DNS CNAME Record

After CDK deployment, configure your DNS to point to CloudFront:

```
media.teammediahub.co CNAME d1a2b3c4d5e6f.cloudfront.net
```

(Replace with actual CloudFront domain from CDK outputs)

### 5. Update CloudFront Distribution for Custom Domain

In AWS CloudFront console:
1. Go to your media distribution
2. Settings → General
3. Add "Alternative domain name": `media.teammediahub.co`
4. Upload or select ACM certificate for the domain

---

## Troubleshooting

### 401/403 Errors on Download

**Cause**: Invalid CloudFront key pair ID or malformed private key

**Fix**:
- Verify `CLOUDFRONT_KEY_PAIR_ID` is correct (format: APKXXXXXX)
- Verify `CLOUDFRONT_PRIVATE_KEY` is valid PEM format (includes BEGIN/END headers)
- Ensure key pair exists in CloudFront console

### URLs Expire Too Quickly

**Cause**: `SIGNED_URL_TTL_SECONDS` is too low

**Fix**: Increase in Lambda environment or config:
```bash
cdk deploy -c SIGNED_URL_TTL_SECONDS=1800  # 30 minutes
```

### S3 Bucket Access Denied

**Cause**: OAI not properly configured or bucket policy is stale

**Fix**:
- Verify media_oai in CDK has read permissions
- Check S3 bucket policy (should only allow CloudFront OAI)
- Redeploy CDK to refresh policies

### Private Key Format Issues

If you have a PEM file and need to pass it as environment variable:

```bash
# Convert to single-line format (add literal \n)
PRIVATE_KEY=$(cat private-key.pem | tr '\n' '\\n')
export CLOUDFRONT_PRIVATE_KEY="$PRIVATE_KEY"
```

---

## Testing

### Test CloudFront Signed URL Generation

```python
from common.cloudfront_signer import create_signed_url

url = create_signed_url(
    domain_name="https://media.teammediahub.co",
    object_key="media/sample.jpg",
    key_pair_id="APKXXXXXX",
    private_key_pem="-----BEGIN RSA PRIVATE KEY-----\n...",
    expires_in_seconds=900,
)

print(url)
# Should output: https://media.teammediahub.co/media/sample.jpg?Policy=...&Signature=...&Key-Pair-Id=...
```

### Test via API

```bash
curl -H "x-invite-token: YOUR_TOKEN" \
  "https://api.example.com/media/download-url?media_id=abc123"

# Should return:
# {
#   "download_url": "https://media.teammediahub.co/media/...?Policy=...&Signature=...&Key-Pair-Id=...",
#   "expires_in": 900
# }
```

---

## Rollback

If needed to revert to S3 presigned URLs:

```python
# Temporarily patch media_presign_download.py to use S3 again:
s3 = boto3.client("s3")
url = s3.generate_presigned_url(
    ClientMethod="get_object",
    Params={"Bucket": MEDIA_BUCKET, "Key": object_key},
    ExpiresIn=SIGNED_URL_TTL_SECONDS,
    HttpMethod="GET",
)
```

Then remove CloudFront code and redeploy.

---

## Production Considerations

- [ ] Store `CLOUDFRONT_PRIVATE_KEY` in AWS Secrets Manager (don't use env vars in production)
- [ ] Rotate CloudFront key pairs annually
- [ ] Monitor CloudFront cache hit ratio
- [ ] Set up CloudFront geo-restrictions if needed
- [ ] Consider WAF rules for additional protection
- [ ] Use Lambda@Edge for custom request/response logic (logging, etc.)
- [ ] Enable CloudFront access logs to S3
- [ ] Set appropriate cache TTLs based on media update frequency

---

## Files Modified

- `infra/stacks/team_media_hub_stack.py` - Added CloudFront distribution
- `backend/src/common/cloudfront_signer.py` - New: CloudFront signing utility
- `backend/src/handlers/media_presign_download.py` - Updated: Use CloudFront signed URLs
- `backend/src/common/config.py` - Added: CloudFront env vars
- `backend/requirements.txt` - Added: cryptography library

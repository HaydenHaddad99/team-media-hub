# Parent Upload & Delete Issues - Debugging Guide

## Issues Reported

1. **Thumbnails not showing after upload** - Images show skeleton tiles, never load
2. **Parent cannot delete own uploads** - Delete button disabled or delete fails with 403

## Root Causes Identified & Fixed

### Bug #1: Missing uploader_user_id

**Problem**: Parents using invite tokens have no `user_id` in their auth record, so uploads weren't getting an `uploader_user_id` set.

**Why thumbnails appeared broken**: 
- Thumbnail Lambda needs media record to exist
- Lambda updates `thumb_key` and `preview_key` after generating thumbnail
- `media_list` endpoint returns `thumb_url` only if `thumb_key` exists
- Without `uploader_user_id`, frontend permission logic can't determine ownership
- Even if thumbnails loaded, delete wouldn't work

**Fix Applied**:
- Backend now hashes invite token to create stable `uploader_user_id`
- All uploads now get `uploader_user_id` set (coaches via explicit ID, parents via token hash)

### Bug #2: Delete ownership check failed

**Problem**: Delete handler checked `invite.get("user_id")` which is `None` for invite tokens.

**Why delete was blocked**:
- For parents: `invite.get("user_id")` = None
- Ownership check: `if uploader_user_id != current_user_id` where `current_user_id = None`
- This always failed (None ≠ token_hash)

**Fix Applied**:
- Delete handler now computes `current_user_id` same way as upload handler
- Uses token hash for parents, explicit ID for coaches
- Should match the stored `uploader_user_id` exactly

## How to Test

### Quick Manual Test

1. **Join team as parent**
   - Go to landing page
   - Click "Upload" (not "Coach sign-in")
   - Paste a team code
   - You're now a parent with an invite token

2. **Upload image**
   - Click "Upload"
   - Select a JPG or PNG
   - Wait for "Upload complete"
   - Return to grid

3. **Check thumbnail**
   - Should show thumbnail (not skeleton)
   - Wait 10 seconds (Lambda may still be running)
   - Refresh page if needed

4. **Try to delete**
   - Click on image to open preview
   - Click "Delete" button
   - Should succeed and remove item from grid

### Automated Test Script

```bash
# Set environment variables with a test parent token and team
export TEST_PARENT_TOKEN="your_invite_token_here"
export TEST_TEAM_ID="your_team_id_here"
export API_URL="https://app.teammediahub.co"

# Run test script
cd /Users/haydensmac/team-media-hub
python3 test_parent_flow.py
```

The script will:
- ✅ Authenticate as parent
- ✅ Get presigned upload URL
- ✅ Upload mock image to S3
- ✅ Complete upload in backend
- ✅ List media and verify `uploader_user_id` matches token hash
- ✅ Delete the uploaded image
- ✅ Verify deletion

## Debugging with CloudWatch Logs

### Check Upload Logs

Search for `[UPLOAD]` prefix in CloudWatch:

```
[UPLOAD] Parent token hashed: abc123...
[UPLOAD] Set uploader_user_id: abc123...
[UPLOAD] Saved media record: media_id=xyz, uploader_user_id=abc123...
```

If you see `ERROR: No _raw_token in invite!`, the invite object wasn't set up correctly.

### Check Delete Logs

Search for `[DELETE]` prefix:

```
[DELETE] Starting delete check - role=uploader, media_id=xyz, team_id=123
[DELETE] Computed user_id from token hash: abc123...
[DELETE] Ownership check: uploader_id=abc123..., current_id=abc123...
[DELETE] Authorization passed, proceeding to delete S3 objects
[DELETE] SUCCESS: media_id=xyz
```

If you see `DENIED: uploader_id ... != current_id ...`, the token hashes don't match (browser vs backend).

### Check Thumbnail Lambda Logs

Function: `team-media-hub-thumbnail-handler`

Should log:
- `Processing S3 ObjectCreated event`
- `Generated thumbnail for media_id=xyz`
- `Updated DynamoDB with thumb_key and preview_key`

If Lambda isn't running:
1. Check S3 EventNotification configuration
2. Check Lambda execution role has DynamoDB permissions
3. Look for Lambda errors in CloudWatch

## Implementation Details

### Token Hash Algorithm

Both backend and frontend use identical SHA256 hashing:

**Backend** (Python):
```python
import hashlib
hashlib.sha256(token.encode("utf-8")).hexdigest()
```

**Frontend** (TypeScript):
```typescript
const encoder = new TextEncoder();
const data = encoder.encode(token);
const hashBuffer = await crypto.subtle.digest("SHA-256", data);
const hashArray = Array.from(new Uint8Array(hashBuffer));
const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
```

### Upload Flow

```
Parent joins team via invite link
    ↓
Token stored in localStorage: tmh_invite_token
    ↓
Parent uploads image
    ↓
media_complete handler receives x-invite-token header
    ↓
Extract raw token from invite._raw_token
    ↓
Hash token: SHA256(token) → "abc123...def456"
    ↓
Store as uploader_user_id in DynamoDB
    ↓
Thumbnail Lambda runs on S3 ObjectCreated
    ↓
Sets thumb_key and preview_key
    ↓
media_list returns thumb_url because thumb_key exists
    ↓
Frontend loads thumbnail
```

### Delete Flow

```
Parent clicks Delete on own upload
    ↓
Frontend sends DELETE /media?media_id=xyz with x-invite-token header
    ↓
Delete handler receives request
    ↓
Extract raw token from invite._raw_token
    ↓
Hash token: SHA256(token) → "abc123...def456"
    ↓
Lookup media record → get uploader_user_id
    ↓
Compare: stored uploader_user_id == computed token hash
    ↓
If match → allow delete
    ↓
Delete S3 objects and DynamoDB record
    ↓
Item removed from grid
```

## Common Issues & Solutions

### Thumbnails still not showing after fixes

**Check**:
1. Verify `thumb_key` exists in DynamoDB record
   - Query media item: `aws dynamodb get-item --table-name MediaTable --key '{"team_id":{"S":"xyz"},"sk":{"S":"123#media-abc"}}'`
   - Should have `"thumb_key": {"S": "thumbnails/..."}`

2. Check Thumbnail Lambda logs
   - Search CloudWatch for function name
   - Look for errors during image processing

3. Clear browser cache
   - Images might be cached by CloudFront
   - Hard refresh (Cmd+Shift+R on Mac)

### Delete still returns 403

**Check**:
1. Review delete logs for mismatch between `uploader_id` and `current_id`
2. Verify token being sent matches token used for upload
3. Test token consistency:
   ```bash
   # Check what's in localStorage
   # Open browser console: localStorage.getItem("tmh_invite_token")
   # Hash it and compare to CloudWatch logs
   ```

### Different parent can delete another parent's uploads

**Check**:
1. Verify each parent uses unique token
2. Tokens must not be shared between parents
3. If sharing happens, they'll have same uploader_user_id

## Next Steps for Verification

1. **In Production**:
   - Identify a parent who uploaded but can't delete
   - Get their invite token (ask them to copy from URL after login)
   - Check CloudWatch logs during their delete attempt
   - Compare token hash in logs to what we expect

2. **Check Media Records**:
   ```bash
   aws dynamodb scan --table-name MediaTable \
     --filter-expression "attribute_exists(uploader_user_id)" \
     | jq '.Items[] | {media_id, uploader_user_id}'
   ```
   Should show all uploads have `uploader_user_id` set

3. **Verify Thumbnail Generation**:
   ```bash
   aws dynamodb scan --table-name MediaTable \
     --filter-expression "attribute_exists(thumb_key)" \
     | jq '.Items | length'
   ```
   Count of items with `thumb_key` should match roughly count of images

## Files Changed

1. `backend/src/handlers/media_complete.py` - Added token hashing for parents
2. `backend/src/handlers/media_delete.py` - Fixed ownership validation + added logging
3. `frontend/src/lib/api.ts` - Added `getUploaderIdentifier()` helper
4. `frontend/src/pages/Feed.tsx` - Load identifier on mount
5. `test_parent_flow.py` - Automated test script

## Rollback Plan

If issues persist, can revert to previous behavior:
1. Revert commits: `git revert 11c454c 064369e 553cad8`
2. All parents would need to re-upload (old uploads won't have uploader_user_id)
3. Would need alternative solution for parent identification

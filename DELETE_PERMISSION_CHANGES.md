# Delete Permission UI Implementation

## Summary
Implemented permission-aware delete button and selection behavior to improve UX for parents. Backend already enforces permissions (403 responses); frontend now proactively hides/disables actions to prevent user confusion.

## Changes Made

### 1. **frontend/src/lib/api.ts**
Extended `MediaItem` type with uploader tracking:
```typescript
uploader_user_id?: string | null;
uploader_email?: string | null;
```

### 2. **frontend/src/components/PreviewModal.tsx**
Added permission-aware delete button:
- Props: Added `currentUserId?: string | null` and `userRole?: string`
- Added `canDeleteItem()` computed function:
  - ✅ Returns `true` if: admin/coach OR (parent AND owns upload AND has uploader_user_id)
  - ❌ Returns `false` if: parent AND (doesn't own upload OR old upload without owner info)
- Delete button behavior:
  - Admin/Coach: Active button, full delete functionality
  - Parent viewing own upload: Active button, full delete functionality
  - Parent viewing other upload: **Disabled button** with tooltip "You can only delete your own uploads"

### 3. **frontend/src/components/MediaGrid.tsx**
Added permission-aware selection filtering:
- Props: Added `currentUserId?: string | null` and `userRole?: string`
- Added `canDeleteItem()` function (same logic as PreviewModal)
- In select mode:
  - Only deletable items can be selected
  - Non-deletable items show `disabled=true` and `title="You can only select your own uploads"`
  - Click handler checks `!isSelectDisabled` before allowing selection
- Updated PreviewModal call to pass user context

### 4. **frontend/src/components/ThumbnailTile.tsx**
Added disabled state support:
- Props: Added `disabled?: boolean` and `title?: string`
- Rendering:
  - Class: Added `thumbCardDisabled` when disabled
  - Style: `cursor: "not-allowed"`, `opacity: 0.5` when disabled
  - Click: Prevents `onClick()` when disabled
  - Tooltip: Shows `title` attribute on hover

### 5. **frontend/src/pages/Feed.tsx**
Connected user context to components:
- Extracted `me.user_id` as `currentUserId`
- Passed `role` as `userRole` to MediaGrid
- MediaGrid now has full context to determine permissions

## Permission Model

### Delete Operation
| User Role | Own Upload | Other's Upload | Legacy Upload |
|-----------|-----------|-----------------|---------------|
| Admin     | ✅ Delete  | ✅ Delete       | ✅ Delete     |
| Coach     | ✅ Delete  | ✅ Delete       | ✅ Delete     |
| Parent    | ✅ Delete  | ❌ Disabled     | ❌ Disabled   |

### Bulk Select Mode
| Scenario | Selectable | Reason |
|----------|-----------|--------|
| Admin selecting any media | ✅ Yes | Admin can delete anything |
| Parent selecting own uploads | ✅ Yes | Can delete own uploads |
| Parent selecting others' uploads | ❌ No | Cannot delete; disabled with tooltip |

## Backend Validation (No Changes)
Backend already enforces these permissions in [backend/src/handlers/media_delete.py](../backend/src/handlers/media_delete.py):
- Returns `403` if parent tries to delete non-own upload
- Returns `403` if no `uploader_user_id` for parent (legacy uploads)
- Admin/coach always allowed

## Testing Checklist

### Test 1: Admin Viewing All Media
- [ ] Log in as admin
- [ ] View thumbnail grid
- [ ] Click on any media item → PreviewModal opens
- [ ] Delete button is **visible and active**
- [ ] Click delete → item removed
- [ ] In select mode: all items **selectable** in bulk

### Test 2: Parent Viewing Own Uploads
- [ ] Log in as parent/uploader
- [ ] View media that you uploaded (has `uploader_user_id` matching your user_id)
- [ ] Click on own media → PreviewModal opens
- [ ] Delete button is **visible and active**
- [ ] Click delete → item removed
- [ ] In select mode: own items **selectable** in bulk

### Test 3: Parent Viewing Others' Uploads
- [ ] Log in as parent/uploader
- [ ] View media uploaded by another user (has different `uploader_user_id`)
- [ ] Click on other's media → PreviewModal opens
- [ ] Delete button is **visible but DISABLED**
- [ ] Hover over delete button → tooltip shows "You can only delete your own uploads"
- [ ] Click attempt has no effect (no error)
- [ ] In select mode: other's items show **disabled cursor** (`not-allowed`), **cannot select**
- [ ] Hover over tile → tooltip shows "You can only select your own uploads"

### Test 4: Legacy Uploads (No uploader_user_id)
- [ ] Manually create a media record without `uploader_user_id` (old uploads)
- [ ] As parent/uploader: view this media
- [ ] Delete button is **visible but DISABLED**
- [ ] In select mode: item is **not selectable**
- [ ] As admin: view same media
- [ ] Delete button is **visible and active**

### Test 5: Role Transitions
- [ ] Create media as uploader
- [ ] Delete own media (should work)
- [ ] Ask admin to revoke your uploader role → change to "viewer"
- [ ] Try to view/delete old uploads (should be read-only, no delete button)
- [ ] Ask admin to add you back as uploader
- [ ] Confirm delete button reappears for own uploads

## Files Modified
1. `/frontend/src/lib/api.ts` - MediaItem type
2. `/frontend/src/components/PreviewModal.tsx` - Delete button logic
3. `/frontend/src/components/MediaGrid.tsx` - Selection filtering + context passing
4. `/frontend/src/components/ThumbnailTile.tsx` - Disabled state styling
5. `/frontend/src/pages/Feed.tsx` - User context extraction

## Deployment Notes
- No backend changes required (permissions already enforced)
- No database changes required
- Frontend-only UX improvement
- CloudFront cache invalidation may be needed (`/*` path)

## Future Improvements
1. Show owner name/email in media grid hover
2. Sort media by uploader to group owned uploads
3. Add filter: "Show only my uploads"
4. Audit logging for failed delete attempts

# Coach Dashboard Team Management - Implementation Guide

## Overview

This document describes the new team management features added to the Coach Dashboard, enabling coaches to rename and delete teams directly from the dashboard interface.

## Features Implemented

### 1. Team Rename (PUT /teams/{team_id})

**Backend Endpoint:**
- **Route:** `PUT /teams/{team_id}`
- **Headers:** `x-invite-token` (required, admin role)
- **Request Body:** `{ "team_name": "New Team Name" }`
- **Response:** Updated team object with `team_id`, `team_name`, `team_code`, `updated_at`
- **Permissions:** Admin role on the team required
- **Audit:** Logs team_updated event with field and new value

**Frontend Integration:**
- TeamActionsMenu component displays ⋯ button on each team card
- RenameTeamModal shows text input with current team name
- Modal validates non-empty input and only sends if changed
- On success, updates local state immediately
- Updates persist across navigation

### 2. Team Delete (DELETE /teams/{team_id})

**Backend Endpoint:**
- **Route:** `DELETE /teams/{team_id}`
- **Headers:** `x-invite-token` (required, admin role)
- **Response:** `{ "team_id": "...", "deleted_at": timestamp }`
- **Behavior:** Soft delete - marks team with `deleted_at` timestamp
- **Side Effects:** Revokes all invite tokens for the team (sets `revoked_at`)
- **Permissions:** Admin role on the team required
- **Audit:** Logs team_deleted event with team name

**Frontend Integration:**
- DeleteTeamModal requires confirmation by typing "DELETE"
- Shows warning message about consequences
- Disables button until confirmation text matches
- On success, removes team from dashboard list
- User is not automatically logged out (retains coach session)

### 3. Back to Dashboard Navigation

**Frontend Feature:**
- Added "Back to Dashboard" button in Feed header
- Only visible for coaches (if `me?.user_id` exists)
- Positioned next to "Leave" button
- Uses same navigation pattern as other buttons
- Preserves coach session (doesn't clear tokens)

## File Structure

### Backend Files

**New Handler Files:**
- `backend/src/handlers/teams_update.py` - PUT /teams/{team_id}
- `backend/src/handlers/teams_delete.py` - DELETE /teams/{team_id}

**Modified Files:**
- `backend/src/main.py` - Added route handlers for PUT and DELETE team endpoints

**Router Pattern:**
```python
if method == "PUT" and path.startswith("/teams/"):
    parts = path.split("/")
    if len(parts) == 3:
        team_id = parts[2]
        body = _json_body(event)
        return handle_teams_update(event, body, team_id=team_id)

if method == "DELETE" and path.startswith("/teams/"):
    parts = path.split("/")
    if len(parts) == 3:
        team_id = parts[2]
        return handle_teams_delete(event, team_id=team_id)
```

### Frontend Files

**New Component Files:**
- `frontend/src/components/TeamActionsMenu.tsx` - ⋯ menu with Rename/Delete options
- `frontend/src/components/RenameTeamModal.tsx` - Modal for renaming team
- `frontend/src/components/DeleteTeamModal.tsx` - Modal with confirmation for deletion

**Modified Files:**
- `frontend/src/pages/CoachDashboard.tsx` - Integrated modals and action menu
- `frontend/src/pages/Feed.tsx` - Added "Back to Dashboard" button

## Component Architecture

### TeamActionsMenu
- Displays ⋯ button on hover-visible state
- Shows dropdown menu on click
- Menu items: "Rename Team" (blue), "Delete Team" (red)
- Handles open/close state with backdrop click
- Styled to match existing UI theme

### RenameTeamModal
- Input field pre-filled with current team name
- Form validation (non-empty, trim whitespace)
- Shows error messages from API
- Loading state while request in flight
- Cancel and Save buttons

### DeleteTeamModal
- Destructive action warning
- Requires user to type "DELETE" to confirm
- Confirmation input validation
- Shows error messages from API
- Loading state while request in flight
- Cancel and Delete Team buttons (red)

### CoachDashboard
- Manages state for active modals: `renameModal`, `deleteModal`
- Passes teamId and teamName to modals
- Updates local team list on success
- Handles error messages with `modalError` state

### Feed
- Checks for `me?.user_id` to determine if coach
- Renders "Back to Dashboard" button if coach
- Uses same navigation pattern as other routes
- Preserves coach session when navigating back

## Permission Model

**Team Rename (PUT):**
- Requires: Valid invite token with admin role on team
- Backend: `require_invite()` + `require_role(["admin"], team_id)`
- Audit: Logs field and new value

**Team Delete (DELETE):**
- Requires: Valid invite token with admin role on team
- Backend: `require_invite()` + `require_role(["admin"], team_id)`
- Side Effect: Revokes all associated invite tokens
- Audit: Logs team name and deletion

**Back to Dashboard:**
- Visible only if: `me?.user_id` exists (coach user)
- Navigation: Doesn't require auth check (coach already authenticated)

## Error Handling

**Rename Endpoint:**
- 400: Missing team_id or team_name
- 401: Missing or invalid invite token
- 403: User is not admin of team
- 404: Team not found
- 500: Database error

**Delete Endpoint:**
- 400: Missing team_id
- 401: Missing or invalid invite token
- 403: User is not admin of team
- 404: Team not found
- 500: Database error

**Frontend:**
- Displays errors in modals
- Logs to console for debugging
- Gracefully continues on invite revocation errors (soft delete completes)

## Testing

### Manual Testing Checklist

1. **Rename Team**
   - [ ] Click ⋯ on team card
   - [ ] Select "Rename Team"
   - [ ] Enter new name
   - [ ] Click Save
   - [ ] Verify name updates on dashboard
   - [ ] Refresh page - name persists
   - [ ] Try empty name - shows error

2. **Delete Team**
   - [ ] Click ⋯ on team card
   - [ ] Select "Delete Team"
   - [ ] Read warning message
   - [ ] Try to click Delete without typing "DELETE" - button disabled
   - [ ] Type "DELETE"
   - [ ] Click Delete Team
   - [ ] Verify team removed from dashboard
   - [ ] Try to access team feed (should fail with 401)

3. **Back to Dashboard**
   - [ ] Open a team as coach
   - [ ] Verify "Back to Dashboard" button appears
   - [ ] Click it
   - [ ] Verify return to coach dashboard
   - [ ] Verify coach session preserved

4. **Permissions**
   - [ ] Try to rename team as uploader/viewer - should fail with 403
   - [ ] Try to delete team as uploader/viewer - should fail with 403
   - [ ] Try without auth token - should fail with 401

### Automated Tests

Run `test_dashboard.py` to test API endpoints:

```bash
cd backend

# Test with error handling only
API_BASE_URL=http://localhost:8000 TEAM_ID=<team_id> INVITE_TOKEN=<token> python3 test_dashboard.py

# Run all tests including rename/delete
RUN_DESTRUCTIVE_TESTS=1 API_BASE_URL=... INVITE_TOKEN=... python3 test_dashboard.py
```

## Database Schema Notes

**TeamsTable:**
- New field: `deleted_at` (timestamp) - Set when team is soft-deleted
- New field: `updated_at` (timestamp) - Set when team name is updated

**InvitesTable:**
- Requires GSI: `gsi1pk-gsi1sk-index` on `gsi1pk` (team_id)
- Used for querying all invites for a team during deletion

**Soft Delete Strategy:**
- Teams marked with `deleted_at` are considered deleted
- `handle_get_coach_teams` should filter out deleted teams
- Invite tokens are revoked (set `revoked_at`) but not deleted
- This allows audit trail and recovery if needed

## Future Enhancements

1. **Edit Team Code:** Allow coaches to regenerate or customize team codes
2. **Transfer Team:** Allow transferring admin role to another user
3. **Hard Delete:** Add option to permanently delete team (not just soft delete)
4. **Bulk Actions:** Select multiple teams and perform batch operations
5. **Team Settings:** More granular team configuration options
6. **Member Management:** Add/remove team members from dashboard
7. **Restore Deleted Teams:** Admins can restore recently deleted teams

## Known Limitations

1. **Team Recovery:** No UI for restoring soft-deleted teams (admin only, manual DB recovery)
2. **Invite Revocation Errors:** If revoke fails, team is still deleted but invites remain active
3. **Cascading Deletes:** Media files are not deleted (only team and invites marked)
4. **Parent Access:** After team delete, parents can still download previously cached presigned URLs
5. **Multiple Tabs:** Dashboard state not synced across browser tabs (refresh needed)

## Deployment Checklist

- [ ] Backend handlers created and imported
- [ ] Route handlers added to main.py
- [ ] Frontend components created
- [ ] Modal integrations added to CoachDashboard and Feed
- [ ] TypeScript types validated
- [ ] Python syntax validated
- [ ] Git commit created
- [ ] CDK deployment triggered
- [ ] API endpoints tested with curl/Postman
- [ ] Frontend tested in browser
- [ ] Audit logs verified

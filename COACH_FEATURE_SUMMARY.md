# Coach Authentication & Team Management - Feature Summary

## Overview
Implemented a complete coach authentication and team management system that allows coaches to sign in via email, create teams, and manage their team roster.

## Features Implemented

### 1. Coach Authentication Flow (Email-Based Magic Links)
**Components Created:**
- `CoachSignIn.tsx` - Email entry page for coach authentication
- `CoachVerify.tsx` - 6-digit verification code entry page
- `CoachDashboard.tsx` - Dashboard showing all teams managed by coach

**Backend Handlers:**
- `auth_coach_signin.py` - Generates 6-digit code, stores in AuthCodesTable, sends via SES email
- `auth_verify_coach.py` - Verifies code, creates/finds user, returns user_token

**Flow:**
1. Coach lands on homepage → clicks "Coach? Sign in"
2. Enters email → receives 6-digit magic link code via SES
3. Enters code → gets user_token stored in localStorage
4. Navigates to Coach Dashboard

### 2. Coach Dashboard
**Features:**
- Display all teams where coach is admin
- "Open Team" button to access team media feed
- "Create a Team" button to create new teams
- "Sign Out" button to clear session
- "Signed in as {email}" indicator for trust

**Backend Endpoint:**
- `GET /coach/teams` - Returns list of teams with admin tokens (requires x-user-token header)

### 3. Coach Team Creation
**Updated Components:**
- `CreateTeamForm.tsx` - Now sends x-user-token header when coach creates team
- `SetupKeyPrompt.tsx` - Removed redundant intermediate button, shows setup key form immediately

**Backend Updates:**
- `teams_create.py` - Now accepts user_id parameter to link coach to team
- `main.py` - Extracts user_id from x-user-token header when coach creates team

**Process:**
1. Coach clicks "Create a Team" on dashboard
2. Enters setup key → immediately shows setup key input form (no intermediate page)
3. Creates team → sees team code confirmation
4. Clicks "Continue as Admin" → enters team media feed with admin permissions
5. Team is automatically added to coach's dashboard on next login

### 4. Team Membership Tracking
**New Database Table:**
- `TeamMembersTable` - Links users to teams with role and admin token
  - Partition Key: user_id
  - Sort Key: team_id
  - Contains: role (admin/uploader/viewer), created_at, invite_token (admin token stored here)

**Functionality:**
- When coach creates team: coach is added to TeamMembersTable as admin with invite_token
- When coach signs back in: system queries TeamMembersTable to find all managed teams
- If invite_token missing: system auto-generates new admin token on-demand

### 5. Database & Infrastructure Updates
**New Tables:**
- `UserTokensTable` - Maps token_hash to user_id for coach session management
  - Partition Key: token_hash
  - Contains: user_id, email, created_at
  
- `AuthCodesTable` - Stores 6-digit verification codes with 10-min TTL
  - Partition Key: code_hash
  - Contains: email, expires_at, used flag

- `TeamMembersTable` - User-team relationships (described above)

**CDK Updates:**
- Added three new DynamoDB tables to `team_media_hub_stack.py`
- Added x-user-token to API Gateway CORS headers
- Added three new routes to HTTP API: /auth/coach-signin, /auth/verify-coach, /coach/teams
- Added IAM grants for Lambda to access new tables

### 6. Frontend Routing
**App.tsx Updates:**
- Added routes: /coach/signin, /coach/verify, /coach/dashboard, /coach/setup-key
- Added state management for coach authentication (hasUserToken)
- Routes only accessible after coach verification
- Re-check invite token on navigation (fixes Open Team redirect requiring reload)

**Landing Page Updates:**
- `LandingPageNew.tsx` - Updated to show "Coach sign-in" link (removed "Create a team" link)
- New coaches must sign in first before accessing team creation

## Key Files Modified/Created

### Frontend
- ✅ NEW: `CoachSignIn.tsx`
- ✅ NEW: `CoachVerify.tsx`
- ✅ NEW: `CoachDashboard.tsx`
- ✅ UPDATED: `CreateTeamForm.tsx` - Added user_token header support
- ✅ UPDATED: `SetupKeyPrompt.tsx` - Removed redundant button, shows form immediately
- ✅ UPDATED: `LandingPageNew.tsx` - Removed "Create a team" link
- ✅ UPDATED: `App.tsx` - Added coach routing, state management, route handlers

### Backend
- ✅ NEW: `auth_coach_signin.py` - Coach sign-in handler
- ✅ NEW: `auth_verify_coach.py` - Coach code verification handler
- ✅ NEW: `coach_teams.py` - Fetch coach's teams endpoint
- ✅ UPDATED: `teams_create.py` - Links coach to team via user_id, stores invite_token in TeamMembersTable
- ✅ UPDATED: `main.py` - Routes coach endpoints, extracts user_id from token
- ✅ UPDATED: `common/config.py` - Added DYNAMODB resource export

### Infrastructure
- ✅ UPDATED: `team_media_hub_stack.py` - Added UserTokensTable, AuthCodesTable, TeamMembersTable, CORS headers, routes, IAM grants

## Authentication & Authorization

**Coach Token Flow:**
1. Coach enters email → `auth_coach_signin` generates code + stores code_hash in AuthCodesTable
2. Coach verifies code → `auth_verify_coach` creates UserTokensTable entry with token_hash → user_id mapping
3. Token stored in localStorage as `tmh_user_token`
4. All coach endpoints require x-user-token header for validation

**Team Access:**
- Coaches can only see teams in TeamMembersTable where they are admin
- Each team has an admin invite_token (actual token, not hash) for media feed access
- When coach opens team: invite_token stored in localStorage + routed to media feed

## Bug Fixes & Refinements

### Fixed Issues:
1. ✅ Removed redundant "Create Team" button in setup-key flow
2. ✅ Coach navigates to team feed immediately after creation (not back to dashboard)
3. ✅ Teams appear in coach dashboard after sign-out/sign-in
4. ✅ TeamMembersTable queried correctly by partition key (not non-existent GSI)
5. ✅ Auto-generates admin tokens when coach opens previously-created teams
6. ✅ Frontend sends x-user-token when coach creates team (backend can link them)
7. ✅ Fixed role filtering bug: coach_teams.py filters for role="coach" or role="admin", manually updated existing records from "uploader" to "coach"
8. ✅ Fixed Open Team navigation so feed loads immediately without refresh

## Email Integration

**SES Setup:**
- Uses AWS SES for sending magic link codes
- Domain `teammediahub.co` verified in us-east-1
- Sending from `noreply@teammediahub.co`
- Email template: Simple text email with 6-digit code and expiration info
- Codes expire in 10 minutes

## Testing Checklist

Coach flow end-to-end:
- ✅ Coach signs in via email → receives code → verifies → lands on dashboard
- ✅ Coach creates team → sees team code → continues to team feed
- ✅ Coach signs out → signs back in → sees team in dashboard
- ✅ Coach clicks "Open Team" → enters team media feed as admin
- ✅ Multiple teams appear on dashboard if coach created/manages multiple

Parent flow (unchanged):
- ✅ Parent still uses team code to join via /join page
- ✅ Parent sees "Join with Team Code" button on homepage
- ✅ Coach sign-in doesn't interfere with parent flow
- ✅ Parent join flow works without per-email SES verification

## Known Limitations

1. **Free Tier AWS** - Cannot use Route53 for custom domain setup
2. **SES Sandbox** - No longer applicable after domain verification
3. **No invite coaches feature** - Admins cannot invite other coaches yet
4. **No team settings** - Coaches cannot edit team details after creation
5. **No coach roles** - All coaches have admin role (no editor/viewer roles for coaches yet)

## Future Enhancements

1. Add "Invite Coach" feature for team admins
2. Add coach role management (admin, editor, viewer)
3. Add team settings page (rename team, change settings)
4. Add "Forgot Email" flow for coaches
5. Add coach activity dashboard (who uploaded, when)
6. Add bulk photo download for coaches
7. Add team member management UI for coaches
8. Implement production SES access for mass email

## Deployment Status

✅ All changes deployed to production
- API: https://5gt1117eh5.execute-api.us-east-1.amazonaws.com/
- Frontend: https://d2u8ibdrwf4t7.cloudfront.net/
- CloudFront Distribution: d2u8ibdrwf4t7.cloudfront.net (ID: E17AEGO4NNV2ME)

Last deployment: 2026-02-02
Commit: fbbea23 (auto-generate admin token when coach opens team if token missing)

# Team Media Hub - AI Assistant Instructions

## Architecture Overview

**Team Media Hub** is a serverless media sharing platform built on AWS with token-based authentication. The architecture separates backend (Lambda/API Gateway) from frontend (React/Vite), deployed via AWS CDK.

### Key Components
- **Backend**: Python Lambda (`backend/src/`) with Flask dev server wrapper ([dev_server.py](backend/src/dev_server.py))
- **Frontend**: React + TypeScript + Vite ([frontend/src/](frontend/src/))
- **Infrastructure**: AWS CDK ([infra/stacks/team_media_hub_stack.py](infra/stacks/team_media_hub_stack.py))
- **Async Processing**: S3-triggered Lambda for thumbnail generation ([backend/src/thumbs/thumbnail_handler.py](backend/src/thumbs/thumbnail_handler.py))

### Data Model
DynamoDB tables use single-table design patterns:
- **Media**: `team_id` (PK) + `sk` (timestamp#media_id) with GSI on `gsi1pk` (media_id) for lookups
- **Invites**: `token_hash` (PK) - never stores raw tokens
- **Audit**: `team_id` (PK) + `sk` (timestamp#event_id) - stores SHA256 hashes of IP/UA/tokens

## Authentication & Authorization

**Invite token flow** (no traditional user accounts):
1. Admin creates team → receives `admin_invite_token` (bearer token)
2. Token passed via `x-invite-token` header to all protected endpoints
3. Backend validates via [require_invite()](backend/src/common/auth.py#L14) which checks:
   - Token hash exists in DynamoDB
   - Not revoked (`revoked_at` field)
   - Not expired (`expires_at` timestamp)
   - Role permissions (`admin`, `uploader`, `viewer`)

**Frontend token storage**: `localStorage` keys are `invite_token` and `team_id` ([AuthContext.tsx](frontend/src/contexts/AuthContext.tsx))

## Media Upload Flow

Multi-step process to prevent phantom records:

1. **Client** → POST `/media/upload-url` with `{filename, content_type, size_bytes}`
2. **Backend** → Returns presigned S3 URL + `media_id` + `object_key`
3. **Client** → Uploads directly to S3 using presigned URL
4. **Client** → POST `/media/complete` with `{media_id, object_key, filename, ...}`
5. **Backend** → Verifies S3 object exists (`s3:HeadObject`), creates DynamoDB record
6. **S3 Event** → Triggers thumbnail Lambda for images

See [media_presign_upload.py](backend/src/handlers/media_presign_upload.py) and [media_complete.py](backend/src/handlers/media_complete.py).

## Development Workflow

### Local Backend Testing
```bash
cd backend/src
python3 dev_server.py  # Requires backend/.env with AWS creds
# In another terminal:
cd backend && python3 test_api.py
```

The dev server ([dev_server.py](backend/src/dev_server.py)) wraps Lambda handlers with Flask to simulate API Gateway locally.

### Local Frontend
```bash
cd frontend
npm install
npm run dev
```

Frontend requires `VITE_API_BASE_URL` in [frontend/.env](frontend/.env) pointing to deployed API or local dev server.

### Deployment
- **Main branch push** triggers [.github/workflows/deploy.yml](.github/workflows/deploy.yml)
- Runs `cdk deploy` with `SETUP_KEY` from GitHub secrets
- Frontend auto-deploys to S3 via CDK `BucketDeployment` construct

## Code Conventions

### Backend Patterns
- **Route handlers**: Return `ok()` or `err()` from [common/responses.py](backend/src/common/responses.py)
- **Auth decorators**: Use `require_invite()` + `require_role()` at handler start (see any handler in [handlers/](backend/src/handlers/))
- **Audit logging**: Call `write_audit()` for all state changes with hashed tokens
- **DynamoDB access**: Use wrappers in [common/db.py](backend/src/common/db.py) (`get_item`, `put_item`, `query_items`)

### Frontend Patterns
- **API calls**: Use [lib/api.ts](frontend/src/lib/api.ts) request wrapper which auto-injects `x-invite-token`
- **Auth state**: Access via `useAuth()` hook from [AuthContext](frontend/src/contexts/AuthContext.tsx)
- **Media URLs**: Use [mediaUrlCache.ts](frontend/src/lib/mediaUrlCache.ts) to manage presigned download URL lifecycles

### Routing
Lambda routing is explicit in [main.py](backend/src/main.py) `handler()` - no framework magic. Each route is an `if method == X and path == Y` block.

## Thumbnail Generation

Separate Lambda ([thumbnail_handler.py](backend/src/thumbs/thumbnail_handler.py)) triggered by S3 `ObjectCreated` events:
- Reads media metadata from DynamoDB GSI using `media_id`
- Generates JPEG thumbnail (512x512 max, 78% quality) with EXIF orientation fix
- Stores to `thumbnails/{team_id}/{media_id}.jpg`
- Updates DynamoDB record with `thumb_key`

Requires Pillow in Lambda layer ([layer_pillow/](layer_pillow/)).

## CDK Infrastructure Notes

- **Parameters**: `DemoEnabled`, `DemoTeamId` allow public demo mode (see [team_media_hub_stack.py](infra/stacks/team_media_hub_stack.py#L28-L55))
- **Environment vars**: Lambda gets table names + bucket name from CDK outputs
- **CORS**: Both S3 and API Gateway have CORS configured (currently `*` for origins)
- **Removal policies**: `DESTROY` with `auto_delete_objects=True` - **NOT production-safe**

## Testing
- No unit test framework yet
- [test_api.py](backend/test_api.py) makes live HTTP calls to dev server
- Frontend has no test suite

## Security Model
- No AWS credentials in frontend - all S3 access via presigned URLs
- Tokens are SHA256 hashed before storage
- Audit logs never store raw tokens/IPs/UAs
- S3 bucket is private; CloudFront serves content via presigned URLs from API

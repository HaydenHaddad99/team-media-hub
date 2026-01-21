# Team Media Hub Frontend

Mobile-first React + TypeScript + Vite frontend for the Team Media Hub application.

## Features

- ✅ Invite-link UX: Open `/?token=...` to join a team
- ✅ Token saved to localStorage for persistence
- ✅ Media feed with upload/download capabilities
- ✅ Client-side file validation (type & size)
- ✅ Mobile-first responsive design
- ✅ S3 presigned URL upload flow

## Setup

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Environment Variables

Copy `.env` and update as needed:

```
VITE_API_URL=https://5gt1117eh5.execute-api.us-east-1.amazonaws.com
```

## Testing

1. Get an invite token from the backend
2. Visit `http://localhost:5173/?token=YOUR_TOKEN`
3. Upload and download media files

## Project Structure

```
src/
  components/        # React components
  contexts/          # Auth context
  lib/              # API client & validation
  styles/           # CSS for each component
  App.tsx           # Main app
  main.tsx          # Entry point
```

# PWA Implementation - Team Media Hub

## Overview

Team Media Hub now supports Progressive Web App (PWA) installation on mobile devices and desktops, providing a native-like experience without requiring app store distribution.

### Phase 1 Features (MVP)

✅ **Installability**
- Android: Chrome install prompt (native `beforeinstallprompt`)
- iOS: Safari manual "Add to Home Screen" instructions with persistent modal

✅ **Offline Support**
- App shell caching (HTML, CSS, JS, assets)
- Offline fallback page when no connection
- **Strategic exclusion**: CloudFront signed URLs and API calls not cached (always fresh)

✅ **Deep Linking**
- Works on home screen install and browser refresh
- Manual routing handles all SPA paths: `/join`, `/team/:id`, `/share/:token`, etc.

✅ **Icons & Branding**
- 192px and 512px icons
- Maskable variants for adaptive icons (Android)
- Dark theme matching app design

## Architecture

### Files Added

```
frontend/
  ├── public/
  │   ├── manifest.webmanifest         # PWA metadata + icons
  │   ├── offline.html                 # Fallback when offline
  │   ├── sw.ts                        # Service worker (compiled to sw.js)
  │   └── icons/
  │       ├── icon-192.svg, icon-512.svg
  │       ├── icon-192-maskable.svg, icon-512-maskable.svg
  │       └── screenshot-*.svg
  └── src/
      └── components/
          ├── InstallPrompt.tsx         # Android: install banner
          ├── InstallPrompt.css
          ├── IOSInstallModal.tsx       # iOS: instructions popup
          └── IOSInstallModal.css
```

### Service Worker Strategy

| URL Pattern | Strategy | Rationale |
|---|---|---|
| `app.teammediahub.co/` | Network-first | Fresh HTML on each load; fallback to cached |
| `*.js, *.css, *.png` | Cache-first | Assets rarely change; fallback to network |
| `media.teammediahub.co/*` | Network-only | Signed URLs = sensitive credentials |
| `!Policy= or !Signature=` | Network-only | Signed query params = never cache |
| `api.teammediahub.co/*` | Network-only | Always fresh data |

### Android Install Flow

1. User opens app in Chrome/Edge
2. Browser detects PWA manifests → fires `beforeinstallprompt` event
3. **InstallPrompt** component shows banner at bottom
4. User taps "Install" → native system install dialog
5. App appears on home screen with icon

### iOS Install Flow

1. User opens app in Safari
2. After first successful login (token detected), **IOSInstallModal** appears (one-time)
3. Modal shows step-by-step instructions:
   - Tap Share button (bottom menu)
   - Select "Add to Home Screen"
   - Tap Add
4. App installed with custom icon/name
5. Dismissed state saved in `localStorage` (`tmh_ios_install_dismissed`)

## Configuration

### vite.config.ts

```typescript
VitePWA({
  registerType: 'autoUpdate',          // SW updates automatically
  manifest: { ... },                   // Served at /manifest.webmanifest
  workbox: {
    globPatterns: [...],               // Precache app shell
    runtimeCaching: [...],             // Cache strategies
    skipWaiting: true,                 // Activate new SW immediately
    clientsClaim: true,                // Claim existing tiles
  },
})
```

### manifest.webmanifest

Key fields:
- `start_url: "/"` - Opens to home when launched from icon
- `scope: "/"` - All URLs within app
- `display: "standalone"` - Full-screen, no browser chrome
- `theme_color` & `background_color` - Match dark theme (#00aeff, #0f0f1e)
- `shortcuts` - Quick actions (Android 7.1+, iOS 15+)

### Service Worker (sw.ts)

Compiled to `dist/sw.js` by Vite build.

**Installation phase:**
- Precaches `index.html` and precache URLs

**Activation phase:**
- Cleans up old cache versions

**Fetch phase:**
- Intercepts all requests
- Routes to appropriate cache strategy based on URL/type

## Testing

### Android (Chrome/Edge)

1. Open in Chrome on Android device
2. Wait 2-3 seconds → banner appears at bottom
3. Tap "Install"
4. Confirm install dialog
5. Home screen should show "TMH" icon
6. Test deep links:
   - Tap icon → opens `/`
   - Share: `https://app.teammediahub.co/share/token123`
   - Close browser completely, tap icon → app opens

### iOS (Safari)

1. Open in Safari on iPhone/iPad
2. Navigate to `https://app.teammediahub.co`
3. Sign in with OTP (get invite token)
4. Modal appears: "📱 Install Team Media Hub"
5. Follow instructions (tap Share → Add to Home Screen)
6. Icon appears on home screen
7. Test deep links:
   - Tap icon → opens `/`
   - Refresh page on `/join` or `/team/id` → should not 404

### Desktop (Chrome/Edge)

1. Open in browser
2. Address bar shows install icon (puzzle piece on Chrome)
3. Click install
4. App appears in app drawer, desktop shortcuts

### Offline Testing

**On desktop/mobile:**
1. Open DevTools (Chrome: F12)
2. Go to Application → Service Workers
3. Check "Offline" checkbox
4. Refresh page → loads from cache
5. Try `/join` or `/team/123` → offline fallback (if not in cache)
6. Media URLs → offline error (correctly not cached)

## Production Considerations

### 1. Icon & Screenshot Assets

Icons in `public/icons/` are currently SVG placeholders. For production:

```bash
# Convert to PNG 192x192 and 512x512
# Tools: ImageMagick, ffmpeg, or online converters
convert -background none -size 192x192 icon-192.svg icon-192.png
convert -background transparent -size 512x512 icon-512.svg icon-512.png

# Maskable versions (add padding for safe zone)
# Safe zone = inner 66% of icon (Android spec)
```

Update manifest:
```json
"icons": [
  {
    "src": "/icons/icon-192.png",
    "sizes": "192x192",
    "purpose": "any"
  },
  ...
]
```

### 2. Cache Invalidation

Vite PWA automatically versioning assets (hashed filenames). For HTML:

```javascript
// vite.config.ts
workbox: {
  runtimeCaching: [
    {
      urlPattern: /^https:.*\/.+/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'http-cache',
        expiration: { maxAgeSeconds: 24 * 60 * 60 },
      },
    },
  ],
}
```

### 3. Analytics

Track PWA adoption:
- `navigator.serviceWorker.ready` → SW active
- `window.matchMedia('(display-mode: standalone)').matches` → Installed mode
- `beforeinstallprompt` → Install opportunity

### 4. Future Phases

**Phase 2:** Push Notifications
- Server sends push when new photo uploaded
- Notification opens app to that photo

**Phase 3:** Background Sync
- Queue uploads when offline
- Sync when reconnected

**Phase 4:** Audio/Video Recording
- Camera access via PWA permissions API
- Record and auto-upload (complex)

## Troubleshooting

### Install prompt not appearing

**Android:**
- Chrome/Edge only (Firefox has different UX)
- App must be served over HTTPS ✓
- Must have manifest.webmanifest ✓
- Must have SW ✓
- Has not been installed already

**iOS:**
- Safari only
- Must be on HTTPS ✓
- Add to Home Screen = built into iOS (not our code)
- Modal only shows after first login

### SW not updating

```javascript
// Force SW update (in console)
navigator.serviceWorker.getRegistrations().then(regs => {
  regs.forEach(r => r.unregister())
});
location.reload();
```

### Media URLs not loading in offline mode

**By design.** Signed URLs have sensitive credentials (Policy, Signature params). They're never cached. Users see "offline - media unavailable" message.

**Workaround for future:** Pre-download photos to IndexedDB (Phase 3).

### Deep links return 404 in installed mode

The CDK stack already handles this in CloudFront error responses:
- 404 → `/index.html` (200 OK)
- 403 → `/index.html` (200 OK)

Manual routing in `App.tsx` then renders correct page based on `window.location.pathname`.

## Testing Checklist

- [ ] Android Chrome: Install banner appears
- [ ] Android Chrome: App launches from home screen
- [ ] Android Chrome: Deep link `/join` opens correctly
- [ ] Android Chrome: Refresh on `/team/xyz` doesn't 404
- [ ] iOS Safari: Modal appears after login
- [ ] iOS Safari: Home screen install works
- [ ] iOS Safari: Deep link `/join` opens correctly
- [ ] Offline: App shell loads (HTML, CSS, JS)
- [ ] Offline: Media URLs show error (not served from cache)
- [ ] Offline: API calls show error (not served from cache)
- [ ] DevTools > Application: SW status "activated and running"
- [ ] DevTools > Application: Cache storage shows precached assets

## References

- [MDN: Web App Manifest](https://developer.mozilla.org/en-US/docs/Web/Manifest)
- [MDN: Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [Vite PWA Plugin](https://vite-pwa-org.netlify.app/)
- [Workbox](https://developers.google.com/web/tools/workbox)
- [Web.dev: PWA Checklist](https://web.dev/pwa-checklist/)

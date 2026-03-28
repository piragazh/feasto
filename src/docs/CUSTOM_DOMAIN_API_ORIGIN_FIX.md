# Custom Domain API Origin Fix

## Overview

This fix separates **frontend origin** (where the app runs) from **API origin** (where `/api` endpoints live). This enables custom domains to work correctly.

**Problem Solved:** Custom domains were failing on boot because:
- Frontend runs on `restaurant.com` 
- API endpoints live on `base44-platform.app`
- App assumed both were at same origin and made `/api` requests to `restaurant.com`, getting 404s

## Architecture

### API Origin Resolution

Priority order (first match wins):

1. **`VITE_PUBLIC_API_BASE_URL`** — explicit env var (production custom domains)
2. **`window.__BASE44_PLATFORM_DOMAIN`** — injected at runtime (production custom domains)
3. **`VITE_PUBLIC_PLATFORM_DOMAIN`** — env var fallback (CI/preview builds)
4. **`window.location.origin`** — current origin (local dev, same-origin deployments)

### Frontend Origin

Always `window.location.origin` (where the user's browser is accessing the app from).

## Files Changed

### 1. **New: `lib/api-origin.js`**
Centralized config for separating frontend and API origins.

```javascript
export const getApiUrl(path)  // Construct full API URL
export const getApiBaseUrl()  // Get API origin
export const getFrontendOrigin() // Get frontend origin
export const logApiOriginDebug() // Debug logging
```

### 2. **Updated: `lib/AuthContext.jsx`**
Boot flow now uses `getApiUrl()` instead of assuming `window.location.origin`.

**Before:**
```javascript
const apiBaseUrl = window.location.origin;
const res = await fetch(`${apiBaseUrl}/api/apps/public/prod/public-settings/by-id/${appId}`);
```

**After:**
```javascript
const apiUrl = getApiUrl(`/api/apps/public/prod/public-settings/by-id/${appId}`);
const res = await fetch(apiUrl);
```

### 3. **Updated: `App.jsx`**
Fatal error UI now shows technical details to admins/devs instead of blank page.

- Shows error message + retry button
- On dev environments: shows debug info (frontend domain, appId, error type)
- Logs sent to browser console

### 4. **Updated: `index.html`**
Added injection point for platform domain:

```html
<script>
  // window.__BASE44_PLATFORM_DOMAIN = 'preview-sandbox--xxx.base44.app';
  // Injected by deployment config for custom domains
</script>
```

## Deployment Configuration

### For Custom Domains

Before rendering the app, inject the platform domain:

```html
<!-- Add this before <script type="module" src="/src/main.jsx"></script> -->
<script>
  window.__BASE44_PLATFORM_DOMAIN = 'preview-sandbox--694f32ea1bcdfa212c621404.base44.app';
</script>
```

**Or** set env var at build time:
```bash
VITE_PUBLIC_PLATFORM_DOMAIN=preview-sandbox--694f32ea1bcdfa212c621404.base44.app npm run build
```

### For Platform Domains (Same Origin)

No config needed. App will auto-detect and use current origin.

### For Local Development

No config needed. `localhost` will use same-origin by default.

## Verification Checklist

- [ ] Open Browser DevTools → Console
- [ ] Look for `[API-Origin-Debug]` log entries
- [ ] Verify `frontend` and `api` origins are correct:
  - Custom domain: frontend=`restaurant.com`, api=`base44-platform.app`
  - Platform domain: both same
- [ ] Verify no 404 errors on `/api/apps/public/prod/public-settings/by-id/:appId`
- [ ] App boots without blank page
- [ ] If error occurs, fatal error UI appears with retry button
- [ ] On dev environments, debug info panel shows in error UI

### Test Scenarios

| Scenario | Frontend | API | Expected |
|----------|----------|-----|----------|
| Custom domain (prod) | restaurant.com | base44-platform.app | ✅ Separate origins work |
| Platform domain | preview-xyz.base44.app | preview-xyz.base44.app | ✅ Same origin works |
| Local dev | localhost:5173 | localhost:5173 | ✅ Same origin works |
| Custom domain (no inject) | restaurant.com | restaurant.com | ❌ 404 on `/api` |

## Logging & Debugging

### Enable Debug Logs

Open browser console and look for:
- `[API-Origin]` — config resolution
- `[API-Origin-Debug]` — frontend vs API origin comparison
- `[AuthContext]` — app state check details
- `[Boot]` — initialization markers

### Example Console Output (Custom Domain)

```javascript
[Boot] No platform domain injected, will use current origin for API calls
[API-Origin-Debug] {
  frontend: "https://restaurant.com",
  api: "https://preview-sandbox--xyz.base44.app",
  sameOrigin: false,
  appId: "694f32ea1bcdfa212c621404"
}
[AuthContext] App state check: {
  appId: "694f32ea1bcdfa212c621404",
  apiUrl: "https://preview-sandbox--xyz.base44.app/api/apps/public/prod/public-settings/by-id/694f32ea1bcdfa212c621404"
}
```

## Security Notes

- API origin config is **not** sensitive (it's public domain names)
- `window.__BASE44_PLATFORM_DOMAIN` is a temporary runtime config injected by the platform
- Auth tokens are still passed securely in headers (not exposed in URLs)
- CORS headers on `/api` must allow requests from custom domain frontend

## Future Improvements

1. Move API origin config to `window.location.pathname` metadata tag (no JS injection needed)
2. Add fetch interceptor to log all API calls with origin for debugging
3. Add health check endpoint to verify API origin connectivity on boot
4. Cache API origin in sessionStorage to avoid re-resolution on page reload

## Related Files

- `api/base44Client.js` — SDK client (already handles relative URLs correctly)
- `lib/app-params.js` — App parameters (appId, token, etc.)
- `App.jsx` — App shell (renders error UI)
- `AuthContext.jsx` — Boot flow (uses API origin)
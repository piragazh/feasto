# Custom Domain Deployment Checklist

## Pre-Deployment (Code Ready ✅)

- [x] API origin config system implemented (`lib/api-origin.js`)
- [x] AuthContext uses dedicated API origin (boot flow fixed)
- [x] Visible error fallback UI in place (no blank page)
- [x] Runtime injection point added (`index.html`)
- [x] Debug logging implemented
- [x] Documentation complete

## Deployment Steps (Per Custom Domain)

### Step 1: Identify Platform Domain

Find the Base44 platform domain where this app's backend lives:

```
preview-sandbox--694f32ea1bcdfa212c621404.base44.app
```

This is where `/api` endpoints are served.

### Step 2: Get Customer Domain

The custom domain the restaurant/app is using:

```
pizzeria.com
// or
restaurant-name.app
```

This is where the frontend HTML will be served.

### Step 3: Configure Origin Separation

**Choose one approach:**

#### Approach A: Build-Time Env Var (Recommended)

```bash
# Before building
export VITE_PUBLIC_API_BASE_URL="https://preview-sandbox--694f32ea1bcdfa212c621404.base44.app"
npm run build

# Deploy dist/ to pizzeria.com
```

**Pros:**
- No runtime script injection
- Immutable config
- Built into app

**Cons:**
- Rebuild needed for each domain

#### Approach B: HTML Script Injection (Flexible)

```html
<!-- In deployment template, before app mounts -->
<script>
  window.__BASE44_PLATFORM_DOMAIN = 'preview-sandbox--694f32ea1bcdfa212c621404.base44.app';
</script>
<!-- Then include built app -->
<div id="root"></div>
<script type="module" src="/src/main.jsx"></script>
```

**Pros:**
- Same build, different origins
- Flexible per-deployment

**Cons:**
- Requires HTML template customization
- Runtime config (less immutable)

### Step 4: CORS Configuration

Verify `/api` endpoint CORS headers allow requests from custom domain:

```http
Access-Control-Allow-Origin: https://pizzeria.com
// or
Access-Control-Allow-Origin: *
```

**Check with:**
```bash
curl -H "Origin: https://pizzeria.com" \
  https://preview-sandbox--694f32ea1bcdfa212c621404.base44.app/api/apps/public/prod/public-settings/by-id/694f32ea1bcdfa212c621404
```

Should return 200, not CORS error.

### Step 5: SSL/TLS Certificate

Ensure custom domain has valid SSL certificate:

```bash
# Custom domain must be HTTPS
https://pizzeria.com ✅

# HTTP will fail (mixed content)
http://pizzeria.com ❌
```

### Step 6: DNS Configuration

Ensure DNS points custom domain to deployment server:

```dns
pizzeria.com  A      192.0.2.1
              CNAME  deployment-cdn.example.com
```

### Step 7: Deploy Frontend

Deploy built frontend to custom domain:

```bash
# If Approach A: app has config baked in
gsutil -m cp -r dist/* gs://pizzeria.com/

# If Approach B: inject config in your HTML template
# Template must include window.__BASE44_PLATFORM_DOMAIN
```

### Step 8: Verify Boot

**In browser, navigate to custom domain and check console:**

```javascript
// Should see (within 2 seconds):
[API-Origin-Debug] {
  frontend: "https://pizzeria.com",
  api: "https://preview-sandbox--694f32ea1bcdfa212c621404.base44.app",
  sameOrigin: false,
  appId: "694f32ea1bcdfa212c621404"
}

[AuthContext] App state check: {
  appId: "694f32ea1bcdfa212c621404",
  apiUrl: "https://preview-sandbox--694f32ea1bcdfa212c621404.base44.app/api/apps/public/prod/public-settings/by-id/694f32ea1bcdfa212c621404"
}
```

**App should load without errors.**

## Troubleshooting

### Blank Page on Load

**Check console for error:**

```javascript
[API-Origin-Debug] {
  frontend: "https://pizzeria.com",
  api: "https://pizzeria.com",  // ❌ Wrong! Should be platform domain
  sameOrigin: true
}
```

**Fix:**
- Verify platform domain is injected/configured
- Check `window.__BASE44_PLATFORM_DOMAIN` in console
- Verify `VITE_PUBLIC_API_BASE_URL` was set at build time
- Rebuild if using Approach A

### 404 on `/api/apps/public/prod/public-settings/by-id/...`

**Likely cause:** API origin pointing to custom domain instead of platform

**Fix:**
1. Check API origin in console logs
2. Verify CORS headers on platform `/api` endpoint
3. Confirm platform domain is correct

**Test API directly:**
```bash
curl -H "X-App-Id: 694f32ea1bcdfa212c621404" \
  https://preview-sandbox--694f32ea1bcdfa212c621404.base44.app/api/apps/public/prod/public-settings/by-id/694f32ea1bcdfa212c621404
```

Should return JSON, not 404.

### Mixed Content Error

**Symptom:** Console shows "Mixed Content" warning

**Cause:** Frontend over HTTPS calling API over HTTP (or vice versa)

**Fix:**
- Ensure both frontend and API use HTTPS
- Check env var/injection uses `https://`

```javascript
// ✅ Good
VITE_PUBLIC_API_BASE_URL=https://platform.base44.app

// ❌ Bad
VITE_PUBLIC_API_BASE_URL=http://platform.base44.app
```

### Redirect Loop on Login

**Symptom:** Clicking Sign In goes to login page then back to app infinitely

**Cause:** Auth redirect URL misconfigured

**Status:** ✅ Known, not caused by this fix. Check auth settings separately.

## Post-Deployment Verification

### Automated Tests

Run these in browser console after deployment:

```javascript
// 1. Check origin config
console.log('Frontend:', window.location.origin);
console.log('API:', await import('./lib/api-origin.js').then(m => m.getApiBaseUrl()));

// 2. Check app booted
console.log('App loaded:', document.title !== 'MealDrop - Loading...');

// 3. Check auth state
fetch('/api/apps/public/prod/public-settings/by-id/694f32ea1bcdfa212c621404', {
  headers: { 'X-App-Id': '694f32ea1bcdfa212c621404' }
})
.then(r => r.json())
.then(d => console.log('API call success:', d.name))
.catch(e => console.error('API call failed:', e.message));
```

### User Testing

1. Open custom domain in browser
2. App should load within 3 seconds
3. No blank page
4. No console errors
5. Navigation works
6. API calls succeed

### Monitoring

Monitor these metrics post-deploy:

- **App Boot Time:** Should be <3 seconds
- **API Error Rate:** Should be 0% for public settings fetch
- **Console Errors:** Should be 0 (check browser console stats)
- **Auth Success Rate:** Should be >99%

## Rollback Plan

If deployment fails:

1. **Revert to previous deployment** (if applicable)
2. **Check API connectivity** from custom domain
3. **Verify platform domain** is correct and running
4. **Check CORS headers** on `/api` endpoint
5. **Review console logs** for error messages

## Post-Deployment Documentation

Update your deployment docs with:

```
Custom Domain: pizzeria.com
Platform Domain: preview-sandbox--694f32ea1bcdfa212c621404.base44.app
API Config Method: [Approach A / Approach B]
Deployed By: [Your Name]
Deployed At: [Timestamp]
Verified At: [Timestamp]
```

## Approval Gate

- [ ] Platform domain confirmed correct
- [ ] CORS headers verified on platform API
- [ ] SSL/TLS certificate valid for custom domain
- [ ] DNS pointing custom domain to deployment
- [ ] App boots without errors
- [ ] Console logs show correct origin separation
- [ ] API calls succeed (tested in console)
- [ ] User can login/navigate
- [ ] No blank page or fatal errors

## Sign-Off

- **Deployed By:** ___________________
- **Date:** ___________________
- **Verified By:** ___________________
- **Notes:** ___________________

---

**Reference:** See `docs/CUSTOM_DOMAIN_API_ORIGIN_FIX.md` for detailed configuration guide.
# Custom Domain Deployment Checklist

**Domain:** `tilburychicken.co.uk`  
**Platform Domain:** `preview-sandbox--694f32ea1bcdfa212c621404.base44.app`  
**Date:** 2026-03-28

---

## Pre-Deployment Checklist

- [ ] **Code changes verified**
  - `index.html` updated with `window.__BASE44_PLATFORM_DOMAIN` injection
  - `lib/api-origin.js` implements dynamic platform domain resolution
  - No breaking changes to existing functionality

- [ ] **Build tested locally**
  ```bash
  npm run build
  ```
  - Verify `dist/index.html` contains the platform domain injection
  - Verify `dist/src/main.jsx` exists and is readable

- [ ] **Environment variables set**
  - `VITE_BASE44_APP_ID` available (if needed)
  - `STRIPE_SECRET_KEY`, `VITE_STRIPE_PUBLIC_KEY` configured
  - All other secrets in place (see existing secrets list)

---

## Deployment Steps

### Step 1: Build the Application
```bash
npm run build
```
✅ Creates optimized build in `dist/` folder with all assets

### Step 2: Deploy Full `dist/` Folder
**CRITICAL:** Upload the ENTIRE `dist/` directory to the hosting provider, not just `index.html`

```
dist/
├── index.html          ← Must include platform domain injection
├── src/
│   └── main.jsx       ← React entry point
├── assets/            ← All bundled CSS, JS, images
└── ...                ← All other static files
```

**Common mistakes to avoid:**
- ❌ Only uploading `index.html` (causes blank page — missing React bundle)
- ❌ Not clearing CDN cache after upload
- ❌ Uploading old build without platform domain injection

### Step 3: Clear CDN/Server Cache
```bash
# If using CDN (Cloudflare, etc.)
# Purge cache for tilburychicken.co.uk

# If using server cache
# Clear browser cache by appending version parameter to main.jsx
```

### Step 4: Verify Deployment
Run the verification script:
```bash
bash scripts/verify-production-deployment.sh
```

Or manually check:
```bash
# Check HTML loads
curl https://tilburychicken.co.uk | grep '<div id="root">'

# Check React script present
curl https://tilburychicken.co.uk | grep 'src="/src/main.jsx"'

# Check platform domain injected
curl https://tilburychicken.co.uk | grep "window.__BASE44_PLATFORM_DOMAIN"
```

---

## Post-Deployment Testing

### 1. Browser Console (Critical)
Open DevTools (F12) → Console and look for:
```
[API-Origin] Frontend: tilburychicken.co.uk
[API-Origin] API Origin: preview-sandbox--694f32ea1bcdfa212c621404.base44.app
```

✅ **Expected:** Both lines present, matching the platform domain

❌ **Problem:** Messages missing → API origin resolution failed

---

### 2. Load Test
1. Open `https://tilburychicken.co.uk`
2. Wait for React to fully load (spinning loader should disappear)
3. Check page displays restaurant menu or home page
4. ✅ Page should NOT be blank

**If blank page:**
- F12 → Console → Check for errors
- Check Network tab → Look for failed requests
- Verify React script loaded: `src/main.jsx` should show 200 status

---

### 3. API Requests Test
1. Open DevTools → Network tab
2. Click "Add to Cart" or navigate a page
3. Filter by XHR/Fetch requests
4. Verify requests go to: `https://preview-sandbox--694f32ea1bcdfa212c621404.base44.app/api/...`

❌ **Problem:** Requests going to `https://tilburychicken.co.uk/api/...` → CORS will fail

---

### 4. Authentication Flow Test
1. Log out (if logged in)
2. Click "Sign In"
3. Complete login flow
4. Verify redirects back to restaurant page
5. Confirm authenticated (see user menu)

✅ **Success:** Full login → redirect → authenticated state works

---

### 5. Ordering Flow Test (Quick)
1. Open `https://tilburychicken.co.uk`
2. Add an item to cart
3. Click "View Cart"
4. Proceed to checkout
5. Verify checkout page loads without CORS errors

❌ **Problem:** CORS error in Console → API origin mismatch

---

## Server-Side CORS Configuration

**CRITICAL:** The Base44 backend MUST allow requests from `tilburychicken.co.uk`

Verify CORS headers on API responses:
```bash
curl -I https://preview-sandbox--694f32ea1bcdfa212c621404.base44.app/api/restaurants
```

Expected response headers:
```
Access-Control-Allow-Origin: https://tilburychicken.co.uk
Access-Control-Allow-Credentials: true
```

**If missing:** Contact Base44 DevOps to add custom domain to CORS allowlist

---

## Rollback Plan

If deployment fails:

### Option 1: Revert to Previous Deploy
```bash
# Redeploy previous build (before platform domain changes)
# All API requests will fail unless previous build had the fix
```

### Option 2: Deploy Test Build to Staging
```bash
# Deploy to subdomain: test.tilburychicken.co.uk
# Test the full flow before production cutover
```

### Option 3: Emergency Fix
If blank page after deployment:
1. Verify `index.html` in `dist/` has `window.__BASE44_PLATFORM_DOMAIN` injection
2. Verify React script tag: `<script type="module" src="/src/main.jsx"></script>`
3. Clear browser cache: Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
4. Redeploy full `dist/` folder

---

## Success Criteria

✅ All tests pass → Deployment successful

| Test | Status | Notes |
|------|--------|-------|
| HTML loads | ✅ | React root div present |
| React script loads | ✅ | No console errors |
| Console logs API origin | ✅ | Matches platform domain |
| API requests to correct origin | ✅ | Requests to Base44 backend |
| Authentication flow | ✅ | Login → redirect → authenticated |
| Ordering flow | ✅ | Add to cart → checkout works |
| No CORS errors | ✅ | Console clean |

---

## Monitoring Post-Deployment

- **Check browser console** for errors hourly (first 24 hours)
- **Monitor API response times** — should be normal latency
- **Check user reports** in admin dashboard for order issues
- **Verify Stripe webhooks** are still firing correctly

---

## Support

If deployment fails:
1. Run verification script: `bash scripts/verify-production-deployment.sh`
2. Check browser console (F12) for error messages
3. Share console errors + Network tab screenshots
4. Confirm Base44 CORS headers allow the custom domain
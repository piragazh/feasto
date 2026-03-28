# PRODUCTION DEPLOYMENT INVESTIGATION: tilburychicken.co.uk

**Date:** 2026-03-28  
**Status:** 🚨 CRITICAL — Blank page, incomplete HTML

---

## FINDINGS

### Issue 1: Missing React Bundle Script

**Production HTML (tilburychicken.co.uk):**
```html
<div id="root"></div>
<!-- MISSING: <script type="module" src="/src/main.jsx"></script> -->
```

**Expected HTML (index.html in repo):**
```html
<div id="root"></div>
<script type="module" src="/src/main.jsx"></script>
```

**Impact:** React bundle never loads → blank page

---

### Issue 2: Missing Platform Domain Injection

**Production HTML:**
```html
<!-- MISSING: window.__BASE44_PLATFORM_DOMAIN injection -->
```

**Expected (should be in <head>):**
```html
<script>
  window.__BASE44_PLATFORM_DOMAIN = 'preview-sandbox--xyz.base44.app';
</script>
```

**Impact:** Custom domain wouldn't work even if React loaded

---

### Issue 3: Partial/Stale Deployment

**Hypothesis:**
- Only HTML was uploaded to CDN/server
- JS bundle files (`main-*.js`) were **not** uploaded
- Or HTML is being cached from old, broken build

**Evidence:**
- HTML is present but incomplete
- No build artifacts are being served
- Page shows blank (no React, no error message)

---

## ROOT CAUSE ANALYSIS

### Most Likely Cause: Deployment Process Error

The deployment likely:
1. ✅ Deployed `index.html` (partial)
2. ❌ Did NOT deploy `dist/assets/main-*.js` (JS bundle)
3. ❌ Did NOT inject `window.__BASE44_PLATFORM_DOMAIN`

**Result:** HTML loads, looks for `main-*.js`, file not found, React never initializes.

---

## IMMEDIATE FIX

### Step 1: Verify Deployment Files

On the deployment server, check:
```bash
# Should exist:
ls -la /var/www/tilburychicken.co.uk/dist/index.html
ls -la /var/www/tilburychicken.co.uk/dist/assets/main-*.js

# Should show files, not errors
```

### Step 2: Rebuild and Deploy

```bash
# Ensure environment variable is set
export VITE_PUBLIC_API_BASE_URL=https://preview-sandbox--694f32ea1bcdfa212c621404.base44.app

# Build fresh
npm run build

# Deploy entire dist/ folder (not just HTML)
# Verify all files are present:
#  - dist/index.html
#  - dist/assets/main-*.js
#  - dist/assets/*.css
#  - etc.
```

### Step 3: Add Platform Domain Injection

If using runtime injection, update `index.html` **before** serving:

```html
<!doctype html>
<html lang="en">
  <head>
    <!-- ...existing head content... -->
    <script>
      // Inject platform domain BEFORE React loads
      window.__BASE44_PLATFORM_DOMAIN = 'preview-sandbox--694f32ea1bcdfa212c621404.base44.app';
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

### Step 4: Verify After Deployment

```bash
# Check that HTML includes script tag
curl https://tilburychicken.co.uk | grep "src=\"/src/main.jsx\"" 
# Should return: <script type="module" src="/src/main.jsx"></script>

# Check that JS loads
curl https://tilburychicken.co.uk/src/main.jsx -I
# Should return: 200 OK (or redirect to actual asset)

# Check in browser
# Open https://tilburychicken.co.uk
# Should show app loading spinner
# Console should show [API-Origin-Debug] logs
```

---

## Configuration Checklist

Before redeploying:

- [ ] **API Origin Set:** `VITE_PUBLIC_API_BASE_URL=https://preview-sandbox--694f32ea1bcdfa212c621404.base44.app`
- [ ] **Build Completed:** `npm run build`
- [ ] **All dist/ files present:** index.html, main-*.js, etc.
- [ ] **Platform domain injected:** `index.html` has `window.__BASE44_PLATFORM_DOMAIN` script
- [ ] **Deploy to CDN/server:** Entire `dist/` folder
- [ ] **Verify** in browser: App loads, no blank page

---

## Deployment Verification Script

```bash
#!/bin/bash

DOMAIN="tilburychicken.co.uk"

echo "=== Production Deployment Verification ==="
echo "Domain: $DOMAIN"
echo

echo "1. Checking HTML loads..."
curl -s https://$DOMAIN | grep -q '<div id="root"></div>' && echo "✅ HTML found" || echo "❌ HTML missing"

echo "2. Checking React script present..."
curl -s https://$DOMAIN | grep -q 'src="/src/main.jsx"' && echo "✅ React script found" || echo "❌ React script missing"

echo "3. Checking platform domain injection..."
curl -s https://$DOMAIN | grep -q 'window.__BASE44_PLATFORM_DOMAIN' && echo "✅ Injection found" || echo "❌ Injection missing"

echo "4. Checking JS asset accessibility..."
curl -s -I https://$DOMAIN/src/main.jsx | grep -q '200\|301\|302' && echo "✅ Asset reachable" || echo "❌ Asset not reachable"

echo "5. Checking for blank page (no content)..."
HTML_SIZE=$(curl -s https://$DOMAIN | wc -c)
if [ $HTML_SIZE -lt 2000 ]; then
  echo "❌ HTML is suspiciously small ($HTML_SIZE bytes)"
else
  echo "✅ HTML size reasonable ($HTML_SIZE bytes)"
fi

echo
echo "=== Summary ==="
echo "If any checks failed, deployment is incomplete."
echo "Ensure entire dist/ folder is deployed, not just HTML."
```

---

## Long-Term Prevention

### 1. Deployment Checklist

Add to deployment process:
- [ ] Clean build: `rm -rf dist && npm run build`
- [ ] Verify build output: `ls -la dist/assets/` shows files
- [ ] Deploy entire `dist/` folder
- [ ] Verify with curl/browser after deploy
- [ ] Check console logs in browser: `[API-Origin]` messages present

### 2. Automated Verification

Add post-deployment test:
```javascript
// After deployment, run this in browser console:
console.log('React loaded:', typeof React !== 'undefined');
console.log('App mounted:', document.getElementById('root').children.length > 0);
console.log('API origin:', window.__BASE44_PLATFORM_DOMAIN);
```

### 3. Cache Busting

If using CDN:
- Set cache headers to 1 hour max for `index.html`
- Set cache to never expire for versioned assets (`main-ABC123.js`)
- Clear CDN cache after deployment

---

## Next Steps

1. **Immediately:** Check deployment server for missing files
2. **Then:** Rebuild with `VITE_PUBLIC_API_BASE_URL` set
3. **Deploy:** Entire `dist/` folder
4. **Inject:** Platform domain in `index.html`
5. **Verify:** Run verification script above
6. **Test:** Open browser, should see app loading

---

**This is a deployment issue, not a code issue. Source code is correct.**

**Fix: Ensure complete `dist/` build is deployed, not just HTML.**
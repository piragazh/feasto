# Custom Domain Boot Fix — Documentation Index

This folder contains complete documentation for the custom domain API origin separation fix.

## Quick Start

**For Deployment Teams:**
→ Start with [`CUSTOM_DOMAIN_DEPLOYMENT_CHECKLIST.md`](CUSTOM_DOMAIN_DEPLOYMENT_CHECKLIST.md)

**For Engineers:**
→ Start with [`CUSTOM_DOMAIN_BOOT_FIX_SUMMARY.md`](CUSTOM_DOMAIN_BOOT_FIX_SUMMARY.md)

**For Architects:**
→ Start with [`API_ORIGIN_AUDIT_REPORT.md`](API_ORIGIN_AUDIT_REPORT.md)

---

## Documentation Files

### 1. **`CUSTOM_DOMAIN_BOOT_FIX_SUMMARY.md`**
**Audience:** Everyone  
**Length:** 3 pages  
**Purpose:** Quick explanation of the problem, solution, and how to deploy

**Read this if you want to:**
- Understand what was broken
- See what changed
- Deploy to a custom domain
- Know the 2 config approaches

---

### 2. **`CUSTOM_DOMAIN_API_ORIGIN_FIX.md`**
**Audience:** DevOps, Platform Engineers  
**Length:** 5 pages  
**Purpose:** Detailed deployment guide with examples

**Read this if you want to:**
- Configure for production
- Set up API origin separation
- Understand the architecture
- Debug if something goes wrong
- Learn about caching & future improvements

---

### 3. **`CUSTOM_DOMAIN_DEPLOYMENT_CHECKLIST.md`**
**Audience:** DevOps Teams  
**Length:** 7 pages  
**Purpose:** Step-by-step checklist for deploying a custom domain

**Read this if you want to:**
- Deploy a customer's custom domain
- Verify everything is correct
- Know what to test
- Have an approval gate
- Know how to rollback

---

### 4. **`API_ORIGIN_AUDIT_REPORT.md`**
**Audience:** Architects, Security, Engineering Leads  
**Length:** 8 pages  
**Purpose:** Complete audit of the problem, findings, solution design

**Read this if you want to:**
- Understand the root cause
- See all files with API-origin assumptions
- Review security implications
- Know what the architecture looks like
- See test results & verification

---

## Code Changes Summary

### New File: `lib/api-origin.js`
```javascript
// Centralized API origin configuration
getApiUrl(path)          // Construct full API URL
getApiBaseUrl()          // Get API origin
getFrontendOrigin()      // Get frontend origin
logApiOriginDebug()      // Debug logging
```

**Replaces:**
- Direct `window.location.origin` assumptions
- Hardcoded platform domain strings
- Any `/api` path assumptions

### Updated: `lib/AuthContext.jsx`
Boot flow now uses `getApiUrl()` instead of assuming `window.location.origin` equals API origin.

### Updated: `App.jsx`
Fatal error UI now visible instead of blank page. Shows error message + retry button.

### Updated: `index.html`
Added injection point for platform domain:
```html
<script>
  window.__BASE44_PLATFORM_DOMAIN = '...';
</script>
```

---

## Configuration Methods

### Method A: Build-Time Env Var (Recommended)
```bash
VITE_PUBLIC_API_BASE_URL=https://platform.base44.app npm run build
```
✅ Immutable  
✅ No runtime config  
❌ Rebuild per domain

### Method B: Runtime Injection (Flexible)
```html
<script>
  window.__BASE44_PLATFORM_DOMAIN = 'platform.base44.app';
</script>
```
✅ One build, many domains  
✅ Flexible  
❌ Runtime config

---

## When Do You Need This?

✅ **Custom domain deployments** — Always configure  
⚠️ **Platform domains** — Auto-detects, no config needed  
⚠️ **Local development** — Auto-detects, no config needed  

---

## Problem Solved

**Before:**
- Custom domain frontend `restaurant.com` tried to call API on `restaurant.com`
- `/api` endpoints don't exist on `restaurant.com` (only on platform domain)
- Result: 404 → blank page

**After:**
- Custom domain frontend `restaurant.com` calls API on `base44-platform.app`
- `/api` endpoints exist on platform domain
- Result: 200 → app boots

---

## Browser Console Verification

**Look for this on boot (custom domain):**

```javascript
[API-Origin-Debug] {
  frontend: "https://restaurant.com",
  api: "https://base44-platform.app",
  sameOrigin: false
}
```

**Good sign:** `sameOrigin: false` for custom domains.

---

## Key Files Changed

| File | Change | Impact |
|------|--------|--------|
| `lib/api-origin.js` | New | API origin config (single source of truth) |
| `lib/AuthContext.jsx` | Updated | Boot uses dedicated API origin |
| `App.jsx` | Updated | Visible error UI (no blank page) |
| `index.html` | Updated | Runtime injection point |

---

## Deployment Approval Gate

Before deploying a custom domain, verify:

- [ ] Platform domain identified
- [ ] CORS headers configured
- [ ] SSL/TLS certificate valid
- [ ] DNS pointing to deployment
- [ ] App boots without errors
- [ ] Console shows correct origins
- [ ] API calls succeed

See checklist for details.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Blank page | Platform domain not configured | Check `window.__BASE44_PLATFORM_DOMAIN` or rebuild |
| 404 on `/api/...` | API origin wrong | Verify `[API-Origin-Debug]` log in console |
| Mixed Content error | HTTPS/HTTP mismatch | Ensure both use `https://` |
| Auth loop | Separate issue | Not caused by this fix |

---

## Further Reading

- `IMPLEMENTATION_COMPLETE.md` — High-level overview (root directory)
- `lib/api-origin.js` — Source code with inline documentation
- `lib/AuthContext.jsx` — Boot flow with comments

---

## Support

For questions or issues:

1. Check browser console for `[API-Origin]` logs
2. Review relevant documentation file above
3. Run deployment checklist to verify setup
4. Check `API_ORIGIN_AUDIT_REPORT.md` for deep dive

---

## Status

✅ **Implementation Complete**  
✅ **Documentation Complete**  
✅ **Ready for Production**  

Custom domains now boot correctly with permanent, production-grade API origin separation.

---

**Last Updated:** 2026-03-28  
**Status:** Ready for deployment
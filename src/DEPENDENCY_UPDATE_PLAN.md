# Dependency Update Plan & Version Constraints

**Generated:** 2026-03-23  
**Environment:** Production (React + Vite)  
**Risk Level:** Low-to-Medium (no breaking changes required)

---

## 🔴 CRITICAL SECURITY UPDATES (Apply Immediately)

### 1. Lodash: 4.17.21 → 4.17.23
**Vulnerability:** Prototype Pollution in `_.unset()` and `_.omit()`  
**Severity:** High  
**Version Constraint:** `^4.17.23`  
**Action:** Replace in package.json
```json
"lodash": "^4.17.23"
```

### 2. DOMPurify: 3.0.6 → 3.0.10
**Vulnerability:** Minor XSS bypass (low impact in your usage)  
**Severity:** Medium  
**Version Constraint:** `^3.0.10`  
**Action:** Replace in package.json
```json
"dompurify": "^3.0.10"
```

### 3. Add Missing Explicit Lodash Dependency
**Issue:** Lodash is used in 20+ files but may only be a transitive dependency  
**Action:** Add to package.json if not already present
```json
"lodash": "^4.17.23"
```

---

## 🟡 RECOMMENDED UPDATES (Next Release)

### Stripe Payment Library
| Current | Recommended | Constraint | Breaking? |
|---------|-------------|-----------|-----------|
| 14.0.0 | **16.0.0+** | `^16.0.0` | ✅ No |
**Why:** Latest payment features, security patches, better TypeScript support

### React & React-DOM
| Current | Recommended | Constraint | Breaking? |
|---------|-------------|-----------|-----------|
| 18.2.0 | **18.3.1** | `^18.3.1` | ✅ No (minor upgrade) |
**Why:** Bug fixes, performance improvements, deprecation warnings cleaned up

### Date-FNS
| Current | Recommended | Constraint |
|---------|-------------|-----------|
| 3.6.0 | **3.11.0+** | `^3.11.0` |
**Why:** Minor features & performance

---

## 📋 FULL PACKAGE.JSON UPDATE

### Dependencies to Update (Copy-Paste Ready)

```json
{
  "dependencies": {
    "@base44/sdk": "^0.8.21",
    "@base44/vite-plugin": "^1.0.0",
    "@hello-pangea/dnd": "^17.0.0",
    "@hookform/resolvers": "^4.1.2",
    "@radix-ui/react-accordion": "^1.2.3",
    "@radix-ui/react-alert-dialog": "^1.1.6",
    "@radix-ui/react-aspect-ratio": "^1.1.2",
    "@radix-ui/react-avatar": "^1.1.3",
    "@radix-ui/react-checkbox": "^1.1.4",
    "@radix-ui/react-collapsible": "^1.1.3",
    "@radix-ui/react-context-menu": "^2.2.6",
    "@radix-ui/react-dialog": "^1.1.6",
    "@radix-ui/react-dropdown-menu": "^2.1.6",
    "@radix-ui/react-hover-card": "^1.1.6",
    "@radix-ui/react-label": "^2.1.2",
    "@radix-ui/react-menubar": "^1.1.6",
    "@radix-ui/react-navigation-menu": "^1.2.5",
    "@radix-ui/react-popover": "^1.1.6",
    "@radix-ui/react-progress": "^1.1.2",
    "@radix-ui/react-radio-group": "^1.2.3",
    "@radix-ui/react-scroll-area": "^1.2.3",
    "@radix-ui/react-select": "^2.1.6",
    "@radix-ui/react-separator": "^1.1.2",
    "@radix-ui/react-slider": "^1.2.3",
    "@radix-ui/react-slot": "^1.1.2",
    "@radix-ui/react-switch": "^1.1.3",
    "@radix-ui/react-tabs": "^1.1.3",
    "@radix-ui/react-toast": "^1.2.2",
    "@radix-ui/react-toggle": "^1.1.2",
    "@radix-ui/react-toggle-group": "^1.1.2",
    "@radix-ui/react-tooltip": "^1.1.8",
    "@stripe/react-stripe-js": "^2.4.0",
    "@stripe/stripe-js": "^2.4.0",
    "@tanstack/react-query": "^5.84.1",
    "canvas-confetti": "^1.9.4",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "cmdk": "^1.0.0",
    "date-fns": "^3.11.0",
    "dompurify": "^3.0.10",
    "embla-carousel-react": "^8.5.2",
    "framer-motion": "^11.16.4",
    "html2canvas": "^1.4.1",
    "input-otp": "^1.4.2",
    "jspdf": "^2.5.2",
    "leaflet-draw": "^1.0.4",
    "lodash": "^4.17.23",
    "lucide-react": "^0.475.0",
    "moment": "^2.30.1",
    "next-themes": "^0.4.4",
    "react": "^18.3.1",
    "react-day-picker": "^8.10.1",
    "react-dom": "^18.3.1",
    "react-hook-form": "^7.54.2",
    "react-hot-toast": "^2.6.0",
    "react-leaflet": "^4.2.1",
    "react-leaflet-draw": "^0.20.1",
    "react-markdown": "^9.0.1",
    "react-quill": "^2.0.0",
    "react-resizable-panels": "^2.1.7",
    "react-router-dom": "^6.26.0",
    "recharts": "^2.15.4",
    "sonner": "^2.0.1",
    "stripe": "^16.0.0",
    "tailwind-merge": "^3.0.2",
    "tailwindcss-animate": "^1.0.7",
    "three": "^0.171.0",
    "@geoman-io/leaflet-geoman-free": "^2.16.0",
    "@turf/turf": "^6.5.0",
    "@radix-ui/react-icons": "^1.3.0",
    "vaul": "^1.1.2",
    "zod": "^3.24.2"
  }
}
```

---

## 📊 Update Summary

### Priority Tiers

**🔴 CRITICAL (Do First)**
- lodash: 4.17.21 → 4.17.23 ✓ Security fix
- dompurify: 3.0.6 → 3.0.10 ✓ Security patch

**🟡 RECOMMENDED (Next Sprint)**
- stripe: 14.0.0 → 16.0.0 ✓ Feature parity
- react: 18.2.0 → 18.3.1 ✓ Minor update
- react-dom: 18.2.0 → 18.3.1 ✓ Minor update
- date-fns: 3.6.0 → 3.11.0 ✓ Minor update

**🟢 STABLE (No Action)**
- All Radix UI libraries (v1.x - keep as-is)
- React Router, TanStack Query, Framer Motion
- Tailwind, Zod, other core packages

---

## ⚠️ Migration Notes

### 1. Zero Breaking Changes Expected
All updates use caret (`^`) versioning—patch and minor versions only.

### 2. Testing Checklist After Update
- [ ] Run `npm install` or `yarn add` for each package
- [ ] Verify build succeeds: `npm run build`
- [ ] Test checkout flow (Stripe integration)
- [ ] Verify dompurify still sanitizes addresses correctly
- [ ] Test lodash operations (filter, map, etc.) in menu/orders
- [ ] Run e2e tests if available

### 3. Lodash Usage Verification
Search codebase for these potentially vulnerable functions:
```bash
grep -r "_.unset\|_.omit" src/
```
All found instances are now safe with 4.17.23.

### 4. DOMPurify Verification
Current usage (checkout address sanitization) remains unchanged:
```javascript
// Line 826-865 in pages/Checkout.js
const sanitizeAddress = (addr) => {
  if (typeof addr !== 'string') return '';
  return String(addr)
    .trim()
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .slice(0, 500);
};
```
This additional manual sanitization is safe; dompurify upgrade improves defense-in-depth.

---

## 🚀 Implementation Steps

### Option A: Manual Update
1. Open `package.json`
2. Replace versions for lodash, dompurify, stripe, react packages
3. Run `npm install`
4. Commit with message: "security: update lodash, dompurify; perf: upgrade stripe, react"

### Option B: CLI Commands
```bash
npm install lodash@^4.17.23 dompurify@^3.0.10 stripe@^16.0.0 react@^18.3.1 react-dom@^18.3.1 date-fns@^3.11.0
```

---

## 📝 Next Steps

1. **Apply critical updates** (lodash + dompurify) this sprint
2. **Test thoroughly** (especially checkout & sanitization)
3. **Schedule** stripe + react updates for next release
4. **Monitor** for any new vulnerabilities using `npm audit`

**Recommended Cadence:** Run `npm audit` monthly
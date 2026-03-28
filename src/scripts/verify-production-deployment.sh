#!/bin/bash

# Production Deployment Verification Script
# Run this after deploying to tilburychicken.co.uk
# Usage: bash scripts/verify-production-deployment.sh

DOMAIN="tilburychicken.co.uk"
API_ORIGIN="preview-sandbox--694f32ea1bcdfa212c621404.base44.app"

echo "╔════════════════════════════════════════════════════════════╗"
echo "║   Production Deployment Verification - $DOMAIN      ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo

# Check 1: HTML loads
echo "1️⃣  Checking HTML serves..."
if curl -s https://$DOMAIN | grep -q '<div id="root"></div>'; then
  echo "   ✅ HTML root element found"
else
  echo "   ❌ HTML root element missing - deployment incomplete"
  exit 1
fi

# Check 2: React script present
echo "2️⃣  Checking React bundle script..."
if curl -s https://$DOMAIN | grep -q 'src="/src/main.jsx"'; then
  echo "   ✅ React script tag present"
else
  echo "   ❌ React script tag missing - HTML incomplete"
  exit 1
fi

# Check 3: Platform domain injected
echo "3️⃣  Checking platform domain injection..."
if curl -s https://$DOMAIN | grep -q "window.__BASE44_PLATFORM_DOMAIN = '$API_ORIGIN'"; then
  echo "   ✅ Platform domain injected correctly: $API_ORIGIN"
else
  echo "   ❌ Platform domain not injected"
  exit 1
fi

# Check 4: JS assets reachable
echo "4️⃣  Checking JavaScript assets..."
ASSET_CHECK=$(curl -s -I https://$DOMAIN/src/main.jsx 2>&1)
if echo "$ASSET_CHECK" | grep -q -E '200|301|302'; then
  echo "   ✅ JS assets reachable"
else
  echo "   ❌ JS assets not accessible - assets not deployed"
  exit 1
fi

# Check 5: HTML size reasonable
echo "5️⃣  Checking HTML completeness..."
HTML_SIZE=$(curl -s https://$DOMAIN | wc -c)
if [ "$HTML_SIZE" -gt 2000 ]; then
  echo "   ✅ HTML size reasonable ($HTML_SIZE bytes)"
else
  echo "   ❌ HTML suspiciously small ($HTML_SIZE bytes) - may be stale cache"
  exit 1
fi

echo
echo "╔════════════════════════════════════════════════════════════╗"
echo "║              ✅ All checks passed!                         ║"
echo "║   Deployment appears complete. App should load now.       ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo
echo "Next: Open browser, check Console for [API-Origin] logs"
echo "Expected: API calls routing to $API_ORIGIN"
echo
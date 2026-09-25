import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
// Self-hosted variable font. Bundled rather than fetched from a CDN so the
// typography survives a till with no internet - a webfont from Google silently
// falls back to the system stack offline, which is exactly when the POS is in use.
import '@fontsource-variable/plus-jakarta-sans'
import '@/index.css'
import { cleanupLegacyServiceWorkers, registerServiceWorker } from '@/lib/pwa-lifecycle'

cleanupLegacyServiceWorkers().finally(() => {
  registerServiceWorker();
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
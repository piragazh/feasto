import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { registerServiceWorker, cleanupLegacyServiceWorkers } from '@/lib/pwa-lifecycle'

// 1. One-time cleanup of any legacy SWs registered under wrong paths.
//    Runs once per session (guarded by sessionStorage) — not on every load.
cleanupLegacyServiceWorkers();

// 2. Register our own service worker with a safe lifecycle.
//    No-ops gracefully if SW is unsupported.
registerServiceWorker();

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
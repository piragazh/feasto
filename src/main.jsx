import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { cleanupLegacyServiceWorkers } from '@/lib/pwa-lifecycle'

// Service worker temporarily disabled for debugging.
// Keep cleanup so any previously registered worker is removed.
cleanupLegacyServiceWorkers();

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
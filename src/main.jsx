import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { registerServiceWorker, cleanupLegacyServiceWorkers } from '@/lib/pwa-lifecycle'

cleanupLegacyServiceWorkers();
registerServiceWorker();

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
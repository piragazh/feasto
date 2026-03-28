import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { registerServiceWorker, cleanupLegacyServiceWorkers } from '@/lib/pwa-lifecycle'

cleanupLegacyServiceWorkers();
registerServiceWorker();

const root = document.getElementById('root');
if (!root) {
  document.body.innerHTML = '<div style="color:red;padding:20px">ERROR: #root element missing from index.html</div>';
} else {
  ReactDOM.createRoot(root).render(React.createElement(App));
}
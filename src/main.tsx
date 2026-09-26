import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n'
import './index.css'
import App from './App'

// Purge old releases' caches containing account/booking data or signed ID URLs.
if ('caches' in window) {
  Promise.all(['supabase-api', 'supabase-images'].map(name => caches.delete(name))).catch(() => {})
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

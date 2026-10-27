import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n'
import './index.css'
import App from './App'

// Purge legacy caches that may contain private account data or signed ID images.
if ('caches' in window) {
  for (const name of ['supabase-api', 'supabase-images']) caches.delete(name).catch(() => {})
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

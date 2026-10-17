import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { applyAccent, loadSavedAccent } from './lib/theme'

// Before the first paint, so the app opens in the user's colour without a flash of orange
applyAccent(loadSavedAccent())

// Lets the installed app open without signal (production only, so dev reloads stay fresh)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

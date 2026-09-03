import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import './notifications.css'
import './safety.css'
import './helpContextBridge'
import './pwa'
import App from './AppRoot'
import MobileActionMenu from './components/MobileActionMenu'
import ConnectivityBanner from './components/ConnectivityBanner'
import LegalCenter from './components/LegalCenter'
import LegalAcceptanceGate from './components/LegalAcceptanceGate'
import './mobile.css'
import './mobile-tablet.css'
import './legal.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <LegalAcceptanceGate />
    <LegalCenter />
    <MobileActionMenu />
    <ConnectivityBanner />
  </StrictMode>,
)

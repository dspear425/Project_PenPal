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
import './mobile.css'
import './mobile-tablet.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <MobileActionMenu />
    <ConnectivityBanner />
  </StrictMode>,
)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import './notifications.css'
import './safety.css'
import './helpContextBridge'
import './lib/legalHelpExtension'
import './lib/chosenFamilyHelpExtension'
import './pwa'
import App from './AppRoot'
import MobileActionMenu from './components/MobileActionMenu'
import ConnectivityBanner from './components/ConnectivityBanner'
import LegalCenter from './components/LegalCenter'
import LegalAcceptanceGate from './components/LegalAcceptanceGate'
import LegalFooter from './components/LegalFooter'
import SettingsLegalShortcut from './components/SettingsLegalShortcut'
import SignupLegalConsent from './components/SignupLegalConsent'
import LaunchOps from './components/LaunchOps'
import FeedbackShortcut from './components/FeedbackShortcut'
import PublicEarlyAccessMessaging from './components/PublicEarlyAccessMessaging'
import AuthBotProtection from './components/AuthBotProtection'
import './mobile.css'
import './mobile-tablet.css'
import './legal.css'
import './legal-footer.css'
import './legal-settings.css'
import './legal-signup.css'
import './beta-feedback.css'
import './chosen-family.css'
import './launch-ops.css'
import './public-early-access.css'
import './turnstile.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <LegalAcceptanceGate />
    <LegalCenter />
    <LegalFooter />
    <SettingsLegalShortcut />
    <SignupLegalConsent />
    <AuthBotProtection />
    <LaunchOps />
    <FeedbackShortcut />
    <PublicEarlyAccessMessaging />
    <MobileActionMenu />
    <ConnectivityBanner />
  </StrictMode>,
)

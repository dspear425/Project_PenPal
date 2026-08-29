import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import './notifications.css'
import './safety.css'
import App from './AppRoot'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { openLegalCenter } from '../lib/legalEvents'

export default function SettingsLegalShortcut() {
  const [target, setTarget] = useState<HTMLElement | null>(null)

  useEffect(() => {
    let scheduled = false
    const refresh = () => {
      scheduled = false
      setTarget(document.querySelector<HTMLElement>('.settings-body'))
    }
    const schedule = () => {
      if (scheduled) return
      scheduled = true
      window.requestAnimationFrame(refresh)
    }

    refresh()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  if (!target) return null

  return createPortal(
    <section className="settings-card settings-legal-card">
      <div>
        <h3>Legal & safety</h3>
        <p>Review the policies that govern Project PenPal and the safety rules for photos, correspondence, and physical mail.</p>
      </div>
      <div className="settings-policy-links">
        <button type="button" onClick={() => openLegalCenter('terms')}>Terms</button>
        <button type="button" onClick={() => openLegalCenter('privacy')}>Privacy</button>
        <button type="button" onClick={() => openLegalCenter('community')}>Community</button>
        <button type="button" onClick={() => openLegalCenter('safety')}>Safety</button>
        <button type="button" onClick={() => openLegalCenter('snail_mail')}>Snail mail</button>
      </div>
    </section>,
    target,
  )
}

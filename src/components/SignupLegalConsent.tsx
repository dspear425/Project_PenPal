import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { openLegalCenter } from '../lib/legalEvents'
import { setSignupLegalConsent } from '../lib/legalSignupState'

export default function SignupLegalConsent() {
  const [target, setTarget] = useState<HTMLFormElement | null>(null)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    let scheduled = false

    const refresh = () => {
      scheduled = false
      const form = document.querySelector<HTMLFormElement>('.auth-form')
      const signupForm = form?.querySelector<HTMLInputElement>('input[autocomplete="new-password"]') ? form : null
      setTarget(signupForm)
      if (!signupForm) {
        setChecked(false)
        setSignupLegalConsent(false)
      }
    }

    const schedule = () => {
      if (scheduled) return
      scheduled = true
      window.requestAnimationFrame(refresh)
    }

    refresh()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['autocomplete'] })

    return () => {
      observer.disconnect()
      setSignupLegalConsent(false)
    }
  }, [])

  function update(value: boolean) {
    setChecked(value)
    setSignupLegalConsent(value)
  }

  if (!target) return null

  return createPortal(
    <div className="legal-signup-consent">
      <input
        id="project-penpal-legal-consent"
        type="checkbox"
        required
        checked={checked}
        onChange={(event) => update(event.target.checked)}
      />
      <div>
        <label htmlFor="project-penpal-legal-consent">I agree to the Project PenPal Terms of Service and Community Guidelines and acknowledge the Privacy Policy.</label>
        <p>
          <button type="button" onClick={() => openLegalCenter('terms')}>Terms</button>
          {' · '}
          <button type="button" onClick={() => openLegalCenter('privacy')}>Privacy</button>
          {' · '}
          <button type="button" onClick={() => openLegalCenter('community')}>Community Guidelines</button>
        </p>
      </div>
    </div>,
    target,
  )
}

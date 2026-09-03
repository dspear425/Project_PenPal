import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { setSignupBetaInviteCode } from '../lib/betaInviteSignupState'

export default function BetaInviteSignup() {
  const [target, setTarget] = useState<HTMLFormElement | null>(null)
  const [code, setCode] = useState('')

  useEffect(() => {
    let scheduled = false

    const refresh = () => {
      scheduled = false
      const form = document.querySelector<HTMLFormElement>('.auth-form')
      const signupForm = form?.querySelector<HTMLInputElement>('input[autocomplete="new-password"]') ? form : null
      setTarget(signupForm)
      if (!signupForm) {
        setCode('')
        setSignupBetaInviteCode('')
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
      setSignupBetaInviteCode('')
    }
  }, [])

  function update(value: string) {
    setCode(value)
    setSignupBetaInviteCode(value)
  }

  if (!target) return null

  return createPortal(
    <label className="beta-invite-signup">
      Invitation code
      <input
        type="text"
        autoComplete="off"
        spellCheck={false}
        value={code}
        maxLength={40}
        onChange={(event) => update(event.target.value)}
        placeholder="PP-XXXX-XXXX-XXXX-XXXX-XXXX"
        required
      />
      <span>Project PenPal is currently in closed beta. A valid invitation is required to create an account.</span>
    </label>,
    target,
  )
}

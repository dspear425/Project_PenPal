import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import TurnstileWidget from './TurnstileWidget'
import { isTurnstileConfigured } from '../lib/turnstile'
import { setAuthCaptchaToken } from '../lib/authBotProtectionState'

export default function AuthBotProtection() {
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [resetKey, setResetKey] = useState(0)

  useEffect(() => {
    if (!isTurnstileConfigured()) return

    let currentHost: HTMLElement | null = null
    let currentForm: HTMLFormElement | null = null

    function refresh() {
      const nextForm = (
        document.querySelector<HTMLFormElement>('.forgot-password-form')
        ?? document.querySelector<HTMLFormElement>('.auth-form:not(.forgot-password-form)')
      )

      if (nextForm === currentForm && currentHost?.isConnected) return

      setAuthCaptchaToken(null)
      if (currentHost?.isConnected) currentHost.remove()
      currentHost = null
      currentForm = nextForm

      if (!nextForm) {
        setHost(null)
        return
      }

      const nextHost = document.createElement('div')
      nextHost.className = 'turnstile-portal-host'
      const submitButton = nextForm.querySelector('.primary')
      if (submitButton) nextForm.insertBefore(nextHost, submitButton)
      else nextForm.appendChild(nextHost)
      currentHost = nextHost
      setHost(nextHost)
      setResetKey((value) => value + 1)
    }

    const onReset = () => {
      setAuthCaptchaToken(null)
      setResetKey((value) => value + 1)
    }

    refresh()
    const observer = new MutationObserver(refresh)
    observer.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('project-penpal:captcha-reset', onReset)

    return () => {
      observer.disconnect()
      window.removeEventListener('project-penpal:captcha-reset', onReset)
      setAuthCaptchaToken(null)
      if (currentHost?.isConnected) currentHost.remove()
    }
  }, [])

  if (!host || !isTurnstileConfigured()) return null

  return createPortal(
    <TurnstileWidget key={resetKey} onTokenChange={setAuthCaptchaToken} />,
    host,
  )
}

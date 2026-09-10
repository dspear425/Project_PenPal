import { useEffect, useRef, useState } from 'react'
import { turnstileSiteKey } from '../lib/turnstile'

type TurnstileApi = {
  render: (container: HTMLElement, options: {
    sitekey: string
    theme?: 'light' | 'dark' | 'auto'
    callback?: (token: string) => void
    'expired-callback'?: () => void
    'error-callback'?: () => void
  }) => string
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let scriptPromise: Promise<void> | null = null

function loadTurnstileScript() {
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-project-penpal-turnstile]')
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Human verification could not load.')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.defer = true
    script.dataset.projectPenpalTurnstile = 'true'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Human verification could not load.'))
    document.head.appendChild(script)
  })

  return scriptPromise
}

type Props = {
  onTokenChange: (token: string | null) => void
}

export default function TurnstileWidget({ onTokenChange }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const widgetIdRef = useRef<string | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    onTokenChange(null)

    if (!turnstileSiteKey) {
      setMessage('Human verification is not configured yet.')
      return () => { active = false }
    }

    void loadTurnstileScript()
      .then(() => {
        if (!active || !containerRef.current || !window.turnstile) return
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: turnstileSiteKey,
          theme: 'auto',
          callback: (token) => {
            if (!active) return
            setMessage('')
            onTokenChange(token)
          },
          'expired-callback': () => {
            if (!active) return
            onTokenChange(null)
            setMessage('Verification expired. Please complete it again.')
          },
          'error-callback': () => {
            if (!active) return
            onTokenChange(null)
            setMessage('Human verification could not complete. Please try again.')
          },
        })
      })
      .catch(() => {
        if (!active) return
        onTokenChange(null)
        setMessage('Human verification could not load. Check your connection and try again.')
      })

    return () => {
      active = false
      onTokenChange(null)
      if (widgetIdRef.current && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current) } catch { /* already removed */ }
      }
      widgetIdRef.current = null
    }
  }, [onTokenChange])

  return (
    <div className="turnstile-field">
      <div ref={containerRef} className="turnstile-widget" aria-label="Human verification" />
      {message && <small className="turnstile-message">{message}</small>}
      <small className="turnstile-privacy">Protected by Cloudflare Turnstile.</small>
    </div>
  )
}

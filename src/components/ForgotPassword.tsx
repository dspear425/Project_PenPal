import { useState } from 'react'
import { supabase } from '../lib/supabase'

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const value = (error as { message?: unknown }).message
    if (typeof value === 'string') return value
  }
  return String(error || 'Unknown error')
}

export default function ForgotPassword() {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setWorking(true)
    setMessage('')
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin })
      if (error) throw error
      setMessage('If that address belongs to a Project PenPal account, a password reset email has been sent.')
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setWorking(false)
    }
  }

  return (
    <>
      <button className="forgot-password-launcher" type="button" onClick={() => { setOpen(true); setMessage('') }}>Forgot password?</button>
      {open && (
        <div className="settings-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !working) setOpen(false) }}>
          <section className="forgot-password-panel" role="dialog" aria-modal="true" aria-labelledby="forgot-title">
            <header className="settings-header">
              <div><p className="eyebrow">Account recovery</p><h2 id="forgot-title">Reset your password.</h2><p>Enter the email address you used for Project PenPal and we’ll send a recovery link.</p></div>
              <button className="settings-close" type="button" onClick={() => setOpen(false)} disabled={working}>×</button>
            </header>
            {message && <p className="status-message settings-status">{message}</p>}
            <form className="auth-form forgot-password-form" onSubmit={submit}>
              <label>Email address<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
              <button className="primary" disabled={working}>{working ? 'Sending…' : 'Send reset email'}</button>
            </form>
          </section>
        </div>
      )}
    </>
  )
}

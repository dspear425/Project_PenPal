import { useState } from 'react'
import { supabase } from '../lib/supabase'

type Props = {
  onComplete: () => void
  onSignOut: () => void
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const value = (error as { message?: unknown }).message
    if (typeof value === 'string') return value
  }
  return String(error || 'Unknown error')
}

export default function PasswordRecovery({ onComplete, onSignOut }: Props) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (password.length < 8) {
      setMessage('Your new password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setMessage('The two password entries do not match.')
      return
    }

    setWorking(true)
    setMessage('')
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setMessage('Password updated. You can continue to Project PenPal.')
      window.setTimeout(onComplete, 500)
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setWorking(false)
    }
  }

  return (
    <main className="page-shell">
      <section className="hero-card dashboard-card recovery-card">
        <div className="dashboard-topline">
          <div className="brand-row compact-brand"><div className="stamp" aria-hidden="true">✉</div><span className="brand-name">Project PenPal</span></div>
          <button className="secondary" type="button" onClick={onSignOut}>Cancel</button>
        </div>
        <p className="eyebrow">Account security</p>
        <h1 className="dashboard-title">Choose a new password.</h1>
        <p className="hero-copy">Enter a new password for your Project PenPal account.</p>
        {message && <p className="status-message">{message}</p>}
        <form className="auth-form recovery-form" onSubmit={submit}>
          <label>New password<input type="password" minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          <label>Confirm new password<input type="password" minLength={8} autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required /></label>
          <button className="primary" disabled={working}>{working ? 'Updating…' : 'Update password'}</button>
        </form>
      </section>
    </main>
  )
}

import { useState } from 'react'
import { supabase } from './lib/supabase'

export default function App() {
  const [mode, setMode] = useState<'welcome' | 'signup' | 'signin'>('welcome')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function submitAuth(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage('')

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setMessage('Account created. Check your email to verify your address, then sign in.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        setMessage('Signed in successfully. Profile onboarding is our next milestone.')
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page-shell">
      <section className="hero-card">
        <div className="brand-row">
          <div className="stamp" aria-hidden="true">✉</div>
          <span className="brand-name">Project PenPal</span>
        </div>

        {mode === 'welcome' ? (
          <>
            <p className="eyebrow">Friendship-first correspondence</p>
            <h1>Friendships worth writing for.</h1>
            <p className="hero-copy">
              Meet people around the world who want genuine platonic friendship,
              meaningful conversation, and letters that are worth opening.
            </p>

            <div className="actions">
              <button className="primary" onClick={() => setMode('signup')}>
                Create account
              </button>
              <button className="secondary" onClick={() => setMode('signin')}>
                Sign in
              </button>
            </div>

            <div className="feature-grid">
              <article>
                <strong>Better matches</strong>
                <span>Interests, friendship goals, and communication style.</span>
              </article>
              <article>
                <strong>Letters, not feeds</strong>
                <span>A calmer space built around real one-to-one correspondence.</span>
              </article>
              <article>
                <strong>Platonic by design</strong>
                <span>No follower counts, popularity contests, or dating-first mechanics.</span>
              </article>
            </div>
          </>
        ) : (
          <>
            <button className="back" onClick={() => { setMode('welcome'); setMessage('') }}>
              ← Back
            </button>
            <p className="eyebrow">{mode === 'signup' ? 'Join the beta' : 'Welcome back'}</p>
            <h1>{mode === 'signup' ? 'Create your account.' : 'Sign in.'}</h1>
            <p className="hero-copy compact">
              {mode === 'signup'
                ? 'We’ll start with email verification. Your pen-pal profile comes next.'
                : 'Sign in to continue your correspondence.'}
            </p>

            <form className="auth-form" onSubmit={submitAuth}>
              <label>
                Email
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>
              <button className="primary" type="submit" disabled={busy}>
                {busy ? 'Working…' : mode === 'signup' ? 'Create account' : 'Sign in'}
              </button>
            </form>

            {message && <p className="status-message">{message}</p>}

            <button
              className="text-button"
              onClick={() => {
                setMode(mode === 'signup' ? 'signin' : 'signup')
                setMessage('')
              }}
            >
              {mode === 'signup' ? 'Already have an account? Sign in' : 'Need an account? Create one'}
            </button>
          </>
        )}
      </section>
    </main>
  )
}

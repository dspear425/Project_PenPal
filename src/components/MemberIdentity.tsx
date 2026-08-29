import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Identity = {
  username: string | null
  username_customized: boolean
  nearest_city: string | null
  member_code: string | null
  private_last_name: string | null
}

type Props = {
  userId: string
  requireSetup?: boolean
  showLauncher?: boolean
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const value = (error as { message?: unknown }).message
    if (typeof value === 'string') return value
  }
  return String(error || 'Unknown error')
}

export default function MemberIdentity({ userId, requireSetup = true, showLauncher = true }: Props) {
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [open, setOpen] = useState(false)
  const [username, setUsername] = useState('')
  const [lastName, setLastName] = useState('')
  const [nearestCity, setNearestCity] = useState('')
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    void loadIdentity()
  }, [userId])

  async function loadIdentity() {
    try {
      const { data, error } = await supabase.rpc('get_my_identity')
      if (error) throw error
      const next = (data ?? null) as Identity | null
      setIdentity(next)
      setUsername(next?.username_customized ? (next.username ?? '') : '')
      setLastName(next?.private_last_name ?? '')
      setNearestCity(next?.nearest_city ?? '')
      if (requireSetup && next && !next.username_customized) setOpen(true)
    } catch (error) {
      console.warn('Could not load member identity', error)
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    const cleanUsername = username.trim().toLowerCase()

    if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(cleanUsername)) {
      setMessage('Username must be 3–30 characters and use lowercase letters, numbers, periods, underscores, or hyphens.')
      return
    }

    setWorking(true)
    setMessage('')
    try {
      const { data, error } = await supabase.rpc('save_my_identity', {
        requested_username: cleanUsername,
        requested_last_name: lastName.trim() || null,
        requested_nearest_city: nearestCity.trim() || null,
      })
      if (error) throw error
      const next = data as Identity
      setIdentity(next)
      setUsername(next.username ?? cleanUsername)
      setLastName(next.private_last_name ?? '')
      setNearestCity(next.nearest_city ?? '')
      setMessage('Account information saved.')
      window.setTimeout(() => setOpen(false), 450)
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setWorking(false)
    }
  }

  async function copyMemberCode() {
    if (!identity?.member_code) return
    try {
      await navigator.clipboard.writeText(identity.member_code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setMessage(`Member code: ${identity.member_code}`)
    }
  }

  const mandatory = requireSetup && identity !== null && !identity.username_customized

  return (
    <>
      {showLauncher && identity?.username_customized && (
        <button className="identity-launcher" type="button" onClick={() => { setOpen(true); setMessage('') }} title="Account identity and member code">
          <span aria-hidden="true">@</span><span className="identity-launcher-text">Account</span>
        </button>
      )}

      {open && identity && (
        <div className="identity-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !mandatory && !working) setOpen(false) }}>
          <section className="identity-panel" role="dialog" aria-modal="true" aria-labelledby="identity-title">
            <header className="identity-header">
              <div>
                <p className="eyebrow">Account identity</p>
                <h2 id="identity-title">{mandatory ? 'Choose how we can identify your account.' : 'Your account information.'}</h2>
                <p>These details help distinguish members with similar display names while keeping unnecessary personal information private.</p>
              </div>
              {!mandatory && <button className="identity-close" type="button" onClick={() => setOpen(false)} disabled={working}>×</button>}
            </header>

            {mandatory && (
              <div className="identity-required-note">
                <strong>One-time setup</strong>
                <span>Choose a unique username before continuing. Your display name can still be anything you like.</span>
              </div>
            )}

            <div className="member-code-card">
              <div>
                <span>Your Project PenPal member code</span>
                <strong>{identity.member_code || 'Creating…'}</strong>
                <small>Give this code to Project PenPal support if we need help locating your account.</small>
              </div>
              <button className="secondary" type="button" onClick={() => void copyMemberCode()}>{copied ? 'Copied!' : 'Copy code'}</button>
            </div>

            {message && <p className="status-message identity-status">{message}</p>}

            <form className="identity-form" onSubmit={save}>
              <label>
                Unique username <span className="identity-required">required</span>
                <div className="username-input-wrap"><span>@</span><input value={username} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/\s+/g, ''))} minLength={3} maxLength={30} required placeholder="davidwrites" autoComplete="off" /></div>
                <small>3–30 characters. Lowercase letters, numbers, periods, underscores, and hyphens. This may be visible to other members.</small>
              </label>

              <label>
                Last name <span className="optional">optional · private</span>
                <input value={lastName} onChange={(event) => setLastName(event.target.value)} maxLength={80} placeholder="Only you and authorized moderators can see this" autoComplete="family-name" />
                <small>Your surname is never shown to pen pals. It can help support locate your account when names are ambiguous.</small>
              </label>

              <label>
                Nearest city / metro <span className="optional">optional</span>
                <input value={nearestCity} onChange={(event) => setNearestCity(event.target.value)} maxLength={80} placeholder="Birmingham" />
                <small>Use only a nearby city or metro area—never a street address. This is broad location information that may later support matching.</small>
              </label>

              <div className="identity-actions">
                <button className="primary" disabled={working}>{working ? 'Saving…' : mandatory ? 'Save & continue' : 'Save account info'}</button>
                {!mandatory && <button className="secondary" type="button" onClick={() => setOpen(false)} disabled={working}>Cancel</button>}
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  )
}

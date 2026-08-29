import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Props = {
  userId: string
  isModerator: boolean
}

type Identity = {
  username: string | null
  username_customized: boolean
  nearest_city: string | null
  member_code: string | null
  private_last_name: string | null
}

type ProfileSettings = {
  discoverable: boolean
  accepting_new_penpals: boolean
  max_penpals: number
  country: string | null
  region: string | null
}

type Preferences = {
  email_penpal_requests: boolean
  email_request_accepted: boolean
  email_new_letters: boolean
  email_support_replies: boolean
  product_updates: boolean
}

type BlockedMember = {
  blocked_id: string
  display_name: string | null
  country: string | null
  blocked_at: string
}

type Tab = 'privacy' | 'security' | 'notifications' | 'data'

const defaultPreferences: Preferences = {
  email_penpal_requests: true,
  email_request_accepted: true,
  email_new_letters: true,
  email_support_replies: true,
  product_updates: false,
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const value = (error as { message?: unknown }).message
    if (typeof value === 'string') return value
  }
  return String(error || 'Unknown error')
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

export default function SettingsPrivacy({ userId, isModerator }: Props) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('privacy')
  const [loading, setLoading] = useState(false)
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')

  const [identity, setIdentity] = useState<Identity | null>(null)
  const [username, setUsername] = useState('')
  const [lastName, setLastName] = useState('')
  const [nearestCity, setNearestCity] = useState('')
  const [profile, setProfile] = useState<ProfileSettings>({ discoverable: true, accepting_new_penpals: true, max_penpals: 3, country: null, region: null })
  const [blocks, setBlocks] = useState<BlockedMember[]>([])

  const [email, setEmail] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences)
  const [deleteText, setDeleteText] = useState('')

  useEffect(() => {
    if (open) void loadSettings()
  }, [open, userId])

  async function loadSettings() {
    setLoading(true)
    setMessage('')
    try {
      const [identityResult, profileResult, prefsResult, blockResult, userResult] = await Promise.all([
        supabase.rpc('get_my_identity'),
        supabase.from('profiles').select('discoverable, accepting_new_penpals, max_penpals, country, region').eq('id', userId).single(),
        supabase.from('notification_preferences').select('email_penpal_requests, email_request_accepted, email_new_letters, email_support_replies, product_updates').eq('user_id', userId).maybeSingle(),
        supabase.rpc('list_my_blocks'),
        supabase.auth.getUser(),
      ])

      if (identityResult.error) throw identityResult.error
      if (profileResult.error) throw profileResult.error
      if (blockResult.error) throw blockResult.error
      if (userResult.error) throw userResult.error

      const nextIdentity = identityResult.data as Identity
      setIdentity(nextIdentity)
      setUsername(nextIdentity.username ?? '')
      setLastName(nextIdentity.private_last_name ?? '')
      setNearestCity(nextIdentity.nearest_city ?? '')
      setProfile(profileResult.data as ProfileSettings)
      setBlocks((blockResult.data ?? []) as BlockedMember[])
      setEmail(userResult.data.user?.email ?? '')
      setNewEmail(userResult.data.user?.email ?? '')

      if (prefsResult.error) throw prefsResult.error
      if (prefsResult.data) {
        setPreferences(prefsResult.data as Preferences)
      } else {
        const { data, error } = await supabase
          .from('notification_preferences')
          .insert({ user_id: userId })
          .select('email_penpal_requests, email_request_accepted, email_new_letters, email_support_replies, product_updates')
          .single()
        if (error) throw error
        setPreferences(data as Preferences)
      }
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  async function savePrivacy(event: React.FormEvent) {
    event.preventDefault()
    const cleanUsername = username.trim().toLowerCase()
    if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(cleanUsername)) {
      setMessage('Username must be 3–30 characters and use lowercase letters, numbers, periods, underscores, or hyphens.')
      return
    }

    setWorking(true)
    setMessage('')
    try {
      const [identityResult, profileResult] = await Promise.all([
        supabase.rpc('save_my_identity', {
          requested_username: cleanUsername,
          requested_last_name: lastName.trim() || null,
          requested_nearest_city: nearestCity.trim() || null,
        }),
        supabase.from('profiles').update({
          discoverable: profile.discoverable,
          accepting_new_penpals: profile.accepting_new_penpals,
          max_penpals: profile.max_penpals,
        }).eq('id', userId),
      ])
      if (identityResult.error) throw identityResult.error
      if (profileResult.error) throw profileResult.error
      setIdentity(identityResult.data as Identity)
      setMessage('Privacy and account visibility settings saved.')
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setWorking(false)
    }
  }

  async function unblock(member: BlockedMember) {
    const name = member.display_name || 'this member'
    if (!window.confirm(`Unblock ${name}? They will not be notified, and unblocking does not automatically reconnect you.`)) return
    setWorking(true)
    setMessage('')
    try {
      const { error } = await supabase.rpc('unblock_member', { target_user: member.blocked_id })
      if (error) throw error
      setBlocks((previous) => previous.filter((item) => item.blocked_id !== member.blocked_id))
      setMessage(`${name} has been unblocked.`)
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setWorking(false)
    }
  }

  async function changeEmail(event: React.FormEvent) {
    event.preventDefault()
    const next = newEmail.trim().toLowerCase()
    if (!next || next === email.toLowerCase()) {
      setMessage('Enter a different email address first.')
      return
    }
    setWorking(true)
    setMessage('')
    try {
      const { error } = await supabase.auth.updateUser({ email: next })
      if (error) throw error
      setMessage('Email change requested. Check your email for the verification message; the account address changes after verification.')
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setWorking(false)
    }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault()
    if (newPassword.length < 8) {
      setMessage('Your new password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setMessage('The two password entries do not match.')
      return
    }
    setWorking(true)
    setMessage('')
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setNewPassword('')
      setConfirmPassword('')
      setMessage('Password changed successfully.')
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setWorking(false)
    }
  }

  async function sendPasswordReset() {
    if (!email) return
    setWorking(true)
    setMessage('')
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
      if (error) throw error
      setMessage('Password reset email sent. Use the link in that email to choose a new password.')
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setWorking(false)
    }
  }

  async function saveNotifications() {
    setWorking(true)
    setMessage('')
    try {
      const { error } = await supabase.from('notification_preferences').upsert({
        user_id: userId,
        ...preferences,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
      if (error) throw error
      setMessage('Notification preferences saved.')
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setWorking(false)
    }
  }

  async function exportData() {
    setWorking(true)
    setMessage('')
    try {
      const { data, error } = await supabase.rpc('export_my_data')
      if (error) throw error
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `project-penpal-data-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      setMessage('Your Project PenPal data export has been created.')
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setWorking(false)
    }
  }

  async function deleteAccount() {
    if (deleteText !== 'DELETE MY ACCOUNT') {
      setMessage('Type DELETE MY ACCOUNT exactly before deleting your account.')
      return
    }
    if (!window.confirm('Permanently delete this Project PenPal account and its associated member data? This cannot be undone.')) return

    setWorking(true)
    setMessage('')
    try {
      const { error } = await supabase.rpc('delete_my_account', { confirmation: deleteText })
      if (error) throw error
      await supabase.auth.signOut()
      setOpen(false)
    } catch (error) {
      setMessage(errorMessage(error))
      setWorking(false)
    }
  }

  async function copyMemberCode() {
    if (!identity?.member_code) return
    try {
      await navigator.clipboard.writeText(identity.member_code)
      setMessage('Member code copied.')
    } catch {
      setMessage(`Member code: ${identity.member_code}`)
    }
  }

  return (
    <>
      <button className="settings-launcher" type="button" onClick={() => { setOpen(true); setTab('privacy'); setMessage('') }}>
        <span aria-hidden="true">⚙</span><span>Settings</span>
      </button>

      {open && (
        <div className="settings-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !working) setOpen(false) }}>
          <section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <header className="settings-header">
              <div><p className="eyebrow">Account settings</p><h2 id="settings-title">Settings & privacy.</h2><p>Control how your account appears, how we contact you, and what happens to your data.</p></div>
              <button className="settings-close" type="button" onClick={() => setOpen(false)} disabled={working}>×</button>
            </header>

            <div className="settings-tabs" role="tablist">
              {(['privacy', 'security', 'notifications', 'data'] as const).map((value) => (
                <button key={value} className={tab === value ? 'selected' : ''} onClick={() => { setTab(value); setMessage('') }}>
                  {value === 'privacy' ? 'Privacy & profile' : value === 'security' ? 'Security' : value === 'notifications' ? 'Notifications' : 'Your data'}
                </button>
              ))}
            </div>

            {message && <p className="status-message settings-status">{message}</p>}
            {loading ? <p className="connection-empty">Loading settings…</p> : (
              <div className="settings-body">
                {tab === 'privacy' && (
                  <form className="settings-section-stack" onSubmit={savePrivacy}>
                    <section className="settings-card">
                      <div className="settings-card-heading"><div><h3>Account identity</h3><p>Your display name stays friendly; these details help distinguish accounts safely.</p></div></div>
                      <div className="settings-code-card"><div><span>Member code</span><strong>{identity?.member_code || '—'}</strong><small>Share this with Project PenPal support when they need to locate your account.</small></div><button className="secondary" type="button" onClick={() => void copyMemberCode()}>Copy code</button></div>
                      <div className="settings-grid">
                        <label>Unique username<div className="settings-username"><span>@</span><input value={username} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/\s+/g, ''))} minLength={3} maxLength={30} required /></div><small>Visible to other members and unique across Project PenPal.</small></label>
                        <label>Last name <span className="optional">optional · private</span><input value={lastName} onChange={(event) => setLastName(event.target.value)} maxLength={80} /><small>Only you and authorized moderators can see this.</small></label>
                        <label>Nearest city / metro <span className="optional">optional</span><input value={nearestCity} onChange={(event) => setNearestCity(event.target.value)} maxLength={80} placeholder="Birmingham" /><small>Use a broad nearby city, never a street address.</small></label>
                        <label>Country<input value={profile.country ?? ''} readOnly /><small>Change this from Edit profile.</small></label>
                        <label>State / region<input value={profile.region ?? ''} readOnly /><small>Change this from Edit profile.</small></label>
                      </div>
                    </section>

                    <section className="settings-card">
                      <h3>Discovery & availability</h3>
                      <label className="settings-toggle"><input type="checkbox" checked={profile.discoverable} onChange={(event) => setProfile({ ...profile, discoverable: event.target.checked })} /><span><strong>Show me in Discover</strong><small>Turn this off to hide your profile from new matches without deleting your account.</small></span></label>
                      <label className="settings-toggle"><input type="checkbox" checked={profile.accepting_new_penpals} onChange={(event) => setProfile({ ...profile, accepting_new_penpals: event.target.checked })} /><span><strong>Accept new pen-pal requests</strong><small>Existing pen pals can still write to you when this is off.</small></span></label>
                      <label className="settings-select-row">Pen-pal capacity<select value={profile.max_penpals} onChange={(event) => setProfile({ ...profile, max_penpals: Number(event.target.value) })}>{[1,2,3,4,5,6,7,8,9,10].map((number) => <option key={number} value={number}>{number}</option>)}</select></label>
                    </section>

                    <section className="settings-card">
                      <h3>Blocked members</h3>
                      <p>Blocked members cannot contact you or appear in your normal discovery results.</p>
                      {blocks.length === 0 ? <p className="settings-muted">You are not currently blocking anyone.</p> : <div className="settings-block-list">{blocks.map((member) => <article key={member.blocked_id}><div><strong>{member.display_name || 'Member'}{member.country ? ` · ${member.country}` : ''}</strong><small>Blocked {formatDate(member.blocked_at)}</small></div><button className="secondary" type="button" disabled={working} onClick={() => void unblock(member)}>Unblock</button></article>)}</div>}
                    </section>

                    <div className="settings-save-row"><button className="primary" disabled={working}>{working ? 'Saving…' : 'Save privacy settings'}</button></div>
                  </form>
                )}

                {tab === 'security' && (
                  <div className="settings-section-stack">
                    <section className="settings-card">
                      <h3>Email address</h3>
                      <p>Current email: <strong>{email || 'Unknown'}</strong></p>
                      <form className="settings-inline-form" onSubmit={changeEmail}><label>New email address<input type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} required /></label><button className="primary" disabled={working}>Change email</button></form>
                      <small>A verification message may be required before the new address becomes active.</small>
                    </section>

                    <section className="settings-card">
                      <h3>Password</h3>
                      <form className="settings-grid" onSubmit={changePassword}><label>New password<input type="password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" /></label><label>Confirm new password<input type="password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" /></label><div className="settings-full-row"><button className="primary" disabled={working || !newPassword}>Update password</button></div></form>
                      <div className="settings-subaction"><span>Prefer to reset by email instead?</span><button className="secondary" type="button" disabled={working} onClick={() => void sendPasswordReset()}>Send reset email</button></div>
                    </section>

                    <section className="settings-card settings-info-card">
                      <h3>Account security</h3>
                      <p>Your private surname, member code, and email are not exposed to normal pen-pal profiles. Moderation status cannot be changed by the member account itself.</p>
                    </section>
                  </div>
                )}

                {tab === 'notifications' && (
                  <div className="settings-section-stack">
                    <section className="settings-card">
                      <h3>Email notification preferences</h3>
                      <p>Choose which correspondence events should be eligible for email delivery. These preferences are ready for the outbound-email system we’ll connect during deployment.</p>
                      <label className="settings-toggle"><input type="checkbox" checked={preferences.email_penpal_requests} onChange={(event) => setPreferences({ ...preferences, email_penpal_requests: event.target.checked })} /><span><strong>New pen-pal requests</strong><small>Email me when someone asks to connect.</small></span></label>
                      <label className="settings-toggle"><input type="checkbox" checked={preferences.email_request_accepted} onChange={(event) => setPreferences({ ...preferences, email_request_accepted: event.target.checked })} /><span><strong>Request accepted</strong><small>Email me when a member accepts my request.</small></span></label>
                      <label className="settings-toggle"><input type="checkbox" checked={preferences.email_new_letters} onChange={(event) => setPreferences({ ...preferences, email_new_letters: event.target.checked })} /><span><strong>New letters</strong><small>Email me when a pen pal sends a new letter.</small></span></label>
                      <label className="settings-toggle"><input type="checkbox" checked={preferences.email_support_replies} onChange={(event) => setPreferences({ ...preferences, email_support_replies: event.target.checked })} /><span><strong>Support replies</strong><small>Email me when Project PenPal moderation replies to Help.</small></span></label>
                      <label className="settings-toggle"><input type="checkbox" checked={preferences.product_updates} onChange={(event) => setPreferences({ ...preferences, product_updates: event.target.checked })} /><span><strong>Product updates</strong><small>Occasional non-essential Project PenPal announcements.</small></span></label>
                      <div className="settings-essential-note"><strong>Account & moderation notices</strong><span>Essential account actions remain available in-app and are not disabled by marketing notification preferences.</span></div>
                      <button className="primary" type="button" disabled={working} onClick={() => void saveNotifications()}>{working ? 'Saving…' : 'Save notification preferences'}</button>
                    </section>
                  </div>
                )}

                {tab === 'data' && (
                  <div className="settings-section-stack">
                    <section className="settings-card">
                      <h3>Download your data</h3>
                      <p>Create a JSON copy of your Project PenPal account information, profile, letters, relationships, support conversations, reports you submitted, blocks you created, and account notices.</p>
                      <p className="settings-muted">The export intentionally does not reveal who may have blocked or reported you.</p>
                      <button className="primary" type="button" disabled={working} onClick={() => void exportData()}>{working ? 'Preparing…' : 'Download my data'}</button>
                    </section>

                    <section className="settings-card settings-danger-card">
                      <h3>Delete account</h3>
                      {isModerator ? (
                        <div className="settings-protected-note"><strong>Protected moderation account</strong><span>Moderator and administrator accounts cannot delete themselves. Transfer or remove the moderation role first so Project PenPal cannot lose its administration path or audit integrity.</span></div>
                      ) : (
                        <>
                          <p>Permanently deletes your login and associated member data. This cannot be undone.</p>
                          <label>Type <strong>DELETE MY ACCOUNT</strong> to confirm<input value={deleteText} onChange={(event) => setDeleteText(event.target.value)} autoComplete="off" /></label>
                          <button className="danger-button" type="button" disabled={working || deleteText !== 'DELETE MY ACCOUNT'} onClick={() => void deleteAccount()}>{working ? 'Deleting…' : 'Permanently delete account'}</button>
                        </>
                      )}
                    </section>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  )
}

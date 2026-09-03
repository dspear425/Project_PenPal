import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type StaffRole = 'moderator' | 'admin' | 'owner'

type InviteRow = {
  id: string
  label: string | null
  max_uses: number
  use_count: number
  expires_at: string | null
  disabled_at: string | null
  created_at: string
  created_by: string | null
  created_by_name: string | null
}

type CreatedInvite = {
  invite_id: string
  invite_code: string
  label: string | null
  max_uses: number
  expires_at: string | null
}

type Props = {
  role: StaffRole
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const value = (error as { message?: unknown }).message
    if (typeof value === 'string') return value
  }
  return String(error || 'Unknown error')
}

function formatDate(value: string | null) {
  if (!value) return 'No expiration'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value))
}

function inviteStatus(invite: InviteRow) {
  if (invite.disabled_at) return 'disabled'
  if (invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now()) return 'expired'
  if (invite.use_count >= invite.max_uses) return 'used'
  return 'active'
}

export default function AdminInvitations({ role }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')
  const [invites, setInvites] = useState<InviteRow[]>([])
  const [label, setLabel] = useState('')
  const [uses, setUses] = useState(1)
  const [expiresDays, setExpiresDays] = useState<number | ''>(14)
  const [createdInvite, setCreatedInvite] = useState<CreatedInvite | null>(null)
  const [copied, setCopied] = useState(false)

  const canManage = role === 'admin' || role === 'owner'
  const activeCount = useMemo(() => invites.filter((invite) => inviteStatus(invite) === 'active').length, [invites])

  useEffect(() => {
    if (open && canManage) void loadInvites()
  }, [open, canManage])

  async function loadInvites() {
    setLoading(true)
    setMessage('')
    try {
      const { data, error } = await supabase.rpc('list_beta_invites')
      if (error) throw error
      setInvites((data ?? []) as InviteRow[])
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  async function createInvite(event: React.FormEvent) {
    event.preventDefault()
    if (!canManage) return

    setWorking(true)
    setMessage('')
    setCreatedInvite(null)
    setCopied(false)
    try {
      const { data, error } = await supabase.rpc('create_beta_invite', {
        invite_label: label.trim() || null,
        allowed_uses: uses,
        expires_days: expiresDays === '' ? null : expiresDays,
      })
      if (error) throw error
      const row = (Array.isArray(data) ? data[0] : data) as CreatedInvite | null
      if (!row?.invite_code) throw new Error('The invitation was created but its one-time code was not returned.')
      setCreatedInvite(row)
      setLabel('')
      setUses(1)
      setExpiresDays(14)
      await loadInvites()
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setWorking(false)
    }
  }

  async function copyCode() {
    if (!createdInvite?.invite_code) return
    try {
      await navigator.clipboard.writeText(createdInvite.invite_code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setMessage('Copy was blocked by the browser. Select the invitation code and copy it manually.')
    }
  }

  async function disableInvite(invite: InviteRow) {
    if (!canManage || inviteStatus(invite) !== 'active') return
    const name = invite.label || 'this invitation'
    if (!window.confirm(`Disable ${name}? Anyone who has the code will no longer be able to use it.`)) return

    setWorking(true)
    setMessage('')
    try {
      const { error } = await supabase.rpc('disable_beta_invite', { target_invite: invite.id })
      if (error) throw error
      await loadInvites()
      setMessage('Invitation disabled.')
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setWorking(false)
    }
  }

  if (!canManage) return null

  return (
    <>
      <button className="admin-invite-launcher" type="button" onClick={() => { setOpen(true); setMessage('') }}>
        Invitations{activeCount > 0 && <span>{activeCount}</span>}
      </button>

      {open && (
        <div className="admin-invite-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !working) setOpen(false) }}>
          <section className="admin-invite-panel" role="dialog" aria-modal="true" aria-labelledby="admin-invite-title">
            <header className="admin-invite-header">
              <div>
                <p className="eyebrow">Closed beta access</p>
                <h2 id="admin-invite-title">Invitations.</h2>
                <p>Create controlled signup codes. Project PenPal stores only a hash of each code, so copy the code when it is created.</p>
              </div>
              <button className="admin-tool-close" type="button" onClick={() => setOpen(false)} disabled={working}>×</button>
            </header>

            {message && <p className="status-message admin-invite-status">{message}</p>}

            {createdInvite && (
              <section className="admin-invite-created" aria-live="polite">
                <span>New invitation — copy this now</span>
                <code>{createdInvite.invite_code}</code>
                <button className="primary" type="button" onClick={() => void copyCode()}>{copied ? 'Copied!' : 'Copy invitation code'}</button>
                <small>This raw code is shown only in this browser session. The database keeps only its one-way hash.</small>
              </section>
            )}

            <section className="admin-invite-create-section">
              <div>
                <h3>Create an invitation</h3>
                <p>One use and 14 days is a good default for individual beta testers.</p>
              </div>
              <form className="admin-invite-form" onSubmit={createInvite}>
                <label>Label <span>optional</span><input value={label} maxLength={100} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Jamie — first beta group" /></label>
                <label>Number of uses<select value={uses} onChange={(event) => setUses(Number(event.target.value))}><option value={1}>1 use</option><option value={2}>2 uses</option><option value={3}>3 uses</option><option value={5}>5 uses</option><option value={10}>10 uses</option><option value={25}>25 uses</option></select></label>
                <label>Expires<select value={expiresDays} onChange={(event) => setExpiresDays(event.target.value === '' ? '' : Number(event.target.value))}><option value={1}>1 day</option><option value={3}>3 days</option><option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option><option value={90}>90 days</option><option value="">No expiration</option></select></label>
                <button className="primary" type="submit" disabled={working}>{working ? 'Creating…' : 'Create invitation'}</button>
              </form>
            </section>

            <section className="admin-invite-list-section">
              <div className="admin-invite-list-heading">
                <div><h3>Invitation history</h3><p>Codes themselves cannot be retrieved after creation.</p></div>
                <button className="secondary" type="button" onClick={() => void loadInvites()} disabled={loading || working}>{loading ? 'Refreshing…' : 'Refresh'}</button>
              </div>

              {loading ? <p className="connection-empty">Loading invitations…</p> : invites.length === 0 ? (
                <p className="connection-empty">No beta invitations have been created yet.</p>
              ) : (
                <div className="admin-invite-list">
                  {invites.map((invite) => {
                    const status = inviteStatus(invite)
                    return (
                      <article key={invite.id} className={`admin-invite-row ${status}`}>
                        <div className="admin-invite-row-main">
                          <div><span className={`admin-invite-status-pill ${status}`}>{status}</span><h4>{invite.label || 'Unlabeled invitation'}</h4></div>
                          <strong>{invite.use_count} / {invite.max_uses} used</strong>
                        </div>
                        <div className="admin-invite-meta">
                          <span>Created {formatDate(invite.created_at)}{invite.created_by_name ? ` by ${invite.created_by_name}` : ''}</span>
                          <span>{invite.expires_at ? `Expires ${formatDate(invite.expires_at)}` : 'No expiration'}</span>
                        </div>
                        {status === 'active' && <button className="secondary" type="button" disabled={working} onClick={() => void disableInvite(invite)}>Disable</button>}
                      </article>
                    )
                  })}
                </div>
              )}
            </section>
          </section>
        </div>
      )}
    </>
  )
}

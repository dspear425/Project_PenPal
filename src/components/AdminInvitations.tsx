import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'

type StaffRole = 'moderator' | 'admin' | 'owner'
type Tab = 'invites' | 'members' | 'readiness'

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

type RedemptionRow = {
  invite_id: string
  invite_label: string | null
  user_id: string
  email: string | null
  display_name: string | null
  redeemed_at: string
  joined_at: string
  onboarding_complete: boolean
  account_status: string
  staff_only: boolean
}

type ReadinessRow = {
  beta_gate_installed: boolean
  owner_staff_only: boolean
  owner_hidden_from_discovery: boolean
  feedback_channel_installed: boolean
  required_policy_count: number
  active_invite_count: number
  test_invite_count: number
  beta_member_count: number
  feedback_thread_count: number
}

type CreatedInvite = {
  invite_id: string
  invite_code: string
  label: string | null
  max_uses: number
  expires_at: string | null
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

function isTestInvite(invite: InviteRow) {
  return (invite.label ?? '').toLowerCase().includes('test')
}

export default function AdminInvitations() {
  const [role, setRole] = useState<StaffRole | null>(null)
  const [toolbarTarget, setToolbarTarget] = useState<Element | null>(null)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('invites')
  const [loading, setLoading] = useState(false)
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')
  const [invites, setInvites] = useState<InviteRow[]>([])
  const [redemptions, setRedemptions] = useState<RedemptionRow[]>([])
  const [readiness, setReadiness] = useState<ReadinessRow | null>(null)
  const [label, setLabel] = useState('')
  const [uses, setUses] = useState(1)
  const [expiresDays, setExpiresDays] = useState<number | ''>(14)
  const [createdInvite, setCreatedInvite] = useState<CreatedInvite | null>(null)
  const [copied, setCopied] = useState(false)

  const canManage = role === 'admin' || role === 'owner'
  const activeCount = useMemo(() => invites.filter((invite) => inviteStatus(invite) === 'active').length, [invites])
  const readyForBeta = Boolean(
    readiness?.beta_gate_installed
    && readiness.owner_staff_only
    && readiness.owner_hidden_from_discovery
    && readiness.feedback_channel_installed
    && readiness.required_policy_count >= 3
    && readiness.test_invite_count === 0,
  )

  useEffect(() => {
    let active = true

    async function refreshRole() {
      const { data: sessionData } = await supabase.auth.getSession()
      if (!active) return
      const userId = sessionData.session?.user.id
      if (!userId) {
        setRole(null)
        setOpen(false)
        return
      }

      const { data, error } = await supabase
        .from('admin_users')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle()
      if (!active) return
      setRole(error ? null : ((data?.role ?? null) as StaffRole | null))
    }

    const refreshTarget = () => setToolbarTarget(document.querySelector('.admin-floating-toolbar'))
    void refreshRole()
    refreshTarget()

    const { data: listener } = supabase.auth.onAuthStateChange(() => void refreshRole())
    const observer = new MutationObserver(refreshTarget)
    observer.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('hashchange', refreshTarget)

    return () => {
      active = false
      listener.subscription.unsubscribe()
      observer.disconnect()
      window.removeEventListener('hashchange', refreshTarget)
    }
  }, [])

  useEffect(() => {
    if (open && canManage) void loadBetaOperations()
  }, [open, canManage])

  async function loadBetaOperations() {
    setLoading(true)
    setMessage('')
    try {
      const [inviteResult, redemptionResult, readinessResult] = await Promise.all([
        supabase.rpc('list_beta_invites'),
        supabase.rpc('list_beta_invite_redemptions', { target_invite: null }),
        supabase.rpc('beta_readiness_status'),
      ])
      if (inviteResult.error) throw inviteResult.error
      if (redemptionResult.error) throw redemptionResult.error
      if (readinessResult.error) throw readinessResult.error
      setInvites((inviteResult.data ?? []) as InviteRow[])
      setRedemptions((redemptionResult.data ?? []) as RedemptionRow[])
      const row = Array.isArray(readinessResult.data) ? readinessResult.data[0] : readinessResult.data
      setReadiness((row ?? null) as ReadinessRow | null)
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
      await loadBetaOperations()
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
      await loadBetaOperations()
      setMessage('Invitation disabled.')
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setWorking(false)
    }
  }

  async function removeTestStorage(userId: string) {
    const bucket = supabase.storage.from('profile-photos')
    const { data, error } = await bucket.list(userId, { limit: 100 })
    if (error) throw new Error(`Could not inspect test profile-photo storage: ${error.message}`)
    const paths = (data ?? [])
      .filter((item) => item.name && item.name !== '.emptyFolderPlaceholder')
      .map((item) => `${userId}/${item.name}`)
    if (!paths.length) return
    const { error: removeError } = await bucket.remove(paths)
    if (removeError) throw new Error(`Could not remove test profile-photo storage: ${removeError.message}`)
  }

  async function cleanupTestInvite(invite: InviteRow) {
    if (role !== 'owner' || !isTestInvite(invite)) return
    const members = redemptions.filter((item) => item.invite_id === invite.id)
    const description = members.length === 1 ? '1 test account' : `${members.length} test accounts`
    if (!window.confirm(`Clean up “${invite.label || 'test invitation'}”? This will permanently delete ${description}, their cascaded test data, their profile-photo files, and the test invitation.`)) return
    const phrase = window.prompt('Type DELETE TEST BETA DATA to confirm permanent cleanup:')
    if (phrase !== 'DELETE TEST BETA DATA') {
      setMessage('Test cleanup cancelled. The confirmation phrase did not match.')
      return
    }

    setWorking(true)
    setMessage('Removing test data…')
    try {
      for (const member of members) await removeTestStorage(member.user_id)
      const { data, error } = await supabase.rpc('cleanup_beta_test_invite', {
        target_invite: invite.id,
        confirmation: phrase,
      })
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      const deleted = Number(row?.deleted_accounts ?? members.length)
      setCreatedInvite(null)
      await loadBetaOperations()
      setMessage(`Test cleanup complete. Deleted ${deleted} test ${deleted === 1 ? 'account' : 'accounts'} and the test invitation.`)
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setWorking(false)
    }
  }

  if (!canManage || !toolbarTarget) return null

  const launcher = (
    <button className="admin-invite-launcher" type="button" onClick={() => { setOpen(true); setMessage(''); setTab('invites') }}>
      Beta Ops{activeCount > 0 && <span>{activeCount}</span>}
    </button>
  )

  const panel = open ? (
    <div className="admin-invite-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !working) setOpen(false) }}>
      <section className="admin-invite-panel" role="dialog" aria-modal="true" aria-labelledby="admin-invite-title">
        <header className="admin-invite-header">
          <div>
            <p className="eyebrow">Closed beta operations</p>
            <h2 id="admin-invite-title">Beta Ops.</h2>
            <p>Control invitations, see who joined through each code, remove test-only data, and check launch readiness.</p>
          </div>
          <button className="admin-tool-close" type="button" onClick={() => setOpen(false)} disabled={working}>×</button>
        </header>

        <div className="admin-beta-tabs" role="tablist" aria-label="Beta operations">
          <button className={tab === 'invites' ? 'selected' : ''} type="button" onClick={() => setTab('invites')}>Invitations <span>{invites.length}</span></button>
          <button className={tab === 'members' ? 'selected' : ''} type="button" onClick={() => setTab('members')}>Beta members <span>{redemptions.length}</span></button>
          <button className={tab === 'readiness' ? 'selected' : ''} type="button" onClick={() => setTab('readiness')}>Readiness <span>{readyForBeta ? '✓' : '!'}</span></button>
        </div>

        {message && <p className="status-message admin-invite-status">{message}</p>}

        {tab === 'invites' && (
          <>
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
                <p>One use and 14 days is a good default for an individual beta tester. Include the tester or group name in the label so attribution stays useful.</p>
              </div>
              <form className="admin-invite-form" onSubmit={createInvite}>
                <label>Label <span>optional</span><input value={label} maxLength={100} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Jamie — September beta" /></label>
                <label>Number of uses<select value={uses} onChange={(event) => setUses(Number(event.target.value))}><option value={1}>1 use</option><option value={2}>2 uses</option><option value={3}>3 uses</option><option value={5}>5 uses</option><option value={10}>10 uses</option><option value={25}>25 uses</option></select></label>
                <label>Expires<select value={expiresDays} onChange={(event) => setExpiresDays(event.target.value === '' ? '' : Number(event.target.value))}><option value={1}>1 day</option><option value={3}>3 days</option><option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option><option value={90}>90 days</option><option value="">No expiration</option></select></label>
                <button className="primary" type="submit" disabled={working}>{working ? 'Creating…' : 'Create invitation'}</button>
              </form>
            </section>

            <section className="admin-invite-list-section">
              <div className="admin-invite-list-heading">
                <div><h3>Invitation history</h3><p>Codes themselves cannot be retrieved after creation. Test-labelled invitations can be fully cleaned up by the Owner.</p></div>
                <button className="secondary" type="button" onClick={() => void loadBetaOperations()} disabled={loading || working}>{loading ? 'Refreshing…' : 'Refresh'}</button>
              </div>

              {loading ? <p className="connection-empty">Loading beta operations…</p> : invites.length === 0 ? (
                <p className="connection-empty">No beta invitations have been created yet.</p>
              ) : (
                <div className="admin-invite-list">
                  {invites.map((invite) => {
                    const status = inviteStatus(invite)
                    const members = redemptions.filter((item) => item.invite_id === invite.id)
                    return (
                      <article key={invite.id} className={`admin-invite-row ${status} ${isTestInvite(invite) ? 'test-invite' : ''}`}>
                        <div className="admin-invite-row-main">
                          <div><span className={`admin-invite-status-pill ${status}`}>{status}</span>{isTestInvite(invite) && <span className="admin-beta-test-pill">test</span>}<h4>{invite.label || 'Unlabeled invitation'}</h4></div>
                          <strong>{invite.use_count} / {invite.max_uses} used</strong>
                        </div>
                        <div className="admin-invite-meta">
                          <span>Created {formatDate(invite.created_at)}{invite.created_by_name ? ` by ${invite.created_by_name}` : ''}</span>
                          <span>{invite.expires_at ? `Expires ${formatDate(invite.expires_at)}` : 'No expiration'}</span>
                          {members.length > 0 && <span>{members.map((member) => member.display_name || member.email || 'Beta member').join(', ')}</span>}
                        </div>
                        <div className="admin-beta-row-actions">
                          {status === 'active' && <button className="secondary" type="button" disabled={working} onClick={() => void disableInvite(invite)}>Disable</button>}
                          {role === 'owner' && isTestInvite(invite) && <button className="danger-button" type="button" disabled={working} onClick={() => void cleanupTestInvite(invite)}>Clean up test data</button>}
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </section>
          </>
        )}

        {tab === 'members' && (
          <section className="admin-beta-members-section">
            <div className="admin-invite-list-heading">
              <div><h3>Beta member attribution</h3><p>Every signup remains tied to the invitation that admitted it. This helps you understand each beta group without retaining the raw invitation code.</p></div>
              <button className="secondary" type="button" onClick={() => void loadBetaOperations()} disabled={loading || working}>{loading ? 'Refreshing…' : 'Refresh'}</button>
            </div>
            {loading ? <p className="connection-empty">Loading beta members…</p> : redemptions.length === 0 ? (
              <p className="connection-empty">No beta invitation has been redeemed yet.</p>
            ) : (
              <div className="admin-beta-member-list">
                {redemptions.map((member) => (
                  <article key={member.user_id}>
                    <div className="admin-beta-member-main"><div><strong>{member.display_name || 'Profile not completed'}</strong><span>{member.email || member.user_id}</span></div><span className={`account-status ${member.account_status}`}>{member.account_status}</span></div>
                    <div className="admin-beta-member-meta"><span>Invite: <strong>{member.invite_label || 'Unlabeled invitation'}</strong></span><span>Joined {formatDate(member.joined_at)}</span><span>Redeemed {formatDate(member.redeemed_at)}</span><span>{member.onboarding_complete ? 'Profile completed' : 'Onboarding incomplete'}</span></div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === 'readiness' && (
          <section className="admin-beta-readiness-section">
            <div className={`admin-beta-ready-banner ${readyForBeta ? 'ready' : 'attention'}`}>
              <span aria-hidden="true">{readyForBeta ? '✓' : '!'}</span>
              <div><strong>{readyForBeta ? 'Project PenPal is ready for closed-beta invitations.' : 'A few beta-readiness items still need attention.'}</strong><p>These checks come from the live Supabase configuration and production account state.</p></div>
            </div>

            {!readiness ? <p className="connection-empty">Readiness data is unavailable.</p> : (
              <div className="admin-beta-check-grid">
                <article className={readiness.beta_gate_installed ? 'pass' : 'fail'}><span>{readiness.beta_gate_installed ? '✓' : '×'}</span><div><strong>Invite gate</strong><p>Database signup trigger is installed.</p></div></article>
                <article className={readiness.owner_staff_only ? 'pass' : 'fail'}><span>{readiness.owner_staff_only ? '✓' : '×'}</span><div><strong>Owner is staff-only</strong><p>Your Owner account stays out of the member experience.</p></div></article>
                <article className={readiness.owner_hidden_from_discovery ? 'pass' : 'fail'}><span>{readiness.owner_hidden_from_discovery ? '✓' : '×'}</span><div><strong>Owner hidden</strong><p>Discover and new pen-pal requests are disabled for the Owner.</p></div></article>
                <article className={readiness.feedback_channel_installed ? 'pass' : 'fail'}><span>{readiness.feedback_channel_installed ? '✓' : '×'}</span><div><strong>Feedback channel</strong><p>Private support/feedback threads are available.</p></div></article>
                <article className={readiness.required_policy_count >= 3 ? 'pass' : 'fail'}><span>{readiness.required_policy_count >= 3 ? '✓' : '×'}</span><div><strong>Required policies</strong><p>{readiness.required_policy_count} acceptance-required policies are configured.</p></div></article>
                <article className={readiness.test_invite_count === 0 ? 'pass' : 'fail'}><span>{readiness.test_invite_count === 0 ? '✓' : '×'}</span><div><strong>Test-data cleanup</strong><p>{readiness.test_invite_count === 0 ? 'No test-labelled invitations remain.' : `${readiness.test_invite_count} test-labelled invitation(s) remain.`}</p></div></article>
              </div>
            )}

            {readiness && <div className="admin-beta-stats"><article><strong>{readiness.active_invite_count}</strong><span>active invites</span></article><article><strong>{readiness.beta_member_count}</strong><span>beta signups</span></article><article><strong>{readiness.feedback_thread_count}</strong><span>feedback threads</span></article></div>}

            <div className="admin-beta-manual-checks">
              <h3>Final manual checks before the first real invitation</h3>
              <p>These are intentionally human checks because Supabase cannot verify what a tester actually sees in the deployed browser.</p>
              <ul>
                <li>Newest Cloudflare production deployment shows <strong>Success</strong>.</li>
                <li>Private/incognito signup rejects a bad invite and accepts a fresh one-use invite.</li>
                <li>Email verification returns to the production Project PenPal URL.</li>
                <li>A new member can complete onboarding, open Discover, and reach Help → Beta feedback.</li>
                <li>Check one phone-sized browser view before sending the first batch of invitations.</li>
              </ul>
            </div>
          </section>
        )}
      </section>
    </div>
  ) : null

  return (
    <>
      {createPortal(launcher, toolbarTarget)}
      {panel ? createPortal(panel, document.body) : null}
    </>
  )
}

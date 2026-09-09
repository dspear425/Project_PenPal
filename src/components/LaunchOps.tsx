import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'

type StaffRole = 'moderator' | 'admin' | 'owner'
type Tab = 'overview' | 'members' | 'checklist'

type LaunchStatus = {
  open_signup_enabled: boolean
  owner_staff_only: boolean
  owner_hidden_from_discovery: boolean
  feedback_channel_installed: boolean
  required_policy_count: number
  member_count: number
  completed_profile_count: number
  discoverable_member_count: number
  signups_last_7_days: number
  feedback_thread_count: number
}

type LaunchMember = {
  user_id: string
  email: string | null
  display_name: string | null
  joined_at: string
  last_sign_in_at: string | null
  onboarding_complete: boolean
  account_status: string
  discoverable: boolean
  accepting_new_penpals: boolean
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
  if (!value) return 'Never'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value))
}

export default function LaunchOps() {
  const [role, setRole] = useState<StaffRole | null>(null)
  const [toolbarTarget, setToolbarTarget] = useState<Element | null>(null)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('overview')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<LaunchStatus | null>(null)
  const [members, setMembers] = useState<LaunchMember[]>([])

  const canView = role === 'admin' || role === 'owner'
  const ready = useMemo(() => Boolean(
    status?.open_signup_enabled
    && status.owner_staff_only
    && status.owner_hidden_from_discovery
    && status.feedback_channel_installed
    && status.required_policy_count >= 3,
  ), [status])

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
    if (open && canView) void loadLaunchOps()
  }, [open, canView])

  async function loadLaunchOps() {
    setLoading(true)
    setMessage('')
    try {
      const [statusResult, memberResult] = await Promise.all([
        supabase.rpc('public_launch_status'),
        supabase.rpc('list_public_launch_members', { limit_count: 100 }),
      ])
      if (statusResult.error) throw statusResult.error
      if (memberResult.error) throw memberResult.error

      const statusRow = Array.isArray(statusResult.data) ? statusResult.data[0] : statusResult.data
      setStatus((statusRow ?? null) as LaunchStatus | null)
      setMembers((memberResult.data ?? []) as LaunchMember[])
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  if (!canView || !toolbarTarget) return null

  const launcher = (
    <button className="launch-ops-launcher" type="button" onClick={() => { setOpen(true); setTab('overview'); setMessage('') }}>
      Launch Ops
      {status && status.signups_last_7_days > 0 && <span>{status.signups_last_7_days}</span>}
    </button>
  )

  const panel = open ? (
    <div className="launch-ops-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}>
      <section className="launch-ops-panel" role="dialog" aria-modal="true" aria-labelledby="launch-ops-title">
        <header className="launch-ops-header">
          <div>
            <p className="eyebrow">Public early access</p>
            <h2 id="launch-ops-title">Launch Ops.</h2>
            <p>Watch early growth, onboarding, discoverability, and feedback as Project PenPal opens to the public.</p>
          </div>
          <button className="admin-tool-close" type="button" onClick={() => setOpen(false)}>×</button>
        </header>

        <div className="launch-ops-tabs" role="tablist" aria-label="Launch operations">
          <button className={tab === 'overview' ? 'selected' : ''} type="button" onClick={() => setTab('overview')}>Overview</button>
          <button className={tab === 'members' ? 'selected' : ''} type="button" onClick={() => setTab('members')}>Members <span>{status?.member_count ?? members.length}</span></button>
          <button className={tab === 'checklist' ? 'selected' : ''} type="button" onClick={() => setTab('checklist')}>Readiness <span>{ready ? '✓' : '!'}</span></button>
        </div>

        {message && <p className="status-message launch-ops-status">{message}</p>}

        {loading && !status ? <p className="connection-empty">Loading launch data…</p> : null}

        {tab === 'overview' && status && (
          <div className="launch-ops-overview">
            <div className={`launch-ops-banner ${ready ? 'ready' : 'attention'}`}>
              <span aria-hidden="true">{ready ? '✓' : '!'}</span>
              <div>
                <strong>{ready ? 'Public signup is open.' : 'Public launch configuration needs attention.'}</strong>
                <p>{ready ? 'Project PenPal is running in public early-access mode.' : 'Open Readiness to see which launch controls still need work.'}</p>
              </div>
            </div>

            <div className="launch-ops-stats">
              <article><strong>{status.member_count}</strong><span>public members</span></article>
              <article><strong>{status.completed_profile_count}</strong><span>completed profiles</span></article>
              <article><strong>{status.discoverable_member_count}</strong><span>discoverable now</span></article>
              <article><strong>{status.signups_last_7_days}</strong><span>signups · 7 days</span></article>
              <article><strong>{status.feedback_thread_count}</strong><span>feedback threads</span></article>
            </div>

            <section className="launch-ops-note">
              <h3>What to watch first</h3>
              <p>Early on, the most important number is not raw signups—it is how many people finish profiles and become discoverable. A healthy member pool gives new arrivals someone meaningful to find.</p>
            </section>
          </div>
        )}

        {tab === 'members' && (
          <section className="launch-ops-members">
            <div className="launch-ops-section-heading">
              <div><h3>Recent public members</h3><p>Staff accounts are excluded.</p></div>
              <button className="secondary" type="button" disabled={loading} onClick={() => void loadLaunchOps()}>{loading ? 'Refreshing…' : 'Refresh'}</button>
            </div>

            {members.length === 0 ? (
              <p className="connection-empty">No public member accounts yet.</p>
            ) : (
              <div className="launch-member-list">
                {members.map((member) => (
                  <article key={member.user_id}>
                    <div className="launch-member-main">
                      <div><strong>{member.display_name || 'Profile not completed'}</strong><span>{member.email || member.user_id}</span></div>
                      <span className={`account-status ${member.account_status}`}>{member.account_status}</span>
                    </div>
                    <div className="launch-member-meta">
                      <span>Joined {formatDate(member.joined_at)}</span>
                      <span>Last sign-in {formatDate(member.last_sign_in_at)}</span>
                      <span>{member.onboarding_complete ? 'Profile complete' : 'Onboarding incomplete'}</span>
                      <span>{member.discoverable && member.accepting_new_penpals ? 'Discoverable & accepting' : 'Not currently discoverable/accepting'}</span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === 'checklist' && status && (
          <section className="launch-ops-readiness">
            <div className="launch-check-grid">
              <article className={status.open_signup_enabled ? 'pass' : 'fail'}><span>{status.open_signup_enabled ? '✓' : '×'}</span><div><strong>Open signup</strong><p>Beta invitation enforcement is removed.</p></div></article>
              <article className={status.owner_staff_only ? 'pass' : 'fail'}><span>{status.owner_staff_only ? '✓' : '×'}</span><div><strong>Owner staff-only</strong><p>The Owner account stays out of the member experience.</p></div></article>
              <article className={status.owner_hidden_from_discovery ? 'pass' : 'fail'}><span>{status.owner_hidden_from_discovery ? '✓' : '×'}</span><div><strong>Owner hidden</strong><p>Members cannot discover or request the Owner account.</p></div></article>
              <article className={status.feedback_channel_installed ? 'pass' : 'fail'}><span>{status.feedback_channel_installed ? '✓' : '×'}</span><div><strong>Feedback channel</strong><p>Private member feedback threads are available.</p></div></article>
              <article className={status.required_policy_count >= 3 ? 'pass' : 'fail'}><span>{status.required_policy_count >= 3 ? '✓' : '×'}</span><div><strong>Required policies</strong><p>{status.required_policy_count} signup-required policy versions are configured.</p></div></article>
            </div>

            <div className="launch-manual-checks">
              <h3>Human checks before promotion</h3>
              <ul>
                <li>Newest Cloudflare production deployment shows <strong>Success</strong>.</li>
                <li>Incognito signup works with no invitation code.</li>
                <li>Email verification returns to the production Project PenPal URL.</li>
                <li>A new member can finish onboarding and appear in Discover.</li>
                <li>Send feedback opens and creates a private support thread.</li>
                <li>Check one phone-sized browser view.</li>
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

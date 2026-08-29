import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type StaffRole = 'moderator' | 'admin' | 'owner'

type TeamMember = {
  user_id: string
  display_name: string | null
  username: string | null
  email: string | null
  role: StaffRole
  account_status: 'active' | 'suspended' | 'banned'
  created_at: string
  updated_at: string
  added_by: string | null
  added_by_name: string | null
}

type Candidate = {
  user_id: string
  display_name: string | null
  username: string | null
  email: string | null
  member_code: string | null
  country: string | null
  current_role: StaffRole | null
  account_status: 'active' | 'suspended' | 'banned'
}

type AuditRow = {
  id: string
  actor_user_id: string | null
  actor_name: string | null
  target_user_id: string
  target_name: string | null
  previous_role: StaffRole | null
  new_role: StaffRole | null
  reason: string | null
  created_at: string
}

type Props = {
  currentUserId: string
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value))
}

function roleLabel(role: StaffRole | null) {
  if (role === 'owner') return 'Owner'
  if (role === 'admin') return 'Admin'
  if (role === 'moderator') return 'Moderator'
  return 'Member'
}

export default function AdminTeam({ currentUserId, role }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')
  const [team, setTeam] = useState<TeamMember[]>([])
  const [audit, setAudit] = useState<AuditRow[]>([])
  const [tab, setTab] = useState<'team' | 'audit'>('team')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Candidate[]>([])
  const [selected, setSelected] = useState<Candidate | null>(null)
  const [requestedRole, setRequestedRole] = useState<'moderator' | 'admin'>('moderator')
  const [reason, setReason] = useState('')

  const canManage = role === 'admin' || role === 'owner'

  useEffect(() => {
    if (open) void loadTeam()
  }, [open])

  async function loadTeam() {
    setLoading(true)
    setMessage('')
    try {
      const requests = [supabase.rpc('admin_team_directory')]
      if (canManage) requests.push(supabase.rpc('admin_team_audit', { limit_rows: 60 }))
      const [teamResult, auditResult] = await Promise.all(requests)
      if (teamResult.error) throw teamResult.error
      setTeam((teamResult.data ?? []) as TeamMember[])
      if (auditResult) {
        if (auditResult.error) throw auditResult.error
        setAudit((auditResult.data ?? []) as AuditRow[])
      }
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  async function search(event: React.FormEvent) {
    event.preventDefault()
    if (!canManage || query.trim().length < 2) return
    setWorking(true)
    setMessage('')
    setSelected(null)
    try {
      const { data, error } = await supabase.rpc('admin_team_search', { search_term: query.trim() })
      if (error) throw error
      setResults((data ?? []) as Candidate[])
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setWorking(false)
    }
  }

  function selectCandidate(candidate: Candidate) {
    setSelected(candidate)
    setReason('')
    if (candidate.current_role === 'admin') setRequestedRole('admin')
    else setRequestedRole('moderator')
  }

  async function changeRole(newRole: 'moderator' | 'admin' | null) {
    if (!selected || reason.trim().length < 3) return
    const name = selected.display_name || selected.username || selected.email || 'this member'
    const description = newRole ? `change ${name}'s staff role to ${roleLabel(newRole)}` : `remove ${name} from the staff team`
    if (!window.confirm(`Confirm: ${description}?`)) return

    setWorking(true)
    setMessage('')
    try {
      const { error } = await supabase.rpc('manage_staff_role', {
        target_user: selected.user_id,
        requested_role: newRole ?? '',
        change_reason: reason.trim(),
      })
      if (error) throw error
      setResults([])
      setSelected(null)
      setQuery('')
      setReason('')
      await loadTeam()
      setMessage(newRole ? `${name} is now ${roleLabel(newRole)}.` : `${name} was removed from the staff team.`)
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setWorking(false)
    }
  }

  function canChangeMember(member: TeamMember) {
    if (!canManage || member.user_id === currentUserId || member.role === 'owner') return false
    if (role === 'admin' && member.role === 'admin') return false
    return true
  }

  return (
    <>
      <button className="admin-team-launcher" type="button" onClick={() => { setOpen(true); setMessage('') }}>
        Admin team
      </button>

      {open && (
        <div className="admin-team-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !working) setOpen(false) }}>
          <section className="admin-team-panel" role="dialog" aria-modal="true" aria-labelledby="admin-team-title">
            <header className="admin-team-header">
              <div>
                <p className="eyebrow">Staff & permissions</p>
                <h2 id="admin-team-title">Admin Team.</h2>
                <p>See who can moderate Project PenPal and keep staff-role changes accountable.</p>
              </div>
              <button className="admin-tool-close" type="button" onClick={() => setOpen(false)} disabled={working}>×</button>
            </header>

            <div className="admin-team-role-guide">
              <article><strong>Owner</strong><span>Protected account. Full staff management and administration.</span></article>
              <article><strong>Admin</strong><span>Can ban/restore accounts and appoint or remove moderators.</span></article>
              <article><strong>Moderator</strong><span>Can review cases, warn members, and issue temporary suspensions.</span></article>
            </div>

            <div className="admin-team-tabs">
              <button className={tab === 'team' ? 'selected' : ''} onClick={() => setTab('team')}>Team <span>{team.length}</span></button>
              {canManage && <button className={tab === 'audit' ? 'selected' : ''} onClick={() => setTab('audit')}>Role history <span>{audit.length}</span></button>}
            </div>

            {message && <p className="status-message admin-team-status">{message}</p>}

            {loading ? <p className="connection-empty">Loading staff team…</p> : tab === 'team' ? (
              <>
                <div className="admin-team-list">
                  {team.map((member) => (
                    <article key={member.user_id} className={`admin-team-member ${member.role}`}>
                      <div className="admin-team-member-main">
                        <div>
                          <span className={`admin-team-role ${member.role}`}>{roleLabel(member.role)}</span>
                          <h3>{member.display_name || 'Unnamed member'}</h3>
                          <p>{member.username ? `@${member.username}` : member.email || member.user_id}</p>
                        </div>
                        <span className={`account-status ${member.account_status}`}>{member.account_status}</span>
                      </div>
                      <div className="admin-team-meta">
                        <span>Added {formatDate(member.created_at)}</span>
                        <span>{member.added_by_name ? `Added by ${member.added_by_name}` : member.role === 'owner' ? 'Protected founding owner' : 'Original staff assignment'}</span>
                      </div>
                      {member.user_id === currentUserId && <small className="admin-team-you">This is your staff account.</small>}
                      {member.role === 'owner' && <small className="admin-team-protected">The Owner cannot be demoted, removed, suspended, banned, or self-deleted through normal administration.</small>}
                      {canChangeMember(member) && (
                        <button className="secondary" type="button" onClick={() => selectCandidate({
                          user_id: member.user_id,
                          display_name: member.display_name,
                          username: member.username,
                          email: member.email,
                          member_code: null,
                          country: null,
                          current_role: member.role,
                          account_status: member.account_status,
                        })}>Manage role</button>
                      )}
                    </article>
                  ))}
                </div>

                {canManage && (
                  <section className="admin-team-manage">
                    <div>
                      <h3>Add or change staff</h3>
                      <p>Search by display name, @username, email, member code, or user ID.</p>
                    </div>
                    <form className="admin-team-search" onSubmit={search}>
                      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search member…" minLength={2} />
                      <button className="secondary" disabled={working || query.trim().length < 2}>{working ? 'Searching…' : 'Search'}</button>
                    </form>

                    {results.length > 0 && <div className="admin-team-search-results">{results.map((candidate) => (
                      <button key={candidate.user_id} className={selected?.user_id === candidate.user_id ? 'selected' : ''} type="button" onClick={() => selectCandidate(candidate)}>
                        <div><strong>{candidate.display_name || 'Unnamed member'}</strong>{candidate.current_role && <span className={`admin-team-role ${candidate.current_role}`}>{roleLabel(candidate.current_role)}</span>}</div>
                        <span>{candidate.username ? `@${candidate.username}` : candidate.email || candidate.member_code}</span>
                        <small>{candidate.country || 'Country not listed'} · {candidate.account_status}</small>
                      </button>
                    ))}</div>}

                    {selected && (
                      <div className="admin-team-change-card">
                        <div><strong>{selected.display_name || selected.username || selected.email || 'Member'}</strong><span>Current role: {roleLabel(selected.current_role)}</span></div>
                        {selected.current_role === 'owner' || selected.user_id === currentUserId ? (
                          <div className="admin-team-lock-note">This protected/self staff role cannot be changed here.</div>
                        ) : role === 'admin' && selected.current_role === 'admin' ? (
                          <div className="admin-team-lock-note">Only the Owner can change another administrator.</div>
                        ) : selected.account_status !== 'active' && !selected.current_role ? (
                          <div className="admin-team-lock-note">Restore this member account before assigning a staff role.</div>
                        ) : (
                          <>
                            <label>Reason for role change <span>required · audited</span><textarea rows={3} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is this staff change being made?" /></label>
                            <div className="admin-team-change-actions">
                              <button className="secondary" type="button" disabled={working || reason.trim().length < 3 || selected.current_role === 'moderator'} onClick={() => void changeRole('moderator')}>Make moderator</button>
                              {role === 'owner' && <button className="secondary" type="button" disabled={working || reason.trim().length < 3 || selected.current_role === 'admin'} onClick={() => void changeRole('admin')}>Make admin</button>}
                              {selected.current_role && <button className="danger-button" type="button" disabled={working || reason.trim().length < 3} onClick={() => void changeRole(null)}>Remove staff access</button>}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </section>
                )}
              </>
            ) : (
              <div className="admin-team-audit">
                {audit.length === 0 ? <p className="connection-empty">No staff-role changes have been recorded yet.</p> : audit.map((item) => (
                  <article key={item.id}>
                    <div><strong>{item.target_name || 'Member'}</strong><time>{formatDate(item.created_at)}</time></div>
                    <p>{roleLabel(item.previous_role)} → {roleLabel(item.new_role)}</p>
                    <small>{item.actor_name ? `Changed by ${item.actor_name}` : 'System migration'}{item.reason ? ` · ${item.reason}` : ''}</small>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  )
}

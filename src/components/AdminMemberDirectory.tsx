import { useState } from 'react'
import { supabase } from '../lib/supabase'

type SearchResult = {
  user_id: string
  display_name: string | null
  username: string | null
  email: string | null
  private_last_name: string | null
  member_code: string | null
  country: string | null
  region: string | null
  nearest_city: string | null
  birth_year: number | null
  account_status: 'active' | 'suspended' | 'banned'
  suspended_until: string | null
  joined_at: string
  report_count: number
  moderation_action_count: number
}

type UserContext = {
  profile: Record<string, unknown>
  reports: Array<Record<string, unknown>>
  actions: Array<Record<string, unknown>>
  support_threads: Array<Record<string, unknown>>
}

type Relationship = {
  relationship_id: string
  other_user_id: string
  other_display_name: string | null
  other_country: string | null
  relationship_status: string
  intro_message: string | null
  created_at: string
  responded_at: string | null
  paused_at: string | null
  ended_at: string | null
  letter_count: number
  last_letter_at: string | null
}

type ReviewedLetter = {
  id: string
  sender_id: string
  recipient_id: string
  subject: string | null
  body: string
  created_at: string
  read_at: string | null
}

type ReviewedCorrespondence = {
  letters: ReviewedLetter[]
  total_letters: number
  returned_letters: number
}

type Props = { userId: string }

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const value = (error as { message?: unknown }).message
    if (typeof value === 'string') return value
  }
  return String(error || 'Unknown error')
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value))
}

function maskEmail(email: string | null) {
  if (!email || !email.includes('@')) return 'Email unavailable'
  const [name, domain] = email.split('@')
  const visible = name.slice(0, Math.min(2, name.length))
  return `${visible}${'•'.repeat(Math.max(3, Math.min(7, name.length - visible.length)))}@${domain}`
}

export default function AdminMemberDirectory({ userId }: Props) {
  const [open, setOpen] = useState(false)
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')
  const [query, setQuery] = useState('')
  const [country, setCountry] = useState('')
  const [region, setRegion] = useState('')
  const [city, setCity] = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [status, setStatus] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [selected, setSelected] = useState<SearchResult | null>(null)
  const [context, setContext] = useState<UserContext | null>(null)
  const [relationships, setRelationships] = useState<Relationship[]>([])
  const [tab, setTab] = useState<'overview' | 'penpals' | 'support'>('overview')
  const [selectedRelationship, setSelectedRelationship] = useState<Relationship | null>(null)
  const [accessReason, setAccessReason] = useState('')
  const [correspondence, setCorrespondence] = useState<ReviewedCorrespondence | null>(null)
  const [outreach, setOutreach] = useState(false)
  const [outreachSubject, setOutreachSubject] = useState('')
  const [outreachBody, setOutreachBody] = useState('')
  const [actionReason, setActionReason] = useState('')
  const [suspensionHours, setSuspensionHours] = useState(72)

  function clearCase() {
    setSelected(null)
    setContext(null)
    setRelationships([])
    setSelectedRelationship(null)
    setCorrespondence(null)
    setAccessReason('')
    setOutreach(false)
    setActionReason('')
  }

  async function search(event: React.FormEvent) {
    event.preventDefault()
    if (![query, country, region, city, birthYear, status].some((value) => value.trim())) {
      setMessage('Enter a name or identifier, or use at least one filter.')
      return
    }

    setWorking(true)
    setMessage('')
    clearCase()
    try {
      const { data, error } = await supabase.rpc('moderator_search_users_v2', {
        search_term: query.trim() || null,
        filter_country: country.trim() || null,
        filter_region: region.trim() || null,
        filter_city: city.trim() || null,
        filter_birth_year: birthYear ? Number(birthYear) : null,
        filter_status: status || null,
      })
      if (error) throw error
      setResults((data ?? []) as SearchResult[])
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setWorking(false)
    }
  }

  async function openMember(result: SearchResult, preserveTab = false) {
    setSelected(result)
    setWorking(true)
    setMessage('')
    setSelectedRelationship(null)
    setCorrespondence(null)
    setAccessReason('')
    if (!preserveTab) setTab('overview')

    try {
      const [contextResult, relationshipResult] = await Promise.all([
        supabase.rpc('moderator_user_context', { target_user: result.user_id }),
        supabase.rpc('moderator_user_relationships', { target_user: result.user_id }),
      ])
      if (contextResult.error) throw contextResult.error
      if (relationshipResult.error) throw relationshipResult.error
      setContext((contextResult.data ?? null) as UserContext | null)
      setRelationships((relationshipResult.data ?? []) as Relationship[])
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setWorking(false)
    }
  }

  async function sendOutreach(event: React.FormEvent) {
    event.preventDefault()
    if (!selected || outreachSubject.trim().length < 3 || !outreachBody.trim()) return
    setWorking(true)
    setMessage('')
    try {
      const { error } = await supabase.rpc('moderator_start_support_thread', {
        target_user: selected.user_id,
        ticket_subject: outreachSubject,
        first_message: outreachBody,
      })
      if (error) throw error
      setOutreachSubject('')
      setOutreachBody('')
      setOutreach(false)
      await openMember(selected, true)
      setTab('support')
      setMessage(`Message sent to ${selected.display_name || selected.username || 'member'}.`)
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setWorking(false)
    }
  }

  async function takeAction(action: 'warning' | 'suspend' | 'ban' | 'restore') {
    if (!selected) return
    if ((action === 'suspend' || action === 'ban') && selected.user_id === userId) {
      setMessage('You cannot suspend or ban your own moderator account. This protects administrator access.')
      return
    }
    if (action !== 'restore' && !actionReason.trim()) {
      setMessage('A reason is required for a warning, suspension, or ban.')
      return
    }
    if (action === 'ban' && !window.confirm(`Ban ${selected.display_name || selected.username || 'this member'}? They will lose normal access until restored by an administrator.`)) return

    setWorking(true)
    setMessage('')
    try {
      const { error } = await supabase.rpc('moderation_take_action', {
        target_user: selected.user_id,
        target_report: null,
        action,
        reason: actionReason.trim() || null,
        suspension_hours: action === 'suspend' ? suspensionHours : null,
      })
      if (error) throw error
      setActionReason('')
      const updated: SearchResult = {
        ...selected,
        account_status: action === 'suspend' ? 'suspended' : action === 'ban' ? 'banned' : action === 'restore' ? 'active' : selected.account_status,
      }
      setSelected(updated)
      setResults((previous) => previous.map((item) => item.user_id === updated.user_id ? updated : item))
      await openMember(updated, true)
      setMessage(action === 'restore' ? 'Account restored.' : `Moderation action recorded: ${action}.`)
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setWorking(false)
    }
  }

  async function reviewCorrespondence(event: React.FormEvent) {
    event.preventDefault()
    if (!selected || !selectedRelationship || accessReason.trim().length < 5) return
    setWorking(true)
    setMessage('')
    try {
      const { data, error } = await supabase.rpc('moderator_relationship_correspondence', {
        target_user: selected.user_id,
        target_relationship: selectedRelationship.relationship_id,
        access_reason: accessReason,
      })
      if (error) throw error
      setCorrespondence((data ?? null) as ReviewedCorrespondence | null)
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setWorking(false)
    }
  }

  const profile = context?.profile ?? {}
  const selectedIsSelf = selected?.user_id === userId

  return (
    <>
      <button className="admin-directory-launcher" type="button" onClick={() => { setOpen(true); setMessage('') }}>Find member</button>

      {open && (
        <div className="admin-directory-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !working) setOpen(false) }}>
          <section className="admin-directory-panel" role="dialog" aria-modal="true">
            <header>
              <div><p className="eyebrow">Moderator directory</p><h2>Find the right member.</h2><p>Search by identity or combine location, birth year, and account filters to narrow common names.</p></div>
              <button className="admin-tool-close" onClick={() => setOpen(false)}>×</button>
            </header>

            <form className="admin-directory-search" onSubmit={search}>
              <label className="admin-directory-query">Name, @username, email, private surname, member code, or user ID<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Alex, @alexwrites, PP-…, or email" /></label>
              <div className="admin-directory-filters">
                <label>Country<input value={country} onChange={(event) => setCountry(event.target.value)} placeholder="United Kingdom" /></label>
                <label>State / region<input value={region} onChange={(event) => setRegion(event.target.value)} placeholder="England" /></label>
                <label>Nearest city / metro<input value={city} onChange={(event) => setCity(event.target.value)} placeholder="Gatwick" /></label>
                <label>Birth year<input type="number" min="1900" max={new Date().getFullYear() - 18} value={birthYear} onChange={(event) => setBirthYear(event.target.value)} placeholder="1983" /></label>
                <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Any status</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="banned">Banned</option></select></label>
              </div>
              <div className="admin-directory-search-actions"><button className="primary" disabled={working}>{working ? 'Searching…' : 'Search directory'}</button><button className="secondary" type="button" onClick={() => { setQuery(''); setCountry(''); setRegion(''); setCity(''); setBirthYear(''); setStatus(''); setResults([]); clearCase(); setMessage('') }}>Clear</button></div>
            </form>

            {message && <p className="status-message admin-directory-status">{message}</p>}

            <div className="admin-directory-workspace">
              <aside className="admin-directory-results">
                {results.length === 0 ? <div className="admin-tool-empty"><span>⌕</span><h3>No results yet.</h3><p>Search by an identifier or combine filters above.</p></div> : results.map((result) => (
                  <button key={result.user_id} className={`admin-directory-result ${selected?.user_id === result.user_id ? 'selected' : ''}`} onClick={() => void openMember(result)}>
                    <div><strong>{result.display_name || 'Unnamed member'}</strong><span className={`account-status ${result.account_status}`}>{result.account_status}</span></div>
                    <span>{result.username ? `@${result.username}` : 'No custom username'} · {result.member_code || 'No code'}</span>
                    <span>{[result.nearest_city, result.region, result.country].filter(Boolean).join(', ') || 'Location not listed'}</span>
                    <small>{result.birth_year ? `Born ${result.birth_year} · ` : ''}{maskEmail(result.email)}</small>
                  </button>
                ))}
              </aside>

              <section className="admin-directory-case">
                {!selected ? <div className="admin-tool-empty"><span>↗</span><h3>Select a member.</h3><p>Their protected case file will appear here.</p></div> : working && !context ? <p className="connection-empty">Loading case file…</p> : context && (
                  <>
                    <div className="admin-directory-case-heading">
                      <div><h3>{String(profile.display_name || selected.display_name || 'Member')}</h3><p>{profile.username ? `@${String(profile.username)}` : ''}</p></div>
                      <div><span className={`account-status ${String(profile.account_status || selected.account_status)}`}>{String(profile.account_status || selected.account_status)}</span><button className="primary" onClick={() => setOutreach((value) => !value)}>Message member</button></div>
                    </div>

                    {outreach && <form className="admin-outreach-form" onSubmit={sendOutreach}><div><strong>Start a moderator conversation</strong><span>The member receives this in Help and can reply.</span></div><label>Subject<input maxLength={120} value={outreachSubject} onChange={(event) => setOutreachSubject(event.target.value)} /></label><label>Message<textarea rows={4} maxLength={6000} value={outreachBody} onChange={(event) => setOutreachBody(event.target.value)} /></label><div className="admin-case-actions"><button className="primary" disabled={working || outreachSubject.trim().length < 3 || !outreachBody.trim()}>Send message</button><button className="secondary" type="button" onClick={() => setOutreach(false)}>Cancel</button></div></form>}

                    <div className="admin-case-tabs"><button className={tab === 'overview' ? 'selected' : ''} onClick={() => setTab('overview')}>Overview</button><button className={tab === 'penpals' ? 'selected' : ''} onClick={() => setTab('penpals')}>Pen-pal history <span>{relationships.length}</span></button><button className={tab === 'support' ? 'selected' : ''} onClick={() => setTab('support')}>Support <span>{context.support_threads.length}</span></button></div>

                    {tab === 'overview' && <div className="admin-case-tab-content">
                      <div className="admin-private-info-card"><div><span>Member code</span><strong>{String(profile.member_code || '—')}</strong></div><div><span>Private surname</span><strong>{String(profile.private_last_name || 'Not provided')}</strong></div><div><span>Email</span><strong>{String(profile.email || selected.email || '—')}</strong></div></div>
                      <div className="admin-user-facts"><span>User ID <code>{selected.user_id}</code></span><span>Birth year <strong>{String(profile.birth_year || 'Not listed')}</strong></span><span>Country <strong>{String(profile.country || 'Not listed')}</strong></span><span>Region <strong>{String(profile.region || 'Not listed')}</strong></span><span>Nearest city <strong>{String(profile.nearest_city || 'Not listed')}</strong></span><span>Joined <strong>{formatDate(String(profile.created_at || selected.joined_at))}</strong></span></div>

                      <section className="admin-case-account-actions"><h4>Account action</h4><p>{selectedIsSelf ? 'This is your moderator account. Self-suspension and self-ban are disabled to protect administrator access. Warnings can still be recorded.' : 'Reason is required for Warning, Suspend, or Ban. Actions are logged and delivered to the member through Account Notices.'}</p><textarea rows={3} maxLength={2000} value={actionReason} onChange={(event) => setActionReason(event.target.value)} placeholder="Reason for this moderation action…" /><label>Suspension length<select value={suspensionHours} onChange={(event) => setSuspensionHours(Number(event.target.value))}><option value={24}>24 hours</option><option value={72}>3 days</option><option value={168}>7 days</option><option value={336}>14 days</option><option value={720}>30 days</option><option value={2160}>90 days</option></select></label><div className="admin-case-actions"><button className="secondary" disabled={working || !actionReason.trim()} onClick={() => void takeAction('warning')}>Issue warning</button><button className="secondary" disabled={working || !actionReason.trim() || selectedIsSelf} onClick={() => void takeAction('suspend')} title={selectedIsSelf ? 'You cannot suspend your own moderator account.' : undefined}>Suspend</button><button className="danger-button" disabled={working || !actionReason.trim() || selectedIsSelf} onClick={() => void takeAction('ban')} title={selectedIsSelf ? 'You cannot ban your own moderator account.' : undefined}>Ban account</button>{String(profile.account_status || selected.account_status) !== 'active' && <button className="primary" disabled={working} onClick={() => void takeAction('restore')}>Restore account</button>}</div></section>

                      <section><h4>Reports involving this member</h4><p>{context.reports.length} report{context.reports.length === 1 ? '' : 's'} as the reported member.</p></section>
                      <section><h4>Moderation history</h4>{context.actions.length === 0 ? <p>No moderation actions.</p> : <div className="admin-mini-history">{context.actions.slice(0, 15).map((item) => <article key={String(item.id)}><strong>{String(item.action_type)}</strong><time>{formatDate(String(item.created_at || ''))}</time>{item.reason ? <p>{String(item.reason)}</p> : null}</article>)}</div>}</section>
                    </div>}

                    {tab === 'penpals' && <div className="admin-case-tab-content"><div className="admin-privacy-note"><strong>Private correspondence</strong><span>Relationship metadata is available for moderation. Letter contents require a reason and every access is logged.</span></div><div className="admin-relationship-layout"><div className="admin-relationship-list">{relationships.map((relationship) => <button key={relationship.relationship_id} className={`admin-relationship-card ${selectedRelationship?.relationship_id === relationship.relationship_id ? 'selected' : ''}`} onClick={() => { setSelectedRelationship(relationship); setCorrespondence(null); setAccessReason('') }}><div><strong>{relationship.other_display_name || 'Member'}</strong><span>{relationship.relationship_status}</span></div><small>{relationship.letter_count} letters · {relationship.other_country || 'Country not listed'}</small></button>)}</div><div className="admin-relationship-detail">{!selectedRelationship ? <div className="admin-tool-empty"><span>↗</span><h3>Select a relationship.</h3></div> : <><div className="admin-relationship-heading"><div><h4>{selected.display_name || selected.username} ↔ {selectedRelationship.other_display_name || 'Member'}</h4><p>{selectedRelationship.relationship_status} · created {formatDate(selectedRelationship.created_at)}</p></div><strong>{selectedRelationship.letter_count} letters</strong></div>{selectedRelationship.letter_count > 0 && !correspondence && <form className="admin-correspondence-access" onSubmit={reviewCorrespondence}><label>Reason for reviewing correspondence <span>required · logged</span><textarea rows={3} maxLength={500} value={accessReason} onChange={(event) => setAccessReason(event.target.value)} /></label><button className="secondary" disabled={working || accessReason.trim().length < 5}>Review correspondence</button></form>}{correspondence && <div className="admin-reviewed-correspondence"><div className="admin-correspondence-summary"><strong>Correspondence review</strong><span>Showing {correspondence.returned_letters} of {correspondence.total_letters}. Access logged.</span></div><div className="admin-correspondence-letters">{correspondence.letters.map((letter) => <article key={letter.id}><div><strong>{letter.sender_id === selected.user_id ? selected.display_name || selected.username : selectedRelationship.other_display_name || 'Pen pal'}</strong><time>{formatDate(letter.created_at)}</time></div>{letter.subject && <h5>{letter.subject}</h5>}<p>{letter.body}</p></article>)}</div></div>}</>}</div></div></div>}

                    {tab === 'support' && <div className="admin-case-tab-content"><div className="admin-case-section-heading"><div><h4>Support conversations</h4><p>Use Member messages for the full conversation and reply controls.</p></div><button className="primary" onClick={() => setOutreach(true)}>Message member</button></div>{context.support_threads.length === 0 ? <p className="connection-empty">No support conversations.</p> : <div className="admin-case-support-list">{context.support_threads.map((thread) => <article key={String(thread.id)}><div><strong>{String(thread.subject || 'Support conversation')}</strong><span className={`support-status-pill ${String(thread.status || 'open')}`}>{String(thread.status || 'open')}</span></div><small>{String(thread.category || 'Support')} · updated {formatDate(String(thread.updated_at || thread.created_at || ''))}</small></article>)}</div>}</div>}
                  </>
                )}
              </section>
            </div>
          </section>
        </div>
      )}
    </>
  )
}

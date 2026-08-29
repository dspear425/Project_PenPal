import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import '../admin.css'

type ReportStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed'

type ReportRow = {
  id: string
  reporter_id: string
  reported_id: string
  relationship_id: string | null
  category: string
  details: string | null
  status: ReportStatus
  created_at: string
  reviewed_at: string | null
  moderator_notes: string | null
  assigned_to: string | null
}

type ProfileSummary = {
  id: string
  display_name: string | null
  country: string | null
  account_status: 'active' | 'suspended' | 'banned'
  suspended_until: string | null
}

type LetterEvidence = {
  id: string
  sender_id: string
  recipient_id: string
  subject: string | null
  body: string
  created_at: string
  read_at: string | null
}

type ModerationAction = {
  id: string
  moderator_id: string
  action_type: 'warning' | 'suspend' | 'ban' | 'restore' | 'note'
  reason: string | null
  suspension_until: string | null
  created_at: string
}

type ReportContext = {
  report: ReportRow
  relationship: Record<string, unknown> | null
  letters: LetterEvidence[]
  actions: ModerationAction[]
}

type Props = {
  userId: string
  role: 'moderator' | 'admin'
  onBack: () => void
  onSignOut: () => void
}

const categoryLabels: Record<string, string> = {
  harassment: 'Harassment / unwanted contact',
  scam: 'Scam / fraud / money request',
  sexual_content: 'Unwanted sexual content',
  hate_abuse: 'Hate / threats / abuse',
  impersonation: 'Impersonation / false identity',
  spam: 'Spam / mass messaging',
  other: 'Other concern',
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return String(error || 'Unknown error')
}

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value))
}

export default function AdminPanel({ userId, role, onBack, onSignOut }: Props) {
  const [reports, setReports] = useState<ReportRow[]>([])
  const [profiles, setProfiles] = useState<Map<string, ProfileSummary>>(new Map())
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null)
  const [context, setContext] = useState<ReportContext | null>(null)
  const [filter, setFilter] = useState<'all' | ReportStatus>('open')
  const [loading, setLoading] = useState(true)
  const [contextLoading, setContextLoading] = useState(false)
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')
  const [moderatorNotes, setModeratorNotes] = useState('')
  const [actionReason, setActionReason] = useState('')
  const [suspensionHours, setSuspensionHours] = useState(72)

  useEffect(() => {
    void loadReports()
  }, [userId])

  const filteredReports = useMemo(
    () => filter === 'all' ? reports : reports.filter((report) => report.status === filter),
    [reports, filter],
  )

  const counts = useMemo(() => ({
    all: reports.length,
    open: reports.filter((report) => report.status === 'open').length,
    reviewing: reports.filter((report) => report.status === 'reviewing').length,
    resolved: reports.filter((report) => report.status === 'resolved').length,
    dismissed: reports.filter((report) => report.status === 'dismissed').length,
  }), [reports])

  const repeatReportCounts = useMemo(() => {
    const result = new Map<string, number>()
    for (const report of reports) {
      result.set(report.reported_id, (result.get(report.reported_id) ?? 0) + 1)
    }
    return result
  }, [reports])

  const selectedReport = reports.find((report) => report.id === selectedReportId) ?? null
  const selectedTarget = selectedReport ? profiles.get(selectedReport.reported_id) : undefined

  async function loadReports(preserveSelection = true) {
    setLoading(true)
    setMessage('')

    try {
      const { data, error } = await supabase
        .from('reports')
        .select('id, reporter_id, reported_id, relationship_id, category, details, status, created_at, reviewed_at, moderator_notes, assigned_to')
        .order('created_at', { ascending: false })

      if (error) throw new Error(`Could not load reports: ${errorMessage(error)}`)

      const rows = (data ?? []) as ReportRow[]
      setReports(rows)

      const ids = Array.from(new Set(rows.flatMap((report) => [report.reporter_id, report.reported_id])))
      if (ids.length) {
        const { data: profileRows, error: profileError } = await supabase
          .from('profiles')
          .select('id, display_name, country, account_status, suspended_until')
          .in('id', ids)

        if (profileError) throw new Error(`Could not load report profiles: ${errorMessage(profileError)}`)

        const next = new Map<string, ProfileSummary>()
        for (const row of profileRows ?? []) {
          const profile = row as ProfileSummary
          next.set(profile.id, profile)
        }
        setProfiles(next)
      } else {
        setProfiles(new Map())
      }

      if (!preserveSelection || (selectedReportId && !rows.some((report) => report.id === selectedReportId))) {
        setSelectedReportId(null)
        setContext(null)
      }
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  async function openReport(report: ReportRow) {
    setSelectedReportId(report.id)
    setModeratorNotes(report.moderator_notes ?? '')
    setActionReason('')
    setContextLoading(true)
    setMessage('')

    try {
      const { data, error } = await supabase.rpc('moderation_report_context', { target_report: report.id })
      if (error) throw error
      setContext((data ?? null) as ReportContext | null)
    } catch (error) {
      setMessage(errorMessage(error))
      setContext(null)
    } finally {
      setContextLoading(false)
    }
  }

  async function updateReport(status: ReportStatus) {
    if (!selectedReport) return
    setWorking(true)
    setMessage('')

    try {
      const { error } = await supabase.rpc('moderation_update_report', {
        target_report: selectedReport.id,
        new_status: status,
        notes: moderatorNotes.trim() || null,
      })
      if (error) throw error
      await loadReports()
      const updated = reports.find((report) => report.id === selectedReport.id)
      if (updated) await openReport({ ...updated, status, moderator_notes: moderatorNotes.trim() || updated.moderator_notes })
      setMessage(`Report marked ${status}.`)
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setWorking(false)
    }
  }

  async function takeAction(action: 'warning' | 'suspend' | 'ban' | 'restore' | 'note') {
    if (!selectedReport) return

    if (['warning', 'suspend', 'ban', 'note'].includes(action) && !actionReason.trim()) {
      setMessage('Add a reason or moderation note before taking this action.')
      return
    }

    const target = profiles.get(selectedReport.reported_id)
    const targetName = target?.display_name || 'this member'

    if (action === 'ban' && !window.confirm(`Permanently ban ${targetName}? They will be prevented from using normal Project PenPal features until an administrator restores the account.`)) {
      return
    }

    setWorking(true)
    setMessage('')

    try {
      const { error } = await supabase.rpc('moderation_take_action', {
        target_user: selectedReport.reported_id,
        target_report: selectedReport.id,
        action,
        reason: actionReason.trim() || null,
        suspension_hours: action === 'suspend' ? suspensionHours : null,
      })
      if (error) throw error

      setActionReason('')
      await loadReports()
      await openReport({ ...selectedReport, status: ['warning', 'suspend', 'ban'].includes(action) ? 'resolved' : selectedReport.status })
      setMessage(action === 'restore' ? `${targetName}'s account was restored.` : `Moderation action recorded: ${action}.`)
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setWorking(false)
    }
  }

  function person(id: string) {
    return profiles.get(id)
  }

  return (
    <main className="page-shell admin-shell">
      <section className="admin-card">
        <header className="admin-header">
          <div className="brand-row compact-brand">
            <div className="stamp" aria-hidden="true">✉</div>
            <div><span className="brand-name">Project PenPal</span><span className="admin-brand-tag">Moderation</span></div>
          </div>
          <nav className="discover-nav" aria-label="Administration navigation">
            <span className="admin-role-badge">{role}</span>
            <button className="text-button discover-link" onClick={onBack}>Back to app</button>
            <button className="text-button discover-link" onClick={onSignOut}>Sign out</button>
          </nav>
        </header>

        <p className="eyebrow">Private administration</p>
        <div className="admin-title-row">
          <div>
            <h1 className="discover-title">Moderation queue.</h1>
            <p className="hero-copy discover-copy">Review member reports, examine relevant context, and keep a permanent audit trail of moderation decisions.</p>
          </div>
          <button className="secondary" onClick={() => void loadReports()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh queue'}</button>
        </div>

        <section className="admin-stats" aria-label="Report counts">
          <article><strong>{counts.open}</strong><span>Open</span></article>
          <article><strong>{counts.reviewing}</strong><span>Reviewing</span></article>
          <article><strong>{counts.resolved}</strong><span>Resolved</span></article>
          <article><strong>{counts.dismissed}</strong><span>Dismissed</span></article>
          <article><strong>{counts.all}</strong><span>Total reports</span></article>
        </section>

        {message && <p className="status-message admin-status">{message}</p>}

        <div className="admin-filter-row" role="group" aria-label="Filter reports">
          {(['open', 'reviewing', 'resolved', 'dismissed', 'all'] as const).map((value) => (
            <button key={value} className={`admin-filter ${filter === value ? 'selected' : ''}`} onClick={() => setFilter(value)}>
              {value[0].toUpperCase() + value.slice(1)} <span>{counts[value]}</span>
            </button>
          ))}
        </div>

        <div className="admin-workspace">
          <section className="admin-report-list" aria-label="Reports">
            {loading ? (
              <p className="connection-empty">Loading moderation queue…</p>
            ) : filteredReports.length === 0 ? (
              <div className="admin-empty"><span aria-hidden="true">✓</span><h2>No reports here.</h2><p>This queue is currently clear.</p></div>
            ) : filteredReports.map((report) => {
              const reporter = person(report.reporter_id)
              const target = person(report.reported_id)
              const repeatCount = repeatReportCounts.get(report.reported_id) ?? 1
              return (
                <button key={report.id} className={`admin-report-card ${selectedReportId === report.id ? 'selected' : ''}`} onClick={() => void openReport(report)}>
                  <div className="admin-report-card-top">
                    <span className={`admin-status-pill ${report.status}`}>{report.status}</span>
                    <time>{formatDate(report.created_at)}</time>
                  </div>
                  <strong>{categoryLabels[report.category] || report.category}</strong>
                  <span>Reported: {target?.display_name || 'Unknown member'}{target?.country ? ` · ${target.country}` : ''}</span>
                  <span>Reporter: {reporter?.display_name || 'Unknown member'}</span>
                  {repeatCount > 1 && <em>{repeatCount} reports involve this member</em>}
                </button>
              )
            })}
          </section>

          <section className="admin-detail" aria-live="polite">
            {!selectedReport ? (
              <div className="admin-detail-empty"><span aria-hidden="true">↗</span><h2>Select a report.</h2><p>Report details and moderation controls will appear here.</p></div>
            ) : contextLoading ? (
              <p className="connection-empty">Loading report context…</p>
            ) : (
              <>
                <div className="admin-detail-heading">
                  <div>
                    <span className={`admin-status-pill ${selectedReport.status}`}>{selectedReport.status}</span>
                    <h2>{categoryLabels[selectedReport.category] || selectedReport.category}</h2>
                    <p>Submitted {formatDate(selectedReport.created_at)}</p>
                  </div>
                </div>

                <div className="admin-people-grid">
                  <article>
                    <span>Reporter</span>
                    <strong>{person(selectedReport.reporter_id)?.display_name || 'Unknown member'}</strong>
                    <small>{person(selectedReport.reporter_id)?.country || 'Country not listed'}</small>
                  </article>
                  <article className="reported-person-card">
                    <span>Reported member</span>
                    <strong>{selectedTarget?.display_name || 'Unknown member'}</strong>
                    <small>{selectedTarget?.country || 'Country not listed'}</small>
                    <span className={`account-status ${selectedTarget?.account_status || 'active'}`}>
                      {selectedTarget?.account_status || 'active'}
                      {selectedTarget?.account_status === 'suspended' && selectedTarget.suspended_until ? ` until ${formatDate(selectedTarget.suspended_until)}` : ''}
                    </span>
                  </article>
                </div>

                <section className="admin-detail-section">
                  <h3>Report details</h3>
                  <div className="admin-report-text">{selectedReport.details || 'No additional details were provided.'}</div>
                </section>

                {context?.relationship && (
                  <section className="admin-detail-section">
                    <h3>Relationship context</h3>
                    <div className="admin-context-grid">
                      <span>Status: <strong>{String(context.relationship.status ?? 'unknown')}</strong></span>
                      <span>Created: <strong>{formatDate(String(context.relationship.created_at ?? ''))}</strong></span>
                      {'intro_message' in context.relationship && context.relationship.intro_message ? <span>Intro: <strong>{String(context.relationship.intro_message)}</strong></span> : null}
                    </div>
                  </section>
                )}

                <section className="admin-detail-section">
                  <h3>Recent letters in this reported relationship</h3>
                  {!context?.letters?.length ? (
                    <p className="connection-empty">No letter evidence is attached to this relationship.</p>
                  ) : (
                    <div className="admin-evidence-list">
                      {context.letters.map((letter) => (
                        <article key={letter.id} className="admin-evidence-letter">
                          <div><strong>{letter.sender_id === selectedReport.reporter_id ? 'Reporter' : letter.sender_id === selectedReport.reported_id ? 'Reported member' : 'Participant'}</strong><time>{formatDate(letter.created_at)}</time></div>
                          {letter.subject && <h4>{letter.subject}</h4>}
                          <p>{letter.body}</p>
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                <section className="admin-detail-section moderation-control-section">
                  <h3>Report disposition</h3>
                  <label className="admin-label">Moderator notes<textarea rows={4} maxLength={4000} value={moderatorNotes} onChange={(event) => setModeratorNotes(event.target.value)} placeholder="Internal notes about this report…" /></label>
                  <div className="admin-action-row">
                    <button className="secondary" disabled={working} onClick={() => void updateReport('reviewing')}>Mark reviewing</button>
                    <button className="secondary" disabled={working} onClick={() => void updateReport('resolved')}>Resolve</button>
                    <button className="secondary" disabled={working} onClick={() => void updateReport('dismissed')}>Dismiss</button>
                  </div>
                </section>

                <section className="admin-detail-section moderation-control-section">
                  <h3>Account action</h3>
                  <p className="admin-helper">Warnings are recorded without restricting the account. Suspensions and bans are enforced by the database, not just this screen.</p>
                  <label className="admin-label">Reason / internal record<textarea rows={4} maxLength={2000} value={actionReason} onChange={(event) => setActionReason(event.target.value)} placeholder="Why is this action appropriate?" /></label>
                  <label className="admin-label admin-suspend-label">Suspension length<select value={suspensionHours} onChange={(event) => setSuspensionHours(Number(event.target.value))}><option value={24}>24 hours</option><option value={72}>3 days</option><option value={168}>7 days</option><option value={336}>14 days</option><option value={720}>30 days</option><option value={2160}>90 days</option></select></label>
                  <div className="admin-action-row">
                    <button className="secondary" disabled={working} onClick={() => void takeAction('warning')}>Issue warning</button>
                    <button className="secondary admin-suspend-button" disabled={working} onClick={() => void takeAction('suspend')}>Suspend</button>
                    <button className="danger-button" disabled={working} onClick={() => void takeAction('ban')}>Ban account</button>
                    {selectedTarget && selectedTarget.account_status !== 'active' && <button className="primary" disabled={working} onClick={() => void takeAction('restore')}>Restore account</button>}
                  </div>
                </section>

                <section className="admin-detail-section">
                  <h3>Moderation history for this member</h3>
                  {!context?.actions?.length ? (
                    <p className="connection-empty">No previous moderation actions.</p>
                  ) : (
                    <div className="admin-history-list">
                      {context.actions.map((action) => (
                        <article key={action.id}>
                          <div><strong>{action.action_type}</strong><time>{formatDate(action.created_at)}</time></div>
                          {action.reason && <p>{action.reason}</p>}
                          {action.suspension_until && <small>Suspension until {formatDate(action.suspension_until)}</small>}
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </section>
        </div>
      </section>
    </main>
  )
}

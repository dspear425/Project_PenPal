import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type ActivityRow = {
  user_id: string
  display_name: string | null
  username: string | null
  country: string | null
  account_status: 'active' | 'suspended' | 'banned'
  joined_at: string
  last_activity_at: string
  requests_1h: number
  requests_24h: number
  letters_1h: number
  letters_24h: number
  reports_24h: number
  support_threads_24h: number
  support_messages_1h: number
  support_messages_24h: number
  repeated_request_template_count: number
  attention_score: number
  signals: string[]
}

type RateLimitRule = {
  limit_key: string
  event_type: string
  scope: string
  window_minutes: number
  max_actions: number
  new_account_max_actions: number | null
  new_account_age_hours: number | null
  enabled: boolean
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

function formatWindow(minutes: number) {
  if (minutes < 60) return `${minutes} min`
  if (minutes === 60) return '1 hour'
  if (minutes % 1440 === 0) return `${minutes / 1440} day${minutes === 1440 ? '' : 's'}`
  if (minutes % 60 === 0) return `${minutes / 60} hours`
  return `${minutes} min`
}

function labelForEvent(eventType: string) {
  const labels: Record<string, string> = {
    penpal_request: 'Pen-pal requests',
    letter: 'Letters',
    report: 'Reports',
    support_thread: 'New support threads',
    support_message: 'Support messages',
  }
  return labels[eventType] ?? eventType
}

export default function AdminActivity() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [rows, setRows] = useState<ActivityRow[]>([])
  const [rules, setRules] = useState<RateLimitRule[]>([])
  const [showAll, setShowAll] = useState(false)
  const [selected, setSelected] = useState<ActivityRow | null>(null)

  useEffect(() => {
    const refresh = () => void loadActivity(false)
    refresh()
    window.addEventListener('focus', refresh)
    const timer = window.setInterval(refresh, 60000)
    return () => {
      window.removeEventListener('focus', refresh)
      window.clearInterval(timer)
    }
  }, [])

  const visibleRows = useMemo(
    () => showAll ? rows : rows.filter((row) => Number(row.attention_score) > 0),
    [rows, showAll],
  )

  const flaggedCount = useMemo(
    () => rows.filter((row) => Number(row.attention_score) > 0).length,
    [rows],
  )

  async function loadActivity(showLoading = true) {
    if (showLoading) setLoading(true)
    try {
      const [activityResult, rulesResult] = await Promise.all([
        supabase.rpc('moderator_activity_overview', { window_hours: 24 }),
        supabase.rpc('moderator_rate_limit_rules'),
      ])
      if (activityResult.error) throw activityResult.error
      if (rulesResult.error) throw rulesResult.error
      const nextRows = (activityResult.data ?? []) as ActivityRow[]
      setRows(nextRows)
      setRules((rulesResult.data ?? []) as RateLimitRule[])
      setSelected((previous) => previous ? nextRows.find((row) => row.user_id === previous.user_id) ?? null : null)
    } catch (error) {
      if (open || showLoading) setMessage(errorMessage(error))
    } finally {
      if (showLoading) setLoading(false)
    }
  }

  async function copyUserId(userId: string) {
    try {
      await navigator.clipboard.writeText(userId)
      setMessage('Member ID copied. Paste it into Find member to open the full case file.')
    } catch {
      setMessage(`Member ID: ${userId}`)
    }
  }

  return (
    <>
      <button className={`admin-activity-launcher ${flaggedCount > 0 ? 'has-flags' : ''}`} type="button" onClick={() => { setOpen(true); setMessage(''); void loadActivity() }}>
        <span>Activity</span>
        {flaggedCount > 0 && <strong>{flaggedCount > 99 ? '99+' : flaggedCount}</strong>}
      </button>

      {open && (
        <div className="admin-activity-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}>
          <section className="admin-activity-panel" role="dialog" aria-modal="true" aria-labelledby="activity-title">
            <header className="admin-activity-header">
              <div>
                <p className="eyebrow">Abuse prevention</p>
                <h2 id="activity-title">Member activity.</h2>
                <p>Review unusually high-volume behavior without treating activity signals as proof of misconduct.</p>
              </div>
              <button className="admin-tool-close" type="button" onClick={() => setOpen(false)}>×</button>
            </header>

            <div className="admin-activity-summary">
              <article><strong>{flaggedCount}</strong><span>members with review signals</span></article>
              <article><strong>{rows.length}</strong><span>members active in the last 24h</span></article>
              <article><strong>{rules.filter((rule) => rule.enabled).length}</strong><span>server-side limits active</span></article>
            </div>

            <div className="admin-activity-toolbar">
              <label><input type="checkbox" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} /> Show all recent member activity</label>
              <button className="secondary" type="button" disabled={loading} onClick={() => void loadActivity()}>{loading ? 'Refreshing…' : 'Refresh'}</button>
            </div>

            {message && <p className="status-message admin-activity-status">{message}</p>}

            <div className="admin-activity-layout">
              <section className="admin-activity-list">
                {loading && rows.length === 0 ? (
                  <p className="connection-empty">Loading member activity…</p>
                ) : visibleRows.length === 0 ? (
                  <div className="admin-tool-empty"><span>✓</span><h3>{showAll ? 'No recent activity.' : 'No activity needs review.'}</h3><p>{showAll ? 'Activity will appear here as members use Project PenPal.' : 'No recent member behavior crossed the review-signal thresholds.'}</p></div>
                ) : visibleRows.map((row) => (
                  <button className={`admin-activity-member ${selected?.user_id === row.user_id ? 'selected' : ''}`} key={row.user_id} onClick={() => setSelected(row)}>
                    <div>
                      <strong>{row.display_name || 'Unnamed member'}</strong>
                      <span className={`account-status ${row.account_status}`}>{row.account_status}</span>
                    </div>
                    <span>{row.username ? `@${row.username}` : 'No username'}{row.country ? ` · ${row.country}` : ''}</span>
                    <small>Last active {formatDate(row.last_activity_at)}</small>
                    {Number(row.attention_score) > 0 && <em>Attention score {row.attention_score}</em>}
                  </button>
                ))}
              </section>

              <section className="admin-activity-detail">
                {!selected ? (
                  <div className="admin-tool-empty"><span>↗</span><h3>Select a member.</h3><p>Recent activity counts and review signals will appear here.</p></div>
                ) : (
                  <>
                    <div className="admin-activity-member-heading">
                      <div><h3>{selected.display_name || 'Member'}</h3><p>{selected.username ? `@${selected.username}` : selected.user_id}</p></div>
                      <div><span className={`account-status ${selected.account_status}`}>{selected.account_status}</span><button className="secondary" type="button" onClick={() => void copyUserId(selected.user_id)}>Copy ID for case file</button></div>
                    </div>

                    <div className="admin-activity-not-proof">
                      <strong>Review signal only</strong>
                      <span>High activity can be legitimate. Use the member case file, reports, and correspondence context before taking moderation action.</span>
                    </div>

                    <div className="admin-activity-metrics">
                      <article><span>Requests</span><strong>{selected.requests_1h}</strong><small>1 hour</small><strong>{selected.requests_24h}</strong><small>24 hours</small></article>
                      <article><span>Letters</span><strong>{selected.letters_1h}</strong><small>1 hour</small><strong>{selected.letters_24h}</strong><small>24 hours</small></article>
                      <article><span>Reports</span><strong>{selected.reports_24h}</strong><small>24 hours</small></article>
                      <article><span>Support</span><strong>{selected.support_threads_24h}</strong><small>new threads / 24h</small><strong>{selected.support_messages_1h}</strong><small>messages / 1h</small></article>
                    </div>

                    <section className="admin-activity-signals">
                      <h4>Signals</h4>
                      {selected.signals?.length ? <div>{selected.signals.map((signal) => <span key={signal}>{signal}</span>)}</div> : <p>No current review signals.</p>}
                      {selected.repeated_request_template_count > 1 && <small>Largest repeated introduction pattern: {selected.repeated_request_template_count} different recipients.</small>}
                    </section>

                    <section className="admin-activity-member-meta">
                      <h4>Account context</h4>
                      <span>Joined <strong>{formatDate(selected.joined_at)}</strong></span>
                      <span>Last recorded activity <strong>{formatDate(selected.last_activity_at)}</strong></span>
                      <span>User ID <code>{selected.user_id}</code></span>
                    </section>
                  </>
                )}
              </section>
            </div>

            <section className="admin-rate-limit-section">
              <div><h3>Current server-side limits</h3><p>These are enforced by Supabase even if someone bypasses the normal UI.</p></div>
              <div className="admin-rate-limit-grid">
                {rules.filter((rule) => rule.enabled).map((rule) => (
                  <article key={rule.limit_key}>
                    <strong>{labelForEvent(rule.event_type)}</strong>
                    <span>{rule.max_actions} per {formatWindow(rule.window_minutes)}{rule.scope === 'target' ? ' per member' : ''}</span>
                    {rule.new_account_max_actions && rule.new_account_age_hours ? <small>New accounts: {rule.new_account_max_actions} during the first {rule.new_account_age_hours}h</small> : null}
                  </article>
                ))}
              </div>
            </section>
          </section>
        </div>
      )}
    </>
  )
}

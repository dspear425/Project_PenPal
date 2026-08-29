import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type NoticeType = 'warning' | 'suspension' | 'ban' | 'restored'

type MemberNotice = {
  id: string
  notice_type: NoticeType
  title: string
  message: string
  created_at: string
  acknowledged_at: string | null
}

type Props = {
  userId: string
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return String(error || 'Unknown error')
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function typeLabel(type: NoticeType) {
  switch (type) {
    case 'warning': return 'Warning'
    case 'suspension': return 'Suspension'
    case 'ban': return 'Account action'
    case 'restored': return 'Account restored'
  }
}

export default function MemberNotices({ userId }: Props) {
  const [notices, setNotices] = useState<MemberNotice[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [workingId, setWorkingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [autoOpenedNoticeId, setAutoOpenedNoticeId] = useState<string | null>(null)

  const unread = useMemo(
    () => notices.filter((notice) => notice.acknowledged_at === null),
    [notices],
  )

  useEffect(() => {
    void loadNotices(true)

    const refresh = () => void loadNotices(false)
    window.addEventListener('focus', refresh)
    const timer = window.setInterval(refresh, 60000)

    return () => {
      window.removeEventListener('focus', refresh)
      window.clearInterval(timer)
    }
  }, [userId])

  useEffect(() => {
    const newestUnread = unread[0]
    if (newestUnread && newestUnread.id !== autoOpenedNoticeId) {
      setOpen(true)
      setAutoOpenedNoticeId(newestUnread.id)
    }
  }, [unread, autoOpenedNoticeId])

  async function loadNotices(initial: boolean) {
    if (initial) setLoading(true)
    setMessage('')

    try {
      const { data, error } = await supabase
        .from('member_notices')
        .select('id, notice_type, title, message, created_at, acknowledged_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error
      setNotices((data ?? []) as MemberNotice[])
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      if (initial) setLoading(false)
    }
  }

  async function acknowledge(noticeId: string) {
    setWorkingId(noticeId)
    setMessage('')

    try {
      const { error } = await supabase.rpc('acknowledge_member_notice', { target_notice: noticeId })
      if (error) throw error

      const acknowledgedAt = new Date().toISOString()
      setNotices((previous) => previous.map((notice) =>
        notice.id === noticeId ? { ...notice, acknowledged_at: acknowledgedAt } : notice,
      ))
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setWorkingId(null)
    }
  }

  const visibleNotices = notices

  return (
    <>
      <button
        className={`member-notice-launcher ${unread.length > 0 ? 'has-unread-notices' : ''}`}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={unread.length > 0 ? `Account notices, ${unread.length} unread` : 'Account notices'}
        title="Account notices"
      >
        <span aria-hidden="true">!</span>
        <span className="member-notice-launcher-text">Notices</span>
        {unread.length > 0 && <strong aria-hidden="true">{unread.length > 99 ? '99+' : unread.length}</strong>}
      </button>

      {open && (
        <div className="member-notice-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && workingId === null) setOpen(false)
        }}>
          <section className="member-notice-panel" role="dialog" aria-modal="true" aria-labelledby="member-notice-title">
            <div className="member-notice-panel-header">
              <div>
                <p className="eyebrow">Project PenPal account notices</p>
                <h2 id="member-notice-title">Important information about your account.</h2>
                <p>Moderation notices remain here after you acknowledge them so you can review your account history later.</p>
              </div>
              <button className="member-notice-close" type="button" onClick={() => setOpen(false)} disabled={workingId !== null} aria-label="Close">×</button>
            </div>

            {message && <p className="status-message member-notice-status">{message}</p>}

            {loading ? (
              <p className="member-notice-empty">Loading account notices…</p>
            ) : visibleNotices.length === 0 ? (
              <div className="member-notice-empty">
                <span aria-hidden="true">✓</span>
                <strong>No account notices.</strong>
                <p>There are no moderation notices associated with this account.</p>
              </div>
            ) : (
              <div className="member-notice-list">
                {visibleNotices.map((notice) => {
                  const acknowledged = Boolean(notice.acknowledged_at)
                  return (
                    <article className={`member-notice-card ${notice.notice_type} ${acknowledged ? 'acknowledged' : 'unread'}`} key={notice.id}>
                      <div className="member-notice-card-top">
                        <span className={`member-notice-type ${notice.notice_type}`}>{typeLabel(notice.notice_type)}</span>
                        <time dateTime={notice.created_at}>{formatDate(notice.created_at)}</time>
                      </div>
                      <h3>{notice.title}</h3>
                      <p>{notice.message}</p>
                      <div className="member-notice-card-footer">
                        {acknowledged ? (
                          <span className="member-notice-acknowledged">✓ Acknowledged {notice.acknowledged_at ? formatDate(notice.acknowledged_at) : ''}</span>
                        ) : (
                          <button className="primary" type="button" disabled={workingId === notice.id} onClick={() => void acknowledge(notice.id)}>
                            {workingId === notice.id ? 'Saving…' : 'I understand'}
                          </button>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  )
}

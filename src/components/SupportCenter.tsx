import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type ThreadStatus = 'open' | 'reviewing' | 'resolved'

type SupportThread = {
  id: string
  user_id: string
  category: string
  subject: string
  status: ThreadStatus
  created_at: string
  updated_at: string
  member_last_read_at: string | null
  moderator_last_read_at: string | null
}

type SupportMessage = {
  id: string
  thread_id: string
  sender_id: string
  sender_role: 'member' | 'moderator'
  body: string
  created_at: string
}

type Props = { userId: string }

const categoryLabels: Record<string, string> = {
  account_help: 'Account help',
  safety: 'Safety concern',
  technical: 'Technical problem',
  privacy: 'Privacy question',
  feedback: 'Feedback',
  appeal: 'Moderation appeal',
  other: 'Something else',
  moderator_outreach: 'Message from moderation',
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
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value))
}

export default function SupportCenter({ userId }: Props) {
  const [open, setOpen] = useState(false)
  const [threads, setThreads] = useState<SupportThread[]>([])
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<'list' | 'new' | 'thread'>('list')
  const [category, setCategory] = useState('account_help')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [reply, setReply] = useState('')
  const [loading, setLoading] = useState(false)
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')
  const [unreadByThread, setUnreadByThread] = useState<Map<string, number>>(new Map())
  const [memberCode, setMemberCode] = useState<string | null>(null)
  const [codeCopied, setCodeCopied] = useState(false)

  useEffect(() => {
    void loadThreads()
    void loadMemberCode()
    const onFocus = () => void loadThreads()
    window.addEventListener('focus', onFocus)
    const timer = window.setInterval(() => void loadThreads(), 60000)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.clearInterval(timer)
    }
  }, [userId])

  const unreadTotal = useMemo(
    () => Array.from(unreadByThread.values()).reduce((sum, count) => sum + count, 0),
    [unreadByThread],
  )

  const selectedThread = threads.find((thread) => thread.id === selectedId) ?? null

  async function loadMemberCode() {
    const { data, error } = await supabase.rpc('get_my_identity')
    if (!error && data && typeof data === 'object' && 'member_code' in data) {
      setMemberCode(String((data as { member_code?: unknown }).member_code || '') || null)
    }
  }

  async function copyMemberCode() {
    if (!memberCode) return
    try {
      await navigator.clipboard.writeText(memberCode)
      setCodeCopied(true)
      window.setTimeout(() => setCodeCopied(false), 1400)
    } catch {
      setMessage(`Your member code is ${memberCode}.`)
    }
  }

  async function loadThreads() {
    try {
      const { data, error } = await supabase
        .from('support_threads')
        .select('id, user_id, category, subject, status, created_at, updated_at, member_last_read_at, moderator_last_read_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })

      if (error) throw error
      const rows = (data ?? []) as SupportThread[]
      setThreads(rows)

      if (!rows.length) {
        setUnreadByThread(new Map())
        return
      }

      const { data: moderatorMessages, error: messageError } = await supabase
        .from('support_messages')
        .select('thread_id, created_at, sender_role')
        .in('thread_id', rows.map((thread) => thread.id))
        .eq('sender_role', 'moderator')

      if (messageError) throw messageError
      const next = new Map<string, number>()
      for (const row of moderatorMessages ?? []) {
        const thread = rows.find((item) => item.id === String(row.thread_id))
        if (!thread) continue
        const lastRead = thread.member_last_read_at ? new Date(thread.member_last_read_at).getTime() : 0
        if (new Date(String(row.created_at)).getTime() > lastRead) {
          const id = String(row.thread_id)
          next.set(id, (next.get(id) ?? 0) + 1)
        }
      }
      setUnreadByThread(next)
    } catch (error) {
      if (open) setMessage(errorMessage(error))
    }
  }

  async function openThread(thread: SupportThread) {
    setSelectedId(thread.id)
    setView('thread')
    setMessage('')
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('support_messages')
        .select('id, thread_id, sender_id, sender_role, body, created_at')
        .eq('thread_id', thread.id)
        .order('created_at', { ascending: true })
      if (error) throw error
      setMessages((data ?? []) as SupportMessage[])
      await supabase.rpc('mark_support_thread_read', { target_thread: thread.id })
      await loadThreads()
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  async function createThread(event: React.FormEvent) {
    event.preventDefault()
    setWorking(true)
    setMessage('')
    try {
      const { data, error } = await supabase.rpc('create_support_thread', {
        ticket_category: category,
        ticket_subject: subject,
        first_message: body,
      })
      if (error) throw error
      setSubject('')
      setBody('')
      await loadThreads()
      const id = String(data)
      const { data: threadRow } = await supabase
        .from('support_threads')
        .select('id, user_id, category, subject, status, created_at, updated_at, member_last_read_at, moderator_last_read_at')
        .eq('id', id)
        .single()
      if (threadRow) await openThread(threadRow as SupportThread)
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setWorking(false)
    }
  }

  async function sendReply(event: React.FormEvent) {
    event.preventDefault()
    if (!selectedThread || !reply.trim()) return
    setWorking(true)
    setMessage('')
    try {
      const { error } = await supabase.rpc('reply_support_thread', {
        target_thread: selectedThread.id,
        message_body: reply,
      })
      if (error) throw error
      setReply('')
      await loadThreads()
      await openThread({ ...selectedThread, status: selectedThread.status === 'resolved' ? 'open' : selectedThread.status })
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setWorking(false)
    }
  }

  function show() {
    setOpen(true)
    setView('list')
    setSelectedId(null)
    setMessage('')
    void loadThreads()
    void loadMemberCode()
  }

  return (
    <>
      <button className={`support-launcher ${unreadTotal > 0 ? 'has-unread-support' : ''}`} type="button" onClick={show}>
        <span aria-hidden="true">?</span><span className="support-launcher-text">Help</span>
        {unreadTotal > 0 && <strong aria-label={`${unreadTotal} unread moderator replies`}>{unreadTotal > 99 ? '99+' : unreadTotal}</strong>}
      </button>

      {open && (
        <div className="support-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !working) setOpen(false) }}>
          <section className="support-panel" role="dialog" aria-modal="true" aria-labelledby="support-title">
            <div className="support-header">
              <div>
                <p className="eyebrow">Help & support</p>
                <h2 id="support-title">Contact Project PenPal.</h2>
                <p>Reach the moderation team without reporting another member.</p>
              </div>
              <button className="support-close" type="button" onClick={() => setOpen(false)} disabled={working}>×</button>
            </div>

            {message && <p className="status-message support-status">{message}</p>}

            {view === 'list' && (
              <>
                {memberCode && (
                  <div className="support-member-code">
                    <div><span>Your member code</span><strong>{memberCode}</strong><small>Support may ask for this code to locate your account quickly.</small></div>
                    <button className="secondary" type="button" onClick={() => void copyMemberCode()}>{codeCopied ? 'Copied!' : 'Copy code'}</button>
                  </div>
                )}
                <div className="support-toolbar">
                  <button className="primary" type="button" onClick={() => { setView('new'); setMessage('') }}>New message</button>
                  <button className="secondary" type="button" onClick={() => void loadThreads()}>Refresh</button>
                </div>
                <div className="support-thread-list">
                  {threads.length === 0 ? (
                    <div className="support-empty"><span>✉</span><h3>No support conversations yet.</h3><p>Use New message whenever you need help from the Project PenPal team.</p></div>
                  ) : threads.map((thread) => {
                    const unread = unreadByThread.get(thread.id) ?? 0
                    return (
                      <button className={`support-thread-card ${unread ? 'unread' : ''}`} key={thread.id} onClick={() => void openThread(thread)}>
                        <div><span className={`support-status-pill ${thread.status}`}>{thread.status}</span><time>{formatDate(thread.updated_at)}</time></div>
                        <strong>{thread.subject}</strong>
                        <small>{categoryLabels[thread.category] || thread.category}</small>
                        {unread > 0 && <em>{unread} new {unread === 1 ? 'reply' : 'replies'}</em>}
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {view === 'new' && (
              <form className="support-form" onSubmit={createThread}>
                <button className="back" type="button" onClick={() => setView('list')}>← Support conversations</button>
                <label>What do you need help with?
                  <select value={category} onChange={(event) => setCategory(event.target.value)}>
                    {Object.entries(categoryLabels)
                      .filter(([value]) => value !== 'moderator_outreach')
                      .map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label>Subject
                  <input maxLength={120} minLength={3} required value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Briefly describe what you need help with" />
                </label>
                <label>Message <span className="optional">{body.length}/6000</span>
                  <textarea rows={9} maxLength={6000} required value={body} onChange={(event) => setBody(event.target.value)} placeholder="Tell the moderation team what happened or what you need help with." />
                </label>
                <div className="support-actions"><button className="primary" disabled={working}>{working ? 'Sending…' : 'Send to moderators'}</button><button className="secondary" type="button" onClick={() => setView('list')} disabled={working}>Cancel</button></div>
              </form>
            )}

            {view === 'thread' && selectedThread && (
              <div className="support-conversation">
                <button className="back" type="button" onClick={() => { setView('list'); setSelectedId(null) }}>← Support conversations</button>
                <div className="support-conversation-heading">
                  <div><span className={`support-status-pill ${selectedThread.status}`}>{selectedThread.status}</span><h3>{selectedThread.subject}</h3><small>{categoryLabels[selectedThread.category] || selectedThread.category}</small></div>
                </div>
                {loading ? <p className="connection-empty">Loading messages…</p> : (
                  <div className="support-message-list">
                    {messages.map((item) => (
                      <article className={`support-message ${item.sender_role}`} key={item.id}>
                        <div><strong>{item.sender_role === 'member' ? 'You' : 'Project PenPal moderator'}</strong><time>{formatDate(item.created_at)}</time></div>
                        <p>{item.body}</p>
                      </article>
                    ))}
                  </div>
                )}
                <form className="support-reply-form" onSubmit={sendReply}>
                  <label>Reply <span className="optional">{reply.length}/6000</span>
                    <textarea rows={5} maxLength={6000} required value={reply} onChange={(event) => setReply(event.target.value)} placeholder={selectedThread.status === 'resolved' ? 'Replying will reopen this conversation.' : 'Write a reply…'} />
                  </label>
                  <button className="primary" disabled={working || !reply.trim()}>{working ? 'Sending…' : selectedThread.status === 'resolved' ? 'Reply & reopen' : 'Send reply'}</button>
                </form>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  )
}

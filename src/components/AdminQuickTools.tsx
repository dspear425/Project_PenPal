import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type SearchResult = {
  user_id: string
  display_name: string | null
  email: string | null
  country: string | null
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

type SupportThread = {
  id: string
  user_id: string
  category: string
  subject: string
  status: 'open' | 'reviewing' | 'resolved'
  assigned_to: string | null
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

type ProfileLite = { id: string; display_name: string | null; country: string | null }

type Props = { userId: string }

const categoryLabels: Record<string, string> = {
  account_help: 'Account help', safety: 'Safety concern', technical: 'Technical problem', privacy: 'Privacy question',
  feedback: 'Feedback', appeal: 'Moderation appeal', other: 'Other',
}

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
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

export default function AdminQuickTools({ userId }: Props) {
  const [tool, setTool] = useState<'search' | 'support' | null>(null)
  const [message, setMessage] = useState('')
  const [working, setWorking] = useState(false)

  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [selectedUser, setSelectedUser] = useState<SearchResult | null>(null)
  const [userContext, setUserContext] = useState<UserContext | null>(null)

  const [threads, setThreads] = useState<SupportThread[]>([])
  const [profiles, setProfiles] = useState<Map<string, ProfileLite>>(new Map())
  const [supportMessages, setSupportMessages] = useState<SupportMessage[]>([])
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [supportReply, setSupportReply] = useState('')
  const [threadFilter, setThreadFilter] = useState<'all' | 'open' | 'reviewing' | 'resolved'>('open')
  const [unreadByThread, setUnreadByThread] = useState<Map<string, number>>(new Map())

  useEffect(() => {
    void loadSupportThreads()
    const timer = window.setInterval(() => void loadSupportThreads(), 60000)
    return () => window.clearInterval(timer)
  }, [userId])

  const unreadSupport = useMemo(() => Array.from(unreadByThread.values()).reduce((a, b) => a + b, 0), [unreadByThread])
  const filteredThreads = useMemo(() => threadFilter === 'all' ? threads : threads.filter((thread) => thread.status === threadFilter), [threads, threadFilter])
  const selectedThread = threads.find((thread) => thread.id === selectedThreadId) ?? null

  async function searchUsers(event: React.FormEvent) {
    event.preventDefault()
    if (query.trim().length < 2) { setMessage('Enter at least 2 characters to search.'); return }
    setWorking(true); setMessage(''); setSelectedUser(null); setUserContext(null)
    try {
      const { data, error } = await supabase.rpc('moderator_search_users', { search_term: query })
      if (error) throw error
      setSearchResults((data ?? []) as SearchResult[])
    } catch (error) { setMessage(errorMessage(error)) } finally { setWorking(false) }
  }

  async function openUser(result: SearchResult) {
    setSelectedUser(result); setWorking(true); setMessage('')
    try {
      const { data, error } = await supabase.rpc('moderator_user_context', { target_user: result.user_id })
      if (error) throw error
      setUserContext((data ?? null) as UserContext | null)
    } catch (error) { setMessage(errorMessage(error)) } finally { setWorking(false) }
  }

  async function loadSupportThreads() {
    try {
      const { data, error } = await supabase
        .from('support_threads')
        .select('id, user_id, category, subject, status, assigned_to, created_at, updated_at, member_last_read_at, moderator_last_read_at')
        .order('updated_at', { ascending: false })
      if (error) throw error
      const rows = (data ?? []) as SupportThread[]
      setThreads(rows)

      const ids = Array.from(new Set(rows.map((row) => row.user_id)))
      if (ids.length) {
        const { data: profileRows } = await supabase.from('profiles').select('id, display_name, country').in('id', ids)
        const map = new Map<string, ProfileLite>()
        for (const row of profileRows ?? []) map.set(String(row.id), row as ProfileLite)
        setProfiles(map)
      } else setProfiles(new Map())

      if (!rows.length) { setUnreadByThread(new Map()); return }
      const { data: memberMessages, error: messageError } = await supabase
        .from('support_messages')
        .select('thread_id, created_at, sender_role')
        .in('thread_id', rows.map((row) => row.id))
        .eq('sender_role', 'member')
      if (messageError) throw messageError
      const next = new Map<string, number>()
      for (const row of memberMessages ?? []) {
        const thread = rows.find((item) => item.id === String(row.thread_id))
        if (!thread) continue
        const lastRead = thread.moderator_last_read_at ? new Date(thread.moderator_last_read_at).getTime() : 0
        if (new Date(String(row.created_at)).getTime() > lastRead) {
          const id = String(row.thread_id); next.set(id, (next.get(id) ?? 0) + 1)
        }
      }
      setUnreadByThread(next)
    } catch (error) { if (tool === 'support') setMessage(errorMessage(error)) }
  }

  async function openSupportThread(thread: SupportThread) {
    setSelectedThreadId(thread.id); setWorking(true); setMessage('')
    try {
      const { data, error } = await supabase.from('support_messages').select('id, thread_id, sender_id, sender_role, body, created_at').eq('thread_id', thread.id).order('created_at')
      if (error) throw error
      setSupportMessages((data ?? []) as SupportMessage[])
      await supabase.rpc('mark_support_thread_read', { target_thread: thread.id })
      await loadSupportThreads()
    } catch (error) { setMessage(errorMessage(error)) } finally { setWorking(false) }
  }

  async function sendSupportReply(event: React.FormEvent) {
    event.preventDefault(); if (!selectedThread || !supportReply.trim()) return
    setWorking(true); setMessage('')
    try {
      const { error } = await supabase.rpc('reply_support_thread', { target_thread: selectedThread.id, message_body: supportReply })
      if (error) throw error
      setSupportReply(''); await loadSupportThreads(); await openSupportThread(selectedThread)
    } catch (error) { setMessage(errorMessage(error)) } finally { setWorking(false) }
  }

  async function setSupportStatus(status: 'open' | 'reviewing' | 'resolved') {
    if (!selectedThread) return
    setWorking(true); setMessage('')
    try {
      const { error } = await supabase.rpc('moderator_set_support_status', { target_thread: selectedThread.id, new_status: status })
      if (error) throw error
      await loadSupportThreads()
      setMessage(`Support conversation marked ${status}.`)
    } catch (error) { setMessage(errorMessage(error)) } finally { setWorking(false) }
  }

  function close() { setTool(null); setMessage(''); setSelectedThreadId(null); setSelectedUser(null); setUserContext(null) }

  return (
    <>
      <div className="admin-quick-launchers">
        <button type="button" onClick={() => { setTool('support'); setMessage(''); void loadSupportThreads() }}>
          Member messages {unreadSupport > 0 && <strong>{unreadSupport > 99 ? '99+' : unreadSupport}</strong>}
        </button>
        <button type="button" onClick={() => { setTool('search'); setMessage('') }}>Find user</button>
      </div>

      {tool && (
        <div className="admin-tool-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !working) close() }}>
          <section className="admin-tool-panel" role="dialog" aria-modal="true">
            <header><div><p className="eyebrow">Moderator tools</p><h2>{tool === 'search' ? 'Find a member.' : 'Member messages.'}</h2></div><button className="admin-tool-close" onClick={close}>×</button></header>
            {message && <p className="status-message admin-tool-status">{message}</p>}

            {tool === 'search' && (
              <div className="admin-user-search">
                <form className="admin-search-form" onSubmit={searchUsers}>
                  <label>Search by display name, email address, or user ID<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Alex, alex@example.com, or account UUID" /></label>
                  <button className="primary" disabled={working}>{working ? 'Searching…' : 'Search users'}</button>
                </form>
                <div className="admin-search-layout">
                  <div className="admin-search-results">
                    {searchResults.map((result) => (
                      <button key={result.user_id} className={`admin-user-result ${selectedUser?.user_id === result.user_id ? 'selected' : ''}`} onClick={() => void openUser(result)}>
                        <div><strong>{result.display_name || 'Unnamed member'}</strong><span className={`account-status ${result.account_status}`}>{result.account_status}</span></div>
                        <span>{result.email || 'No email'}{result.country ? ` · ${result.country}` : ''}</span>
                        <small>{result.report_count} reports · {result.moderation_action_count} moderation actions</small>
                      </button>
                    ))}
                    {!working && query.trim().length >= 2 && searchResults.length === 0 && <p className="connection-empty">No matching members.</p>}
                  </div>
                  <div className="admin-user-context">
                    {!selectedUser ? <div className="admin-tool-empty"><span>⌕</span><h3>Select a member.</h3><p>Their account and moderation history will appear here.</p></div> : working && !userContext ? <p className="connection-empty">Loading member…</p> : userContext && (
                      <>
                        <div className="admin-user-heading"><div><h3>{String(userContext.profile.display_name || selectedUser.display_name || 'Member')}</h3><p>{String(userContext.profile.email || selectedUser.email || '')}</p></div><span className={`account-status ${String(userContext.profile.account_status || 'active')}`}>{String(userContext.profile.account_status || 'active')}</span></div>
                        <div className="admin-user-facts"><span>User ID <code>{selectedUser.user_id}</code></span><span>Country <strong>{String(userContext.profile.country || 'Not listed')}</strong></span><span>Joined <strong>{formatDate(String(userContext.profile.created_at || selectedUser.joined_at))}</strong></span></div>
                        <section><h4>Reports involving this member</h4><p>{userContext.reports.length} report{userContext.reports.length === 1 ? '' : 's'} as the reported member.</p></section>
                        <section><h4>Moderation history</h4>{userContext.actions.length === 0 ? <p>No moderation actions.</p> : <div className="admin-mini-history">{userContext.actions.slice(0, 10).map((item) => <article key={String(item.id)}><strong>{String(item.action_type)}</strong><time>{formatDate(String(item.created_at))}</time>{item.reason ? <p>{String(item.reason)}</p> : null}</article>)}</div>}</section>
                        <section><h4>Support conversations</h4><p>{userContext.support_threads.length} support conversation{userContext.support_threads.length === 1 ? '' : 's'}.</p></section>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {tool === 'support' && (
              <div className="admin-support-inbox">
                <div className="admin-filter-row admin-support-filters">
                  {(['open', 'reviewing', 'resolved', 'all'] as const).map((value) => <button key={value} className={`admin-filter ${threadFilter === value ? 'selected' : ''}`} onClick={() => setThreadFilter(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}
                  <button className="secondary" onClick={() => void loadSupportThreads()}>Refresh</button>
                </div>
                <div className="admin-support-layout">
                  <div className="admin-support-list">
                    {filteredThreads.length === 0 ? <div className="admin-tool-empty"><span>✓</span><h3>No messages here.</h3></div> : filteredThreads.map((thread) => {
                      const member = profiles.get(thread.user_id); const unread = unreadByThread.get(thread.id) ?? 0
                      return <button key={thread.id} className={`admin-support-card ${selectedThreadId === thread.id ? 'selected' : ''} ${unread ? 'unread' : ''}`} onClick={() => void openSupportThread(thread)}><div><span className={`support-status-pill ${thread.status}`}>{thread.status}</span><time>{formatDate(thread.updated_at)}</time></div><strong>{thread.subject}</strong><span>{member?.display_name || 'Member'}{member?.country ? ` · ${member.country}` : ''}</span><small>{categoryLabels[thread.category] || thread.category}</small>{unread > 0 && <em>{unread} new</em>}</button>
                    })}
                  </div>
                  <div className="admin-support-conversation">
                    {!selectedThread ? <div className="admin-tool-empty"><span>✉</span><h3>Select a conversation.</h3><p>Messages and reply controls will appear here.</p></div> : (
                      <>
                        <div className="admin-support-heading"><div><span className={`support-status-pill ${selectedThread.status}`}>{selectedThread.status}</span><h3>{selectedThread.subject}</h3><p>{profiles.get(selectedThread.user_id)?.display_name || 'Member'} · {categoryLabels[selectedThread.category] || selectedThread.category}</p></div></div>
                        <div className="admin-support-messages">{supportMessages.map((item) => <article className={item.sender_role} key={item.id}><div><strong>{item.sender_role === 'moderator' ? 'Moderator' : profiles.get(selectedThread.user_id)?.display_name || 'Member'}</strong><time>{formatDate(item.created_at)}</time></div><p>{item.body}</p></article>)}</div>
                        <form className="admin-support-reply" onSubmit={sendSupportReply}><label>Reply<textarea rows={5} maxLength={6000} value={supportReply} onChange={(event) => setSupportReply(event.target.value)} placeholder="Write a reply to the member…" /></label><div><button className="primary" disabled={working || !supportReply.trim()}>{working ? 'Sending…' : 'Send reply'}</button><button className="secondary" type="button" disabled={working} onClick={() => void setSupportStatus('reviewing')}>Mark reviewing</button><button className="secondary" type="button" disabled={working} onClick={() => void setSupportStatus('resolved')}>Resolve</button></div></form>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  )
}

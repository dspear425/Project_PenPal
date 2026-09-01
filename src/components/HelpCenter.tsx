import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  articlesForContext,
  helpArticles,
  helpCategoryLabels,
  helpContextLabel,
  searchHelpArticles,
  type HelpArticle,
  type HelpContext,
} from '../lib/helpContent'

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

type HelpView = 'home' | 'article' | 'conversations' | 'new' | 'thread'

type Props = {
  userId: string
  initialContext?: HelpContext
}

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

function ArticleCard({ article, onOpen }: { article: HelpArticle; onOpen: (article: HelpArticle) => void }) {
  return (
    <button className="help-article-card" type="button" onClick={() => onOpen(article)}>
      <span>{helpCategoryLabels[article.category] || article.category}</span>
      <strong>{article.title}</strong>
      <p>{article.summary}</p>
      <em>Read article →</em>
    </button>
  )
}

export default function HelpCenter({ userId, initialContext = 'dashboard' }: Props) {
  const [open, setOpen] = useState(false)
  const [context, setContext] = useState<HelpContext>(initialContext)
  const [view, setView] = useState<HelpView>('home')
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [selectedArticle, setSelectedArticle] = useState<HelpArticle | null>(null)

  const [threads, setThreads] = useState<SupportThread[]>([])
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
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
    const onContext = (event: Event) => {
      const detail = (event as CustomEvent<{ context?: HelpContext }>).detail
      if (detail?.context) setContext(detail.context)
    }
    const onOpenHelp = (event: Event) => {
      const detail = (event as CustomEvent<{ articleId?: string; context?: HelpContext }>).detail
      if (detail?.context) setContext(detail.context)
      setOpen(true)
      setMessage('')
      setQuery('')
      setCategoryFilter(null)
      const article = detail?.articleId ? helpArticles.find((item) => item.id === detail.articleId) ?? null : null
      if (article) {
        setSelectedArticle(article)
        setView('article')
      } else {
        setSelectedArticle(null)
        setView('home')
      }
    }

    window.addEventListener('focus', onFocus)
    window.addEventListener('project-penpal:help-context', onContext)
    window.addEventListener('project-penpal:open-help', onOpenHelp)
    const timer = window.setInterval(() => void loadThreads(), 60000)

    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('project-penpal:help-context', onContext)
      window.removeEventListener('project-penpal:open-help', onOpenHelp)
      window.clearInterval(timer)
    }
  }, [userId])

  useEffect(() => {
    setContext(initialContext)
  }, [initialContext])

  const unreadTotal = useMemo(
    () => Array.from(unreadByThread.values()).reduce((sum, count) => sum + count, 0),
    [unreadByThread],
  )

  const selectedThread = threads.find((thread) => thread.id === selectedId) ?? null

  const contextualArticles = useMemo(() => {
    const matches = articlesForContext(context)
    return matches.slice(0, 6)
  }, [context])

  const searchResults = useMemo(() => {
    let results = query.trim() ? searchHelpArticles(query) : helpArticles
    if (categoryFilter) results = results.filter((article) => article.category === categoryFilter)
    return results
  }, [query, categoryFilter])

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const article of helpArticles) counts.set(article.category, (counts.get(article.category) ?? 0) + 1)
    return counts
  }, [])

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
    setView('home')
    setSelectedArticle(null)
    setSelectedId(null)
    setQuery('')
    setCategoryFilter(null)
    setMessage('')
    void loadThreads()
    void loadMemberCode()
  }

  function openArticle(article: HelpArticle) {
    setSelectedArticle(article)
    setView('article')
    setMessage('')
  }

  function openSupportNew(options?: { category?: string; subject?: string; body?: string }) {
    setCategory(options?.category ?? (context === 'restricted' ? 'appeal' : 'account_help'))
    setSubject(options?.subject ?? '')
    setBody(options?.body ?? '')
    setView('new')
    setMessage('')
  }

  function reportBug() {
    const screen = helpContextLabel(context)
    openSupportNew({
      category: 'technical',
      subject: `Bug report: ${screen}`,
      body: `I found a problem while using ${screen}.\n\nWhat I was trying to do:\n\nWhat I expected to happen:\n\nWhat actually happened:\n\nError text (if any):\n\n---\nApp context: ${screen}\nPage: ${window.location.pathname}${window.location.hash || ''}\nPlease do not include passwords, authentication tokens, or another member's private mailing address.`,
    })
  }

  function backToHelp() {
    setView('home')
    setSelectedArticle(null)
    setSelectedId(null)
    setMessage('')
  }

  return (
    <>
      <button className={`support-launcher ${unreadTotal > 0 ? 'has-unread-support' : ''}`} type="button" onClick={show}>
        <span aria-hidden="true">?</span><span className="support-launcher-text">Help</span>
        {unreadTotal > 0 && <strong aria-label={`${unreadTotal} unread moderator replies`}>{unreadTotal > 99 ? '99+' : unreadTotal}</strong>}
      </button>

      {open && (
        <div className="support-overlay help-center-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !working) setOpen(false) }}>
          <section className="support-panel help-center-panel" role="dialog" aria-modal="true" aria-labelledby="help-center-title">
            <div className="support-header help-center-header">
              <div>
                <p className="eyebrow">Help Center</p>
                <h2 id="help-center-title">How can we help?</h2>
                <p>Answers for Project PenPal, with help for <strong>{helpContextLabel(context)}</strong> shown first.</p>
              </div>
              <button className="support-close" type="button" onClick={() => setOpen(false)} disabled={working}>×</button>
            </div>

            {message && <p className="status-message support-status">{message}</p>}

            {view === 'home' && (
              <div className="help-home">
                <div className="help-search-wrap">
                  <span aria-hidden="true">⌕</span>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search help — try “snail mail”, “photo”, “block”, or “draft”"
                    aria-label="Search Help Center"
                    autoFocus
                  />
                  {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search">×</button>}
                </div>

                {!query.trim() && !categoryFilter && (
                  <>
                    <section className="help-section">
                      <div className="help-section-heading"><div><span>Suggested here</span><h3>Help for {helpContextLabel(context)}</h3></div></div>
                      <div className="help-article-grid">
                        {contextualArticles.map((article) => <ArticleCard key={article.id} article={article} onOpen={openArticle} />)}
                      </div>
                    </section>

                    <section className="help-section">
                      <div className="help-section-heading"><div><span>Browse</span><h3>Help topics</h3></div></div>
                      <div className="help-category-grid">
                        {Object.entries(helpCategoryLabels).map(([value, label]) => (
                          <button key={value} type="button" onClick={() => setCategoryFilter(value)}>
                            <strong>{label}</strong>
                            <span>{categoryCounts.get(value) ?? 0} {categoryCounts.get(value) === 1 ? 'article' : 'articles'}</span>
                          </button>
                        ))}
                      </div>
                    </section>
                  </>
                )}

                {(query.trim() || categoryFilter) && (
                  <section className="help-section help-results-section">
                    <div className="help-results-heading">
                      <div>
                        <span>{query.trim() ? 'Search results' : 'Help topic'}</span>
                        <h3>{query.trim() ? `Results for “${query.trim()}”` : helpCategoryLabels[categoryFilter || '']}</h3>
                      </div>
                      {categoryFilter && <button className="secondary" type="button" onClick={() => setCategoryFilter(null)}>All topics</button>}
                    </div>
                    {searchResults.length ? (
                      <div className="help-article-grid">
                        {searchResults.map((article) => <ArticleCard key={article.id} article={article} onOpen={openArticle} />)}
                      </div>
                    ) : (
                      <div className="help-no-results">
                        <span aria-hidden="true">?</span>
                        <h3>No article matched that search.</h3>
                        <p>Try fewer words, browse the topics, or contact Project PenPal support.</p>
                      </div>
                    )}
                  </section>
                )}

                <section className="help-contact-card">
                  <div><span>Still need help?</span><h3>Talk to the Project PenPal team.</h3><p>Start a private support conversation, review an existing conversation, or send a technical bug report with the current screen included automatically.</p></div>
                  <div className="help-contact-actions">
                    <button className="primary" type="button" onClick={() => openSupportNew()}>Contact support</button>
                    <button className="secondary" type="button" onClick={() => { setView('conversations'); setMessage(''); void loadThreads() }}>My conversations{unreadTotal ? ` (${unreadTotal} new)` : ''}</button>
                    <button className="secondary" type="button" onClick={reportBug}>Report a bug</button>
                  </div>
                </section>
              </div>
            )}

            {view === 'article' && selectedArticle && (
              <article className="help-article-view">
                <button className="back" type="button" onClick={backToHelp}>← Help Center</button>
                <div className="help-article-heading">
                  <span>{helpCategoryLabels[selectedArticle.category] || selectedArticle.category}</span>
                  <h3>{selectedArticle.title}</h3>
                  <p>{selectedArticle.summary}</p>
                </div>
                <div className="help-article-content">
                  {selectedArticle.sections.map((section, index) => (
                    <section key={`${selectedArticle.id}-${index}`}>
                      {section.heading && <h4>{section.heading}</h4>}
                      {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                      {section.bullets && <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>}
                      {section.note && <div className="help-article-note"><strong>Good to know</strong><p>{section.note}</p></div>}
                    </section>
                  ))}
                </div>
                <div className="help-article-footer">
                  <div><strong>Didn’t answer your question?</strong><span>Send the team a private support message.</span></div>
                  <div><button className="primary" type="button" onClick={() => openSupportNew()}>Contact support</button><button className="secondary" type="button" onClick={reportBug}>Report a bug</button></div>
                </div>
              </article>
            )}

            {view === 'conversations' && (
              <div className="help-support-view">
                <button className="back" type="button" onClick={backToHelp}>← Help Center</button>
                <div className="help-support-title"><span>Private support</span><h3>Your support conversations</h3><p>Messages here are between your account and authorized Project PenPal staff.</p></div>
                {memberCode && (
                  <div className="support-member-code">
                    <div><span>Your member code</span><strong>{memberCode}</strong><small>Support may ask for this code to locate your account quickly.</small></div>
                    <button className="secondary" type="button" onClick={() => void copyMemberCode()}>{codeCopied ? 'Copied!' : 'Copy code'}</button>
                  </div>
                )}
                <div className="support-toolbar">
                  <button className="primary" type="button" onClick={() => openSupportNew()}>New message</button>
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
              </div>
            )}

            {view === 'new' && (
              <form className="support-form help-support-view" onSubmit={createThread}>
                <button className="back" type="button" onClick={() => setView('conversations')}>← Support conversations</button>
                <div className="help-support-title"><span>Private support</span><h3>Contact Project PenPal</h3><p>If this is a safety issue involving another member, you can also use that member’s Safety controls to create a moderation report.</p></div>
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
                  <textarea rows={10} maxLength={6000} required value={body} onChange={(event) => setBody(event.target.value)} placeholder="Tell the Project PenPal team what happened or what you need help with." />
                </label>
                <div className="support-actions"><button className="primary" disabled={working}>{working ? 'Sending…' : 'Send to support'}</button><button className="secondary" type="button" onClick={() => setView('conversations')} disabled={working}>Cancel</button></div>
              </form>
            )}

            {view === 'thread' && selectedThread && (
              <div className="support-conversation help-support-view">
                <button className="back" type="button" onClick={() => { setView('conversations'); setSelectedId(null) }}>← Support conversations</button>
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

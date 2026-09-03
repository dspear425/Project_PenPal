import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'

type FeedbackKind = 'general' | 'bug' | 'idea'

type MembershipRow = {
  is_beta_member: boolean
  invite_label: string | null
  redeemed_at: string | null
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const value = (error as { message?: unknown }).message
    if (typeof value === 'string') return value
  }
  return String(error || 'Unknown error')
}

function kindLabel(kind: FeedbackKind) {
  if (kind === 'bug') return 'Bug or problem'
  if (kind === 'idea') return 'Idea or suggestion'
  return 'General feedback'
}

export default function BetaFeedbackShortcut() {
  const [eligible, setEligible] = useState(false)
  const [target, setTarget] = useState<Element | null>(null)
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<FeedbackKind>('general')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true

    async function refreshEligibility() {
      const { data: sessionData } = await supabase.auth.getSession()
      if (!active) return
      if (!sessionData.session) {
        setEligible(false)
        setOpen(false)
        return
      }

      const { data, error } = await supabase.rpc('get_my_beta_membership')
      if (!active) return
      if (error) {
        setEligible(false)
        return
      }
      const row = (Array.isArray(data) ? data[0] : data) as MembershipRow | null
      setEligible(Boolean(row?.is_beta_member))
    }

    const refreshTarget = () => setTarget(document.querySelector('.dashboard-actions'))
    void refreshEligibility()
    refreshTarget()

    const { data: listener } = supabase.auth.onAuthStateChange(() => void refreshEligibility())
    const observer = new MutationObserver(refreshTarget)
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      active = false
      listener.subscription.unsubscribe()
      observer.disconnect()
    }
  }, [])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!body.trim()) return

    setWorking(true)
    setMessage('')
    try {
      const cleanSubject = subject.trim()
      const ticketSubject = (`Beta feedback: ${kindLabel(kind)}${cleanSubject ? ` — ${cleanSubject}` : ''}`).slice(0, 120)
      const context = `${window.location.pathname}${window.location.hash || ''}`
      const firstMessage = [
        `Feedback type: ${kindLabel(kind)}`,
        '',
        body.trim(),
        '',
        '---',
        `App context: ${context}`,
        `Viewport: ${window.innerWidth} × ${window.innerHeight}`,
        'Please do not include passwords, authentication tokens, or private mailing addresses in beta feedback.',
      ].join('\n')

      const { error } = await supabase.rpc('create_support_thread', {
        ticket_category: 'feedback',
        ticket_subject: ticketSubject,
        first_message: firstMessage,
      })
      if (error) throw error

      setSubject('')
      setBody('')
      setKind('general')
      setMessage('Thanks — your beta feedback was sent privately to the Project PenPal team. You can review replies later in Help → My conversations.')
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setWorking(false)
    }
  }

  if (!eligible || !target) return null

  const launcher = (
    <button className="secondary beta-feedback-dashboard-button" type="button" onClick={() => { setOpen(true); setMessage('') }}>
      Beta feedback
    </button>
  )

  return (
    <>
      {createPortal(launcher, target)}
      {open && createPortal(
        <div className="beta-feedback-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !working) setOpen(false) }}>
          <section className="beta-feedback-panel" role="dialog" aria-modal="true" aria-labelledby="beta-feedback-title">
            <header>
              <div><p className="eyebrow">Closed beta</p><h2 id="beta-feedback-title">Tell us what you notice.</h2><p>Report a rough edge, share an idea, or tell us what is working well. Feedback is private between your account and Project PenPal staff.</p></div>
              <button className="support-close" type="button" onClick={() => setOpen(false)} disabled={working}>×</button>
            </header>

            {message && <p className="status-message beta-feedback-status">{message}</p>}

            <form onSubmit={submit} className="beta-feedback-form">
              <label>Feedback type
                <select value={kind} onChange={(event) => setKind(event.target.value as FeedbackKind)}>
                  <option value="general">General feedback</option>
                  <option value="bug">Bug or problem</option>
                  <option value="idea">Idea or suggestion</option>
                </select>
              </label>
              <label>Short subject <span className="optional">optional</span>
                <input maxLength={80} value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="What is this about?" />
              </label>
              <label>Your feedback <span className="optional">{body.length}/5000</span>
                <textarea rows={9} maxLength={5000} required value={body} onChange={(event) => setBody(event.target.value)} placeholder="What happened? What did you expect? What would make the experience better?" />
              </label>
              <div className="beta-feedback-actions"><button className="primary" disabled={working || !body.trim()}>{working ? 'Sending…' : 'Send beta feedback'}</button><button className="secondary" type="button" onClick={() => setOpen(false)} disabled={working}>Close</button></div>
            </form>
          </section>
        </div>,
        document.body,
      )}
    </>
  )
}

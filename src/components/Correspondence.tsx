import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type Letter = {
  id: string
  relationship_id: string
  sender_id: string
  recipient_id: string
  subject: string | null
  body: string
  created_at: string
  read_at: string | null
}

type RelationshipPeriod = {
  id: string
  status: 'accepted' | 'paused' | 'ended'
  created_at: string
  responded_at: string | null
  ended_at: string | null
}

type Props = {
  userId: string
  relationshipId: string
  relationshipStatus: 'accepted' | 'paused' | 'ended'
  otherUserId: string
  otherName: string
  otherCountry?: string | null
  onBack: () => void
  onSafety: () => void
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

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

function draftKey(userId: string, relationshipId: string) {
  return `project-penpal:letter-draft:${userId}:${relationshipId}`
}

function LetterCard({ letter, userId, otherName }: { letter: Letter; userId: string; otherName: string }) {
  const mine = letter.sender_id === userId

  return (
    <article className={`letter-paper ${mine ? 'sent-letter' : 'received-letter'}`}>
      <div className="letter-meta">
        <span>{mine ? 'You wrote' : `${otherName} wrote`}</span>
        <time dateTime={letter.created_at}>{formatDate(letter.created_at)}</time>
      </div>
      {letter.subject && <h3>{letter.subject}</h3>}
      <div className="letter-body">{letter.body}</div>
      <div className="letter-footer">
        {mine ? <span>{letter.read_at ? 'Read' : 'Sent'}</span> : <span>Received</span>}
      </div>
    </article>
  )
}

export default function Correspondence({
  userId,
  relationshipId,
  relationshipStatus,
  otherUserId,
  otherName,
  otherCountry,
  onBack,
  onSafety,
}: Props) {
  const [letters, setLetters] = useState<Letter[]>([])
  const [relationshipPeriods, setRelationshipPeriods] = useState<RelationshipPeriod[]>([])
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')

  const canWrite = relationshipStatus === 'accepted'

  const currentLetters = useMemo(
    () => letters.filter((letter) => letter.relationship_id === relationshipId),
    [letters, relationshipId],
  )

  const previousPeriods = useMemo(
    () => relationshipPeriods
      .filter((period) => period.id !== relationshipId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [relationshipPeriods, relationshipId],
  )

  const previousLetterCount = useMemo(
    () => letters.filter((letter) => letter.relationship_id !== relationshipId).length,
    [letters, relationshipId],
  )

  const wordCount = useMemo(() => {
    const trimmed = body.trim()
    return trimmed ? trimmed.split(/\s+/).length : 0
  }, [body])

  useEffect(() => {
    const rawDraft = localStorage.getItem(draftKey(userId, relationshipId))
    if (rawDraft) {
      try {
        const draft = JSON.parse(rawDraft) as { subject?: string; body?: string }
        setSubject(draft.subject ?? '')
        setBody(draft.body ?? '')
      } catch {
        localStorage.removeItem(draftKey(userId, relationshipId))
      }
    }
    void loadLetters()
  }, [relationshipId, userId, otherUserId])

  useEffect(() => {
    if (!canWrite) return

    const timer = window.setTimeout(() => {
      if (subject.trim() || body.trim()) {
        localStorage.setItem(
          draftKey(userId, relationshipId),
          JSON.stringify({ subject, body, savedAt: new Date().toISOString() }),
        )
      } else {
        localStorage.removeItem(draftKey(userId, relationshipId))
      }
    }, 300)

    return () => window.clearTimeout(timer)
  }, [subject, body, userId, relationshipId, canWrite])

  async function loadLetters() {
    setLoading(true)
    setMessage('')

    try {
      const { data: periodsData, error: periodsError } = await supabase
        .from('penpal_requests')
        .select('id, status, created_at, responded_at, ended_at')
        .or(
          `and(sender_id.eq.${userId},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${userId})`,
        )
        .in('status', ['accepted', 'paused', 'ended'])
        .order('created_at', { ascending: true })

      if (periodsError) throw new Error(`Could not load correspondence periods: ${errorMessage(periodsError)}`)

      const periods = (periodsData ?? []) as RelationshipPeriod[]
      setRelationshipPeriods(periods)

      const relationshipIds = periods.map((period) => period.id)
      if (!relationshipIds.includes(relationshipId)) relationshipIds.push(relationshipId)

      const { data, error } = await supabase
        .from('letters')
        .select('id, relationship_id, sender_id, recipient_id, subject, body, created_at, read_at')
        .in('relationship_id', relationshipIds)
        .order('created_at', { ascending: true })

      if (error) throw new Error(`Could not load letters: ${errorMessage(error)}`)

      const rows = (data ?? []) as Letter[]
      setLetters(rows)

      const hasUnreadCurrent = rows.some(
        (letter) => letter.relationship_id === relationshipId && letter.recipient_id === userId && letter.read_at === null,
      )

      if (hasUnreadCurrent) {
        const readAt = new Date().toISOString()
        const { error: readError } = await supabase
          .from('letters')
          .update({ read_at: readAt })
          .eq('relationship_id', relationshipId)
          .eq('recipient_id', userId)
          .is('read_at', null)

        if (!readError) {
          setLetters((previous) =>
            previous.map((letter) =>
              letter.relationship_id === relationshipId && letter.recipient_id === userId && letter.read_at === null
                ? { ...letter, read_at: readAt }
                : letter,
            ),
          )
        }
      }
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  async function sendLetter(event: React.FormEvent) {
    event.preventDefault()

    if (!canWrite) {
      setMessage('This relationship is not currently open for new letters.')
      return
    }

    const cleanBody = body.trim()
    const cleanSubject = subject.trim()

    if (!cleanBody) {
      setMessage('Write something before sending your letter.')
      return
    }

    setSending(true)
    setMessage('')

    try {
      const { error } = await supabase.from('letters').insert({
        relationship_id: relationshipId,
        sender_id: userId,
        recipient_id: otherUserId,
        subject: cleanSubject || null,
        body: cleanBody,
      })

      if (error) throw error

      setSubject('')
      setBody('')
      localStorage.removeItem(draftKey(userId, relationshipId))
      await loadLetters()
      setMessage(`Your letter to ${otherName} was sent.`)
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="correspondence-view">
      <button className="back correspondence-back" onClick={onBack}>← Pen pals & requests</button>

      <div className="correspondence-heading-row">
        <div>
          <p className="eyebrow">Your correspondence</p>
          <h1 className="correspondence-title">Letters with {otherName}.</h1>
          <p className="hero-copy correspondence-copy">
            {otherCountry ? `${otherName} · ${otherCountry}` : otherName}. Take your time — this space is built for letters, not instant messaging.
          </p>
          <div className="correspondence-heading-actions">
            <button className="secondary" type="button" onClick={onSafety}>Safety & boundaries</button>
          </div>
        </div>
      </div>

      {previousPeriods.length > 0 && relationshipStatus === 'accepted' && (
        <div className="reconnected-note">
          <span aria-hidden="true">↻</span>
          <div>
            <strong>You and {otherName} have corresponded before.</strong>
            <p>Your new connection starts fresh, while your earlier letters are preserved below as previous correspondence.</p>
          </div>
        </div>
      )}

      {relationshipStatus === 'paused' && (
        <div className="correspondence-boundary-note">
          <strong>This pen-pal relationship is paused.</strong>
          You can read your existing letters, but neither person can send a new letter until the relationship is resumed.
        </div>
      )}

      {relationshipStatus === 'ended' && (
        <div className="correspondence-boundary-note">
          <strong>This pen-pal relationship has ended.</strong>
          Your shared correspondence is preserved here as read-only history.
        </div>
      )}

      {message && <p className="status-message correspondence-status">{message}</p>}

      <section className="letter-history" aria-live="polite">
        <div className="letter-section-heading">
          <h2>{previousPeriods.length > 0 ? 'Current correspondence' : 'Correspondence history'}</h2>
          <span>{currentLetters.length}</span>
        </div>

        {loading ? (
          <p className="connection-empty">Opening your letters…</p>
        ) : currentLetters.length === 0 ? (
          <div className="first-letter-note">
            <span aria-hidden="true">✉</span>
            <div>
              <h3>{previousPeriods.length > 0 ? 'No new letters yet.' : 'No letters yet.'}</h3>
              <p>{canWrite ? `This ${previousPeriods.length > 0 ? 'new chapter' : 'correspondence'} is ready whenever you are — write something genuine to ${otherName}.` : 'There were no letters exchanged before this relationship changed.'}</p>
            </div>
          </div>
        ) : (
          <div className="letter-stack">
            {currentLetters.map((letter) => (
              <LetterCard key={letter.id} letter={letter} userId={userId} otherName={otherName} />
            ))}
          </div>
        )}
      </section>

      {!loading && previousPeriods.length > 0 && (
        <section className="previous-correspondence-section">
          <div className="letter-section-heading">
            <h2>Previous correspondence</h2>
            <span>{previousLetterCount}</span>
          </div>
          <p className="previous-correspondence-copy">
            Earlier pen-pal periods are kept separate from your current connection so your history stays clear.
          </p>

          <div className="previous-periods">
            {previousPeriods.map((period, index) => {
              const periodLetters = letters.filter((letter) => letter.relationship_id === period.id)
              const startDate = period.responded_at || period.created_at
              const endDate = period.ended_at

              return (
                <section className="previous-period" key={period.id}>
                  <div className="previous-period-heading">
                    <div>
                      <span className="person-kicker">Previous pen-pal period {previousPeriods.length - index}</span>
                      <h3>
                        {formatShortDate(startDate)}
                        {endDate ? ` – ${formatShortDate(endDate)}` : ''}
                      </h3>
                    </div>
                    <span className="previous-period-count">{periodLetters.length} {periodLetters.length === 1 ? 'letter' : 'letters'}</span>
                  </div>

                  {periodLetters.length === 0 ? (
                    <p className="connection-empty">No letters were exchanged during this period.</p>
                  ) : (
                    <div className="letter-stack archived-letter-stack">
                      {periodLetters.map((letter) => (
                        <LetterCard key={letter.id} letter={letter} userId={userId} otherName={otherName} />
                      ))}
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        </section>
      )}

      {canWrite ? (
        <section className="compose-letter-section">
          <div className="letter-section-heading"><h2>Write to {otherName}</h2></div>

          <form className="letter-form" onSubmit={sendLetter}>
            <label>
              Subject <span className="optional">optional</span>
              <input
                value={subject}
                maxLength={120}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="A little hello from my corner of the world"
              />
            </label>

            <label>
              Your letter
              <textarea
                value={body}
                maxLength={12000}
                rows={14}
                onChange={(event) => setBody(event.target.value)}
                placeholder={`Dear ${otherName},\n\n`}
              />
            </label>

            <div className="letter-compose-footer">
              <div className="letter-draft-info">
                <strong>{wordCount}</strong> {wordCount === 1 ? 'word' : 'words'}
                <span>Draft saved automatically on this device.</span>
              </div>
              <button className="primary" type="submit" disabled={sending || !body.trim()}>
                {sending ? 'Sending…' : 'Send letter'}
              </button>
            </div>
          </form>
        </section>
      ) : (
        <section className="compose-letter-section">
          <div className="letter-section-heading"><h2>New letters are unavailable</h2></div>
          <p className="connection-empty">Return to Pen pals & requests to manage this relationship.</p>
        </section>
      )}
    </section>
  )
}

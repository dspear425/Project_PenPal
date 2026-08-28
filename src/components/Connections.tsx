import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

export type PenPalRequest = {
  id: string
  sender_id: string
  recipient_id: string
  intro_message: string | null
  status: 'pending' | 'accepted' | 'declined' | 'cancelled'
  created_at: string
  responded_at: string | null
}

type MemberProfile = {
  id: string
  display_name: string | null
  country: string | null
  about_me: string | null
}

type Props = {
  userId: string
  onBack: () => void
  onDiscover: () => void
  onEditProfile: () => void
  onSignOut: () => void
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
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

export default function Connections({ userId, onBack, onDiscover, onEditProfile, onSignOut }: Props) {
  const [requests, setRequests] = useState<PenPalRequest[]>([])
  const [profiles, setProfiles] = useState<Map<string, MemberProfile>>(new Map())
  const [loading, setLoading] = useState(true)
  const [workingId, setWorkingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    void loadConnections()
  }, [userId])

  async function loadConnections() {
    setLoading(true)
    setMessage('')

    try {
      const { data: requestRows, error: requestError } = await supabase
        .from('penpal_requests')
        .select('id, sender_id, recipient_id, intro_message, status, created_at, responded_at')
        .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
        .in('status', ['pending', 'accepted'])
        .order('created_at', { ascending: false })

      if (requestError) throw new Error(`Could not load pen-pal requests: ${errorMessage(requestError)}`)

      const typed = (requestRows ?? []) as PenPalRequest[]
      setRequests(typed)

      const otherIds = Array.from(new Set(
        typed.map((request) => request.sender_id === userId ? request.recipient_id : request.sender_id),
      ))

      if (!otherIds.length) {
        setProfiles(new Map())
        return
      }

      const { data: profileRows, error: profileError } = await supabase
        .from('profiles')
        .select('id, display_name, country, about_me')
        .in('id', otherIds)

      if (profileError) throw new Error(`Could not load member profiles: ${errorMessage(profileError)}`)

      setProfiles(new Map((profileRows ?? []).map((profile) => [String(profile.id), profile as MemberProfile])))
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  async function respond(request: PenPalRequest, status: 'accepted' | 'declined' | 'cancelled') {
    setWorkingId(request.id)
    setMessage('')

    try {
      const { error } = await supabase
        .from('penpal_requests')
        .update({ status, responded_at: new Date().toISOString() })
        .eq('id', request.id)

      if (error) throw error
      await loadConnections()
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setWorkingId(null)
    }
  }

  const incoming = useMemo(
    () => requests.filter((request) => request.status === 'pending' && request.recipient_id === userId),
    [requests, userId],
  )
  const outgoing = useMemo(
    () => requests.filter((request) => request.status === 'pending' && request.sender_id === userId),
    [requests, userId],
  )
  const active = useMemo(
    () => requests.filter((request) => request.status === 'accepted'),
    [requests],
  )

  function otherProfile(request: PenPalRequest) {
    const otherId = request.sender_id === userId ? request.recipient_id : request.sender_id
    return profiles.get(otherId)
  }

  return (
    <main className="page-shell discover-shell">
      <section className="discover-card connections-card">
        <header className="discover-header">
          <div className="brand-row compact-brand">
            <div className="stamp" aria-hidden="true">✉</div>
            <span className="brand-name">Project PenPal</span>
          </div>
          <nav className="discover-nav" aria-label="Account navigation">
            <button className="text-button discover-link" onClick={onDiscover}>Discover</button>
            <button className="text-button discover-link" onClick={onEditProfile}>Edit profile</button>
            <button className="text-button discover-link" onClick={onSignOut}>Sign out</button>
          </nav>
        </header>

        <button className="back discover-back" onClick={onBack}>← Dashboard</button>
        <p className="eyebrow">Your pen pals</p>
        <div className="discover-title-row">
          <div>
            <h1 className="discover-title">Connections worth keeping.</h1>
            <p className="hero-copy discover-copy">
              Review new requests, see who you’re waiting on, and keep your accepted pen pals together in one place.
            </p>
          </div>
          <button className="secondary refresh-button" onClick={() => void loadConnections()} disabled={loading}>
            {loading ? 'Checking…' : 'Refresh'}
          </button>
        </div>

        {message && <p className="status-message discover-status">{message}</p>}

        {!loading && !message && requests.length === 0 && (
          <section className="empty-discover">
            <div className="empty-envelope" aria-hidden="true">✉</div>
            <h2>No requests yet.</h2>
            <p>When you request a pen pal — or someone requests you — the connection will appear here.</p>
            <button className="primary connections-discover-button" onClick={onDiscover}>Discover pen pals</button>
          </section>
        )}

        {!loading && requests.length > 0 && (
          <div className="connection-sections">
            <section className="connection-section">
              <div className="connection-heading">
                <h2>Incoming requests</h2>
                <span>{incoming.length}</span>
              </div>
              {incoming.length === 0 ? (
                <p className="connection-empty">No new requests are waiting for you.</p>
              ) : incoming.map((request) => {
                const person = otherProfile(request)
                return (
                  <article className="connection-item" key={request.id}>
                    <div>
                      <span className="person-kicker">{person?.country || 'Location not listed'} · {formatDate(request.created_at)}</span>
                      <h3>{person?.display_name || 'Pen pal'}</h3>
                      {request.intro_message && <p className="request-intro">“{request.intro_message}”</p>}
                    </div>
                    <div className="connection-actions">
                      <button className="primary" disabled={workingId === request.id} onClick={() => void respond(request, 'accepted')}>Accept</button>
                      <button className="secondary" disabled={workingId === request.id} onClick={() => void respond(request, 'declined')}>Decline</button>
                    </div>
                  </article>
                )
              })}
            </section>

            <section className="connection-section">
              <div className="connection-heading">
                <h2>Sent requests</h2>
                <span>{outgoing.length}</span>
              </div>
              {outgoing.length === 0 ? (
                <p className="connection-empty">You don’t have any requests waiting for a reply.</p>
              ) : outgoing.map((request) => {
                const person = otherProfile(request)
                return (
                  <article className="connection-item" key={request.id}>
                    <div>
                      <span className="person-kicker">Waiting since {formatDate(request.created_at)}</span>
                      <h3>{person?.display_name || 'Pen pal'}</h3>
                      <p className="request-state">Your request is waiting for their response.</p>
                    </div>
                    <button className="secondary" disabled={workingId === request.id} onClick={() => void respond(request, 'cancelled')}>Cancel request</button>
                  </article>
                )
              })}
            </section>

            <section className="connection-section active-penpals-section">
              <div className="connection-heading">
                <h2>Active pen pals</h2>
                <span>{active.length}</span>
              </div>
              {active.length === 0 ? (
                <p className="connection-empty">Accepted friendships will appear here.</p>
              ) : active.map((request) => {
                const person = otherProfile(request)
                return (
                  <article className="connection-item active-connection" key={request.id}>
                    <div>
                      <span className="person-kicker">Pen pals since {formatDate(request.responded_at || request.created_at)}</span>
                      <h3>{person?.display_name || 'Pen pal'}{person?.country ? ` · ${person.country}` : ''}</h3>
                      {person?.about_me && <p className="request-state">{person.about_me}</p>}
                    </div>
                    <button className="primary" disabled title="Letters are the next milestone">Write a letter</button>
                  </article>
                )
              })}
            </section>
          </div>
        )}
      </section>
    </main>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import Correspondence from './Correspondence'
import SafetyPanel from './SafetyPanel'
import '../letters.css'

type RelationshipStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'paused' | 'ended'

export type PenPalRequest = {
  id: string
  sender_id: string
  recipient_id: string
  intro_message: string | null
  status: RelationshipStatus
  created_at: string
  responded_at: string | null
  paused_by: string | null
  paused_at: string | null
  ended_by: string | null
  ended_at: string | null
}

type MemberProfile = {
  id: string
  display_name: string | null
  country: string | null
  about_me: string | null
}

type SelectedCorrespondence = {
  relationshipId: string
  relationshipStatus: 'accepted' | 'paused' | 'ended'
  otherUserId: string
  otherName: string
  otherCountry: string | null
}

type SafetyTarget = {
  relationshipId: string | null
  otherUserId: string
  otherName: string
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
  const [unreadByRelationship, setUnreadByRelationship] = useState<Map<string, number>>(new Map())
  const [selectedCorrespondence, setSelectedCorrespondence] = useState<SelectedCorrespondence | null>(null)
  const [safetyTarget, setSafetyTarget] = useState<SafetyTarget | null>(null)
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
        .select('id, sender_id, recipient_id, intro_message, status, created_at, responded_at, paused_by, paused_at, ended_by, ended_at')
        .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
        .in('status', ['pending', 'accepted', 'paused', 'ended'])
        .order('created_at', { ascending: false })

      if (requestError) throw new Error(`Could not load pen-pal requests: ${errorMessage(requestError)}`)

      const typed = (requestRows ?? []) as PenPalRequest[]
      setRequests(typed)

      const otherIds = Array.from(new Set(
        typed.map((request) => request.sender_id === userId ? request.recipient_id : request.sender_id),
      ))

      if (otherIds.length) {
        const { data: profileRows, error: profileError } = await supabase
          .from('profiles')
          .select('id, display_name, country, about_me')
          .in('id', otherIds)

        if (profileError) throw new Error(`Could not load member profiles: ${errorMessage(profileError)}`)

        const profileMap = new Map<string, MemberProfile>()
        for (const row of profileRows ?? []) {
          const member = row as MemberProfile
          profileMap.set(String(member.id), member)
        }
        setProfiles(profileMap)
      } else {
        setProfiles(new Map())
      }

      const historyIds = typed
        .filter((request) => ['accepted', 'paused', 'ended'].includes(request.status))
        .map((request) => request.id)

      if (historyIds.length) {
        const { data: unreadRows, error: unreadError } = await supabase
          .from('letters')
          .select('relationship_id')
          .eq('recipient_id', userId)
          .is('read_at', null)
          .in('relationship_id', historyIds)

        if (unreadError) throw new Error(`Could not load letter notifications: ${errorMessage(unreadError)}`)

        const counts = new Map<string, number>()
        for (const row of unreadRows ?? []) {
          const relationshipId = String(row.relationship_id)
          counts.set(relationshipId, (counts.get(relationshipId) ?? 0) + 1)
        }
        setUnreadByRelationship(counts)
      } else {
        setUnreadByRelationship(new Map())
      }
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

  async function relationshipAction(request: PenPalRequest, action: 'pause' | 'resume' | 'end') {
    const person = otherProfile(request)
    const name = person?.display_name || 'this pen pal'

    if (action === 'end') {
      const confirmed = window.confirm(
        `End your pen-pal relationship with ${name}? You will both keep access to your existing letter history, but you will no longer be able to send new letters.`,
      )
      if (!confirmed) return
    }

    setWorkingId(request.id)
    setMessage('')

    try {
      const functionName = action === 'pause'
        ? 'pause_relationship'
        : action === 'resume'
          ? 'resume_relationship'
          : 'end_relationship'

      const { error } = await supabase.rpc(functionName, { target_relationship: request.id })
      if (error) throw error

      if (selectedCorrespondence?.relationshipId === request.id) {
        setSelectedCorrespondence(null)
      }
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
  const paused = useMemo(
    () => requests.filter((request) => request.status === 'paused'),
    [requests],
  )
  const ended = useMemo(
    () => requests.filter((request) => request.status === 'ended'),
    [requests],
  )
  const unreadTotal = useMemo(
    () => Array.from(unreadByRelationship.values()).reduce((sum, count) => sum + count, 0),
    [unreadByRelationship],
  )

  function otherProfile(request: PenPalRequest) {
    const otherId = request.sender_id === userId ? request.recipient_id : request.sender_id
    return profiles.get(otherId)
  }

  function openCorrespondence(request: PenPalRequest) {
    if (!['accepted', 'paused', 'ended'].includes(request.status)) return
    const otherUserId = request.sender_id === userId ? request.recipient_id : request.sender_id
    const person = profiles.get(otherUserId)
    setSelectedCorrespondence({
      relationshipId: request.id,
      relationshipStatus: request.status as 'accepted' | 'paused' | 'ended',
      otherUserId,
      otherName: person?.display_name || 'Pen pal',
      otherCountry: person?.country || null,
    })
  }

  function openSafety(request: PenPalRequest) {
    const otherUserId = request.sender_id === userId ? request.recipient_id : request.sender_id
    const person = profiles.get(otherUserId)
    setSafetyTarget({
      relationshipId: request.id,
      otherUserId,
      otherName: person?.display_name || 'this member',
    })
  }

  function safetyPanel() {
    if (!safetyTarget) return null
    return (
      <SafetyPanel
        userId={userId}
        targetUserId={safetyTarget.otherUserId}
        targetName={safetyTarget.otherName}
        relationshipId={safetyTarget.relationshipId}
        onClose={() => setSafetyTarget(null)}
        onBlocked={() => {
          setSafetyTarget(null)
          setSelectedCorrespondence(null)
          void loadConnections()
        }}
      />
    )
  }

  if (selectedCorrespondence) {
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

          <Correspondence
            userId={userId}
            relationshipId={selectedCorrespondence.relationshipId}
            relationshipStatus={selectedCorrespondence.relationshipStatus}
            otherUserId={selectedCorrespondence.otherUserId}
            otherName={selectedCorrespondence.otherName}
            otherCountry={selectedCorrespondence.otherCountry}
            onBack={() => {
              setSelectedCorrespondence(null)
              void loadConnections()
            }}
            onSafety={() => setSafetyTarget({
              relationshipId: selectedCorrespondence.relationshipId,
              otherUserId: selectedCorrespondence.otherUserId,
              otherName: selectedCorrespondence.otherName,
            })}
          />
        </section>
        {safetyPanel()}
      </main>
    )
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
              Review requests, continue your letters, and set clear boundaries when you need a break or a connection no longer feels right.
            </p>
          </div>
          <button className="secondary refresh-button" onClick={() => void loadConnections()} disabled={loading}>
            {loading ? 'Checking…' : 'Refresh'}
          </button>
        </div>

        {unreadTotal > 0 && (
          <div className="letter-alert" role="status">
            <span className="letter-alert-icon" aria-hidden="true">✉</span>
            <div>
              <strong>{unreadTotal} new {unreadTotal === 1 ? 'letter' : 'letters'} waiting for you.</strong>
              <span>Open the highlighted pen pal below to read {unreadTotal === 1 ? 'it' : 'them'}.</span>
            </div>
          </div>
        )}

        {message && <p className="status-message discover-status">{message}</p>}

        {!loading && !message && requests.length === 0 && (
          <section className="empty-discover">
            <div className="empty-envelope" aria-hidden="true">✉</div>
            <h2>No connections yet.</h2>
            <p>When you request a pen pal — or someone requests you — the connection will appear here.</p>
            <button className="primary connections-discover-button" onClick={onDiscover}>Discover pen pals</button>
          </section>
        )}

        {!loading && requests.length > 0 && (
          <div className="connection-sections">
            <section className="connection-section">
              <div className="connection-heading"><h2>Incoming requests</h2><span>{incoming.length}</span></div>
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
                      <button className="relationship-control-link" type="button" onClick={() => openSafety(request)}>Safety</button>
                    </div>
                  </article>
                )
              })}
            </section>

            <section className="connection-section">
              <div className="connection-heading"><h2>Sent requests</h2><span>{outgoing.length}</span></div>
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
                    <div className="connection-actions">
                      <button className="secondary" disabled={workingId === request.id} onClick={() => void respond(request, 'cancelled')}>Cancel request</button>
                      <button className="relationship-control-link" type="button" onClick={() => openSafety(request)}>Safety</button>
                    </div>
                  </article>
                )
              })}
            </section>

            <section className="connection-section active-penpals-section">
              <div className="connection-heading"><h2>Active pen pals</h2><span>{active.length}</span></div>
              {active.length === 0 ? (
                <p className="connection-empty">Accepted friendships will appear here.</p>
              ) : active.map((request) => {
                const person = otherProfile(request)
                const unread = unreadByRelationship.get(request.id) ?? 0
                return (
                  <article className={`connection-item active-connection ${unread > 0 ? 'connection-has-unread' : ''}`} key={request.id}>
                    <div>
                      <span className="person-kicker">Pen pals since {formatDate(request.responded_at || request.created_at)}</span>
                      <h3>{person?.display_name || 'Pen pal'}{person?.country ? ` · ${person.country}` : ''}</h3>
                      {unread > 0 && <span className="connection-letter-badge">✉ {unread} new {unread === 1 ? 'letter' : 'letters'}</span>}
                      {person?.about_me && <p className="request-state">{person.about_me}</p>}
                    </div>
                    <div className="connection-actions">
                      <button className="primary" onClick={() => openCorrespondence(request)}>Write a letter</button>
                      <div className="relationship-controls">
                        <button className="relationship-control-link" type="button" disabled={workingId === request.id} onClick={() => void relationshipAction(request, 'pause')}>Pause</button>
                        <button className="relationship-control-link danger-link" type="button" disabled={workingId === request.id} onClick={() => void relationshipAction(request, 'end')}>End</button>
                        <button className="relationship-control-link" type="button" onClick={() => openSafety(request)}>Safety</button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </section>

            {paused.length > 0 && (
              <section className="connection-section">
                <div className="connection-heading"><h2>Paused pen pals</h2><span>{paused.length}</span></div>
                {paused.map((request) => {
                  const person = otherProfile(request)
                  const pausedByMe = request.paused_by === userId
                  const unread = unreadByRelationship.get(request.id) ?? 0
                  return (
                    <article className={`connection-item paused-connection ${unread > 0 ? 'connection-has-unread' : ''}`} key={request.id}>
                      <div>
                        <span className="person-kicker">Paused {request.paused_at ? formatDate(request.paused_at) : ''}</span>
                        <h3>{person?.display_name || 'Pen pal'}{person?.country ? ` · ${person.country}` : ''}</h3>
                        <span className="relationship-state-badge paused">⏸ {pausedByMe ? 'Paused by you' : `Paused by ${person?.display_name || 'your pen pal'}`}</span>
                        {unread > 0 && <span className="connection-letter-badge">✉ {unread} unread</span>}
                        <p className="request-state">Existing letters remain available, but new letters cannot be sent while the relationship is paused.</p>
                      </div>
                      <div className="connection-actions">
                        <button className="secondary" onClick={() => openCorrespondence(request)}>View letters</button>
                        {pausedByMe && <button className="primary" disabled={workingId === request.id} onClick={() => void relationshipAction(request, 'resume')}>Resume</button>}
                        <div className="relationship-controls">
                          <button className="relationship-control-link danger-link" type="button" disabled={workingId === request.id} onClick={() => void relationshipAction(request, 'end')}>End</button>
                          <button className="relationship-control-link" type="button" onClick={() => openSafety(request)}>Safety</button>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </section>
            )}

            {ended.length > 0 && (
              <section className="connection-section">
                <div className="connection-heading"><h2>Past pen pals</h2><span>{ended.length}</span></div>
                {ended.map((request) => {
                  const person = otherProfile(request)
                  const unread = unreadByRelationship.get(request.id) ?? 0
                  return (
                    <article className={`connection-item ended-connection ${unread > 0 ? 'connection-has-unread' : ''}`} key={request.id}>
                      <div>
                        <span className="person-kicker">Ended {request.ended_at ? formatDate(request.ended_at) : ''}</span>
                        <h3>{person?.display_name || 'Former pen pal'}{person?.country ? ` · ${person.country}` : ''}</h3>
                        {unread > 0 && <span className="connection-letter-badge">✉ {unread} unread from before the connection ended</span>}
                        <p className="request-state">Your existing correspondence is preserved as read-only history.</p>
                      </div>
                      <div className="connection-actions">
                        <button className="secondary" onClick={() => openCorrespondence(request)}>View history</button>
                        <button className="relationship-control-link" type="button" onClick={() => openSafety(request)}>Safety</button>
                      </div>
                    </article>
                  )
                })}
              </section>
            )}
          </div>
        )}
      </section>
      {safetyPanel()}
    </main>
  )
}

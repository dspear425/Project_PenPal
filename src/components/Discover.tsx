import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { calculateMatch, type CurrentProfile, type MatchProfile, type MatchResult } from '../lib/matching'
import ProfileAvatar from './ProfileAvatar'

type Interest = {
  id: number
  name: string
}

type RequestRow = {
  id: string
  sender_id: string
  recipient_id: string
  status: 'pending' | 'accepted' | 'paused'
}

type Props = {
  userId: string
  currentProfile: CurrentProfile
  currentInterestIds: number[]
  interestCatalog: Interest[]
  onBack: () => void
  onConnections: () => void
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

function ageFromBirthYear(birthYear: number | null) {
  if (!birthYear) return null
  return new Date().getFullYear() - birthYear
}

export default function Discover({
  userId,
  currentProfile,
  currentInterestIds,
  interestCatalog,
  onBack,
  onConnections,
  onEditProfile,
  onSignOut,
}: Props) {
  const [matches, setMatches] = useState<MatchResult[]>([])
  const [connectionsByMember, setConnectionsByMember] = useState<Map<string, RequestRow>>(new Map())
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [composingFor, setComposingFor] = useState<string | null>(null)
  const [introMessage, setIntroMessage] = useState('')
  const [requestingId, setRequestingId] = useState<string | null>(null)

  const interestNameById = useMemo(
    () => new Map(interestCatalog.map((interest) => [interest.id, interest.name])),
    [interestCatalog],
  )

  useEffect(() => {
    void loadMatches()
  }, [userId])

  async function loadMatches() {
    setLoading(true)
    setMessage('')

    try {
      const { data: profileRows, error: profileError } = await supabase
        .from('profiles')
        .select('id, display_name, username, avatar_path, avatar_visibility, avatar_updated_at, birth_year, country, about_me, languages, friendship_goals, communication_style, correspondence_frequency, accepting_new_penpals, max_penpals')
        .neq('id', userId)
        .eq('account_status', 'active')
        .eq('onboarding_complete', true)
        .eq('discoverable', true)
        .eq('accepting_new_penpals', true)

      if (profileError) throw new Error(`Could not load members: ${errorMessage(profileError)}`)

      const candidates = (profileRows ?? []) as MatchProfile[]
      if (!candidates.length) {
        setMatches([])
        setConnectionsByMember(new Map())
        return
      }

      const candidateIds = candidates.map((candidate) => candidate.id)
      const [{ data: interestRows, error: interestError }, { data: requestRows, error: requestError }] = await Promise.all([
        supabase
          .from('profile_interests')
          .select('profile_id, interest_id')
          .in('profile_id', candidateIds),
        supabase
          .from('penpal_requests')
          .select('id, sender_id, recipient_id, status')
          .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
          .in('status', ['pending', 'accepted', 'paused']),
      ])

      if (interestError) throw new Error(`Could not load member interests: ${errorMessage(interestError)}`)
      if (requestError) throw new Error(`Could not load pen-pal requests: ${errorMessage(requestError)}`)

      const interestsByProfile = new Map<string, number[]>()
      for (const row of interestRows ?? []) {
        const existing = interestsByProfile.get(String(row.profile_id)) ?? []
        existing.push(Number(row.interest_id))
        interestsByProfile.set(String(row.profile_id), existing)
      }

      const ranked = candidates
        .map((candidate) =>
          calculateMatch(
            currentProfile,
            candidate,
            currentInterestIds,
            interestsByProfile.get(candidate.id) ?? [],
          ),
        )
        .sort((a, b) => b.score - a.score)

      const requestMap = new Map<string, RequestRow>()
      for (const request of (requestRows ?? []) as RequestRow[]) {
        const otherId = request.sender_id === userId ? request.recipient_id : request.sender_id
        requestMap.set(otherId, request)
      }

      setMatches(ranked)
      setConnectionsByMember(requestMap)
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  async function sendRequest(recipientId: string) {
    setRequestingId(recipientId)
    setMessage('')

    try {
      const intro = introMessage.trim()
      if (intro.length > 500) {
        setMessage('Your introduction must be 500 characters or fewer.')
        return
      }

      const { data, error } = await supabase
        .from('penpal_requests')
        .insert({
          sender_id: userId,
          recipient_id: recipientId,
          intro_message: intro || null,
          status: 'pending',
        })
        .select('id, sender_id, recipient_id, status')
        .single()

      if (error) {
        if ('code' in error && error.code === '23505') {
          throw new Error('A pending request or existing pen-pal connection already exists with this member.')
        }
        throw error
      }

      setConnectionsByMember((previous) => {
        const next = new Map(previous)
        next.set(recipientId, data as RequestRow)
        return next
      })
      setComposingFor(null)
      setIntroMessage('')
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setRequestingId(null)
    }
  }

  return (
    <main className="page-shell discover-shell">
      <section className="discover-card">
        <header className="discover-header">
          <div className="brand-row compact-brand">
            <div className="stamp" aria-hidden="true">✉</div>
            <span className="brand-name">Project PenPal</span>
          </div>
          <nav className="discover-nav" aria-label="Account navigation">
            <button className="text-button discover-link" onClick={onConnections}>Pen pals</button>
            <button className="text-button discover-link" onClick={onEditProfile}>Edit profile</button>
            <button className="text-button discover-link" onClick={onSignOut}>Sign out</button>
          </nav>
        </header>

        <button className="back discover-back" onClick={onBack}>← Dashboard</button>
        <p className="eyebrow">Discover pen pals</p>
        <div className="discover-title-row">
          <div>
            <h1 className="discover-title">People worth writing to.</h1>
            <p className="hero-copy discover-copy">
              Matches are ranked by shared interests, friendship goals, writing style,
              reply rhythm, location preference, and language compatibility.
            </p>
          </div>
          <button className="secondary refresh-button" onClick={() => void loadMatches()} disabled={loading}>
            {loading ? 'Finding matches…' : 'Refresh matches'}
          </button>
        </div>

        {message && <p className="status-message discover-status">{message}</p>}

        {!loading && !message && matches.length === 0 && (
          <section className="empty-discover">
            <div className="empty-envelope" aria-hidden="true">✉</div>
            <h2>You’re the first one here.</h2>
            <p>
              Your matching system is working, but there are no other completed, discoverable
              profiles yet. Once another member finishes a profile, they’ll appear here automatically.
            </p>
          </section>
        )}

        <section className="match-grid" aria-live="polite">
          {matches.map((match) => {
            const personAge = ageFromBirthYear(match.profile.birth_year)
            const sharedInterestNames = match.sharedInterestIds
              .map((id) => interestNameById.get(id))
              .filter((value): value is string => Boolean(value))
            const existingConnection = connectionsByMember.get(match.profile.id)
            const isOutgoing = existingConnection?.status === 'pending' && existingConnection.sender_id === userId
            const isIncoming = existingConnection?.status === 'pending' && existingConnection.recipient_id === userId
            const isAccepted = existingConnection?.status === 'accepted'
            const isPaused = existingConnection?.status === 'paused'
            const isComposing = composingFor === match.profile.id

            return (
              <article className="match-card" key={match.profile.id}>
                <div className="match-card-top">
                  <div className="match-profile-heading">
                    <ProfileAvatar
                      avatarPath={match.profile.avatar_visibility === 'discover' ? match.profile.avatar_path : null}
                      displayName={match.profile.display_name}
                      size="medium"
                    />
                    <div>
                      <div className="person-kicker">
                        {match.profile.country || 'Country not listed'}
                        {personAge ? ` · Age ${personAge}` : ''}
                      </div>
                      <h2>{match.profile.display_name || 'New member'}</h2>
                      {match.profile.username && <div className="person-username">@{match.profile.username}</div>}
                    </div>
                  </div>
                  <div className="match-score" aria-label={`${match.score}% compatibility`}>
                    <strong>{match.score}%</strong>
                    <span>match</span>
                  </div>
                </div>

                {match.profile.about_me && <p className="match-bio">{match.profile.about_me}</p>}

                <div className="reason-list">
                  {match.reasons.map((reason) => <span key={reason}>✓ {reason}</span>)}
                </div>

                {sharedInterestNames.length > 0 && (
                  <div className="shared-interests">
                    <span className="shared-label">You both like</span>
                    <div className="shared-tags">
                      {sharedInterestNames.slice(0, 6).map((name) => <span key={name}>{name}</span>)}
                    </div>
                  </div>
                )}

                {isComposing && !existingConnection && (
                  <div className="request-composer">
                    <label>
                      Say hello <span>optional · {introMessage.length}/500</span>
                      <textarea
                        rows={4}
                        maxLength={500}
                        value={introMessage}
                        onChange={(event) => setIntroMessage(event.target.value)}
                        placeholder={`Introduce yourself to ${match.profile.display_name || 'this member'}…`}
                      />
                    </label>
                    <div className="request-composer-actions">
                      <button className="primary" type="button" disabled={requestingId === match.profile.id} onClick={() => void sendRequest(match.profile.id)}>
                        {requestingId === match.profile.id ? 'Sending…' : 'Send request'}
                      </button>
                      <button className="secondary" type="button" onClick={() => { setComposingFor(null); setIntroMessage('') }}>Cancel</button>
                    </div>
                  </div>
                )}

                <div className="match-actions">
                  {isAccepted ? (
                    <><button className="primary" type="button" disabled>Already pen pals</button><button className="text-button inline-link" type="button" onClick={onConnections}>Open pen pals</button></>
                  ) : isPaused ? (
                    <><button className="primary" type="button" disabled>Connection paused</button><button className="text-button inline-link" type="button" onClick={onConnections}>Manage connection</button></>
                  ) : isOutgoing ? (
                    <><button className="primary" type="button" disabled>Request sent</button><button className="text-button inline-link" type="button" onClick={onConnections}>View requests</button></>
                  ) : isIncoming ? (
                    <><button className="primary" type="button" onClick={onConnections}>Respond to request</button><span>They already asked to connect.</span></>
                  ) : !isComposing ? (
                    <button className="primary" type="button" onClick={() => { setComposingFor(match.profile.id); setIntroMessage('') }}>
                      Request pen pal
                    </button>
                  ) : null}
                </div>
              </article>
            )
          })}
        </section>
      </section>
    </main>
  )
}

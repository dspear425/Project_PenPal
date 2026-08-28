import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { calculateMatch, type CurrentProfile, type MatchProfile, type MatchResult } from '../lib/matching'

type Interest = {
  id: number
  name: string
}

type Props = {
  userId: string
  currentProfile: CurrentProfile
  currentInterestIds: number[]
  interestCatalog: Interest[]
  onBack: () => void
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
  onEditProfile,
  onSignOut,
}: Props) {
  const [matches, setMatches] = useState<MatchResult[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

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
        .select('id, display_name, birth_year, country, about_me, languages, friendship_goals, communication_style, correspondence_frequency, accepting_new_penpals, max_penpals')
        .neq('id', userId)
        .eq('onboarding_complete', true)
        .eq('discoverable', true)
        .eq('accepting_new_penpals', true)

      if (profileError) throw new Error(`Could not load members: ${errorMessage(profileError)}`)

      const candidates = (profileRows ?? []) as MatchProfile[]
      if (!candidates.length) {
        setMatches([])
        return
      }

      const candidateIds = candidates.map((candidate) => candidate.id)
      const { data: interestRows, error: interestError } = await supabase
        .from('profile_interests')
        .select('profile_id, interest_id')
        .in('profile_id', candidateIds)

      if (interestError) throw new Error(`Could not load member interests: ${errorMessage(interestError)}`)

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

      setMatches(ranked)
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setLoading(false)
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
            <p className="empty-note">
              For testing, create a second account with another email address and give it a different
              set of interests and writing preferences.
            </p>
          </section>
        )}

        <section className="match-grid" aria-live="polite">
          {matches.map((match) => {
            const personAge = ageFromBirthYear(match.profile.birth_year)
            const sharedInterestNames = match.sharedInterestIds
              .map((id) => interestNameById.get(id))
              .filter((value): value is string => Boolean(value))

            return (
              <article className="match-card" key={match.profile.id}>
                <div className="match-card-top">
                  <div>
                    <div className="person-kicker">
                      {match.profile.country || 'Country not listed'}
                      {personAge ? ` · Age ${personAge}` : ''}
                    </div>
                    <h2>{match.profile.display_name || 'New member'}</h2>
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

                <div className="match-actions">
                  <button className="primary" type="button" disabled title="Pen-pal requests are the next feature">
                    Request pen pal
                  </button>
                  <span>Requests are coming in the next build.</span>
                </div>
              </article>
            )
          })}
        </section>
      </section>
    </main>
  )
}

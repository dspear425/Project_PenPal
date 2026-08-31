import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import ProfileAvatar from './ProfileAvatar'
import '../connection-profile.css'

type RelationshipStatus = 'pending' | 'accepted' | 'paused' | 'ended'

type Profile = {
  id: string
  display_name: string | null
  username: string | null
  avatar_path: string | null
  avatar_visibility: 'discover' | 'connections' | 'hidden' | null
  birth_year: number | null
  country: string | null
  region: string | null
  about_me: string | null
  languages: string[] | null
  friendship_goals: string[] | null
  communication_style: string | null
  correspondence_frequency: string | null
  accepting_new_penpals: boolean | null
}

type Interest = {
  id: number
  name: string
}

type Props = {
  targetUserId: string
  relationshipStatus: RelationshipStatus
  onClose: () => void
  onSafety: () => void
}

const goalLabels: Record<string, string> = {
  'long-term': 'Long-term friendship',
  casual: 'Casual correspondence',
  culture: 'Cultural exchange',
  language: 'Language exchange',
  'snail-mail': 'Snail-mail friendship',
  local: 'Local friendship',
  international: 'International friendship',
}

const styleLabels: Record<string, string> = {
  short: 'Short messages',
  medium: 'Medium-length messages',
  long: 'Long letters',
  any: 'Anything',
}

const frequencyLabels: Record<string, string> = {
  several_week: 'Several times a week',
  weekly: 'About weekly',
  biweekly: 'Every couple of weeks',
  monthly: 'About monthly',
  flexible: 'Flexible',
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const value = (error as { message?: unknown }).message
    if (typeof value === 'string') return value
  }
  return String(error || 'Unknown error')
}

function ageFromBirthYear(birthYear: number | null) {
  return birthYear ? new Date().getFullYear() - birthYear : null
}

export default function ConnectionProfileModal({ targetUserId, relationshipStatus, onClose, onSafety }: Props) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [interests, setInterests] = useState<Interest[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    void loadProfile()
  }, [targetUserId])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const age = useMemo(() => ageFromBirthYear(profile?.birth_year ?? null), [profile?.birth_year])

  async function loadProfile() {
    setLoading(true)
    setMessage('')
    try {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, display_name, username, avatar_path, avatar_visibility, birth_year, country, region, about_me, languages, friendship_goals, communication_style, correspondence_frequency, accepting_new_penpals')
        .eq('id', targetUserId)
        .maybeSingle()

      if (profileError) throw profileError
      if (!profileData) throw new Error('This member profile is no longer available.')

      setProfile(profileData as Profile)

      const { data: selectedInterests, error: selectedError } = await supabase
        .from('profile_interests')
        .select('interest_id')
        .eq('profile_id', targetUserId)

      if (selectedError) throw selectedError
      const ids = (selectedInterests ?? []).map((row) => Number(row.interest_id)).filter(Number.isFinite)

      if (!ids.length) {
        setInterests([])
      } else {
        const { data: interestRows, error: interestError } = await supabase
          .from('interests')
          .select('id, name')
          .in('id', ids)
          .order('name')
        if (interestError) throw interestError
        setInterests((interestRows ?? []) as Interest[])
      }
    } catch (error) {
      setMessage(errorMessage(error))
      setProfile(null)
      setInterests([])
    } finally {
      setLoading(false)
    }
  }

  const established = relationshipStatus !== 'pending'
  const avatarPath = profile?.avatar_path && profile.avatar_visibility !== 'hidden'
    && (profile.avatar_visibility === 'discover' || established)
    ? profile.avatar_path
    : null

  const location = [profile?.region, profile?.country].filter(Boolean).join(', ') || 'Location not listed'
  const goals = profile?.friendship_goals ?? []
  const languages = profile?.languages ?? []

  return (
    <div className="connection-profile-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="connection-profile-modal" role="dialog" aria-modal="true" aria-labelledby="connection-profile-title">
        <button className="connection-profile-close" type="button" onClick={onClose} aria-label="Close profile">×</button>

        {loading ? (
          <p className="connection-empty">Loading member profile…</p>
        ) : message ? (
          <div className="connection-profile-error">
            <h2 id="connection-profile-title">Profile unavailable.</h2>
            <p>{message}</p>
            <button className="secondary" type="button" onClick={onClose}>Back to connections</button>
          </div>
        ) : profile && (
          <>
            <header className="connection-profile-header">
              <ProfileAvatar avatarPath={avatarPath} displayName={profile.display_name} size="large" />
              <div>
                <p className="eyebrow">Pen-pal profile</p>
                <h2 id="connection-profile-title">{profile.display_name || 'Member'}</h2>
                {profile.username && <span className="connection-profile-username">@{profile.username}</span>}
                <p className="connection-profile-location">
                  {location}{age ? ` · Age ${age}` : ''}
                </p>
                {relationshipStatus === 'pending' && profile.avatar_path && profile.avatar_visibility === 'connections' && (
                  <span className="connection-profile-photo-note">Photo shared after you become pen pals</span>
                )}
              </div>
            </header>

            <div className="connection-profile-body">
              <section className="connection-profile-about">
                <h3>About {profile.display_name || 'this member'}</h3>
                <p>{profile.about_me?.trim() || 'This member has not added an About Me yet.'}</p>
              </section>

              <div className="connection-profile-grid">
                <section>
                  <h3>Interests</h3>
                  {interests.length ? (
                    <div className="connection-profile-tags">
                      {interests.map((interest) => <span key={interest.id}>{interest.name}</span>)}
                    </div>
                  ) : <p className="connection-profile-muted">No interests listed.</p>}
                </section>

                <section>
                  <h3>Looking for</h3>
                  {goals.length ? (
                    <div className="connection-profile-tags">
                      {goals.map((goal) => <span key={goal}>{goalLabels[goal] || goal}</span>)}
                    </div>
                  ) : <p className="connection-profile-muted">No friendship goals listed.</p>}
                </section>
              </div>

              <section className="connection-profile-writing">
                <h3>Correspondence style</h3>
                <div className="connection-profile-facts">
                  <article><span>Letter style</span><strong>{styleLabels[profile.communication_style || ''] || 'Not specified'}</strong></article>
                  <article><span>Preferred rhythm</span><strong>{frequencyLabels[profile.correspondence_frequency || ''] || 'Not specified'}</strong></article>
                  <article><span>Languages</span><strong>{languages.length ? languages.join(', ') : 'Not specified'}</strong></article>
                </div>
              </section>
            </div>

            <footer className="connection-profile-actions">
              <button className="primary" type="button" onClick={onClose}>Back to connections</button>
              <button className="secondary" type="button" onClick={onSafety}>Safety</button>
            </footer>
          </>
        )}
      </section>
    </div>
  )
}

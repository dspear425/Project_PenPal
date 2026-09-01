import { useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import Discover from './components/Discover'
import Connections from './components/Connections'
import ProfileAvatar from './components/ProfileAvatar'
import './discover.css'
import './connections.css'

type Mode = 'welcome' | 'signup' | 'signin' | 'onboarding' | 'home' | 'discover' | 'connections'
type CorrespondenceMethod = 'digital' | 'both' | 'snail_mail'

type Interest = {
  id: number
  slug: string
  name: string
}

type Profile = {
  display_name: string | null
  birth_year: number | null
  country: string | null
  region: string | null
  about_me: string | null
  languages: string[]
  friendship_goals: string[]
  communication_style: string | null
  correspondence_frequency: string | null
  correspondence_method: CorrespondenceMethod
  international_snail_mail: boolean
  accepting_new_penpals: boolean
  max_penpals: number
  onboarding_complete: boolean
}

type ProfileDraft = {
  profile: Profile
  selectedInterests: number[]
  savedAt: string
}

const currentYear = new Date().getFullYear()

const goalOptions = [
  ['long-term', 'Long-term friendship'],
  ['casual', 'Casual correspondence'],
  ['culture', 'Cultural exchange'],
  ['language', 'Language exchange'],
  ['snail-mail', 'Snail-mail friendship'],
  ['local', 'Local friendship'],
  ['international', 'International friendship'],
]

const emptyProfile: Profile = {
  display_name: '',
  birth_year: null,
  country: '',
  region: '',
  about_me: '',
  languages: ['English'],
  friendship_goals: ['long-term', 'international'],
  communication_style: 'long',
  correspondence_frequency: 'weekly',
  correspondence_method: 'digital',
  international_snail_mail: false,
  accepting_new_penpals: true,
  max_penpals: 3,
  onboarding_complete: false,
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return String(error || 'Unknown error')
}

function draftKey(userId: string) {
  return `project-penpal:profile-draft:${userId}`
}

function editModeKey(userId: string) {
  return `project-penpal:editing-profile:${userId}`
}

function correspondenceMethodLabel(value: CorrespondenceMethod) {
  if (value === 'both') return 'Digital + snail mail'
  if (value === 'snail_mail') return 'Snail mail preferred'
  return 'Digital letters'
}

export default function AppV6() {
  const [mode, setMode] = useState<Mode>('welcome')
  const [session, setSession] = useState<Session | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [interests, setInterests] = useState<Interest[]>([])
  const [selectedInterests, setSelectedInterests] = useState<number[]>([])
  const [profile, setProfile] = useState<Profile>(emptyProfile)
  const [draftReady, setDraftReady] = useState(false)
  const [attentionCount, setAttentionCount] = useState(0)
  const [pendingRequestCount, setPendingRequestCount] = useState(0)
  const [unreadLetterCount, setUnreadLetterCount] = useState(0)
  const [dashboardAvatarPath, setDashboardAvatarPath] = useState<string | null>(null)
  const loadedUserId = useRef<string | null>(null)

  const age = useMemo(
    () => (profile.birth_year ? currentYear - profile.birth_year : null),
    [profile.birth_year],
  )

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      if (data.session) {
        loadedUserId.current = data.session.user.id
        void loadUser(data.session)
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return
      setSession(nextSession)

      if (!nextSession) {
        loadedUserId.current = null
        setMode('welcome')
        setProfile(emptyProfile)
        setInterests([])
        setSelectedInterests([])
        setDraftReady(false)
        setAttentionCount(0)
        setPendingRequestCount(0)
        setUnreadLetterCount(0)
        setDashboardAvatarPath(null)
        return
      }

      // Token refreshes and tab-focus auth events should never overwrite unsaved form state.
      if (event === 'SIGNED_IN' && loadedUserId.current !== nextSession.user.id) {
        loadedUserId.current = nextSession.user.id
        void loadUser(nextSession)
      }
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const onPhotoChange = (event: Event) => {
      const detail = (event as CustomEvent<{ avatarPath?: string | null }>).detail
      setDashboardAvatarPath(detail?.avatarPath ?? null)
    }
    window.addEventListener('project-penpal:profile-photo-changed', onPhotoChange)
    return () => window.removeEventListener('project-penpal:profile-photo-changed', onPhotoChange)
  }, [])

  useEffect(() => {
    if (!session || mode !== 'onboarding' || !draftReady) return

    const timer = window.setTimeout(() => {
      const draft: ProfileDraft = {
        profile,
        selectedInterests,
        savedAt: new Date().toISOString(),
      }
      localStorage.setItem(draftKey(session.user.id), JSON.stringify(draft))
      sessionStorage.setItem(editModeKey(session.user.id), 'true')
    }, 250)

    return () => window.clearTimeout(timer)
  }, [session, mode, profile, selectedInterests, draftReady])

  useEffect(() => {
    if (!session || mode !== 'home') return

    const refreshDashboard = () => {
      void loadDashboardAttention(session.user.id)
      void loadDashboardAvatar(session.user.id)
    }
    refreshDashboard()

    // If a request, letter, or moderation/photo change happens while the member
    // is signed in, refresh when they return to the tab and periodically.
    window.addEventListener('focus', refreshDashboard)
    const timer = window.setInterval(refreshDashboard, 60000)

    return () => {
      window.removeEventListener('focus', refreshDashboard)
      window.clearInterval(timer)
    }
  }, [session, mode])

  async function loadDashboardAvatar(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('avatar_path')
      .eq('id', userId)
      .maybeSingle()
    if (!error) setDashboardAvatarPath(data?.avatar_path ?? null)
  }

  async function loadDashboardAttention(userId: string) {
    const [requestResult, letterResult] = await Promise.all([
      supabase
        .from('penpal_requests')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', userId)
        .eq('status', 'pending'),
      supabase
        .from('letters')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', userId)
        .is('read_at', null),
    ])

    const requests = requestResult.error ? 0 : (requestResult.count ?? 0)
    const letters = letterResult.error ? 0 : (letterResult.count ?? 0)

    setPendingRequestCount(requests)
    setUnreadLetterCount(letters)
    setAttentionCount(requests + letters)
  }

  async function loadUser(activeSession: Session) {
    setBusy(true)
    setMessage('')
    setDraftReady(false)

    const notices: string[] = []

    try {
      const { data: interestData, error: interestError } = await supabase
        .from('interests')
        .select('id, slug, name')
        .order('name')

      if (interestError) {
        notices.push(`Interest catalog: ${errorMessage(interestError)}`)
      } else {
        setInterests(interestData ?? [])
        if (!interestData?.length) notices.push('Interest catalog is empty in Supabase.')
      }

      let { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', activeSession.user.id)
        .maybeSingle()

      if (profileError) throw new Error(`Profile read: ${errorMessage(profileError)}`)

      if (!profileData) {
        const { data: createdProfile, error: createError } = await supabase
          .from('profiles')
          .insert({ id: activeSession.user.id })
          .select('*')
          .single()

        if (createError) throw new Error(`Profile creation: ${errorMessage(createError)}`)
        profileData = createdProfile
      }

      setDashboardAvatarPath(profileData.avatar_path ?? null)

      const loadedProfile: Profile = {
        display_name: profileData.display_name ?? '',
        birth_year: profileData.birth_year,
        country: profileData.country ?? '',
        region: profileData.region ?? '',
        about_me: profileData.about_me ?? '',
        languages: profileData.languages?.length ? profileData.languages : ['English'],
        friendship_goals: profileData.friendship_goals?.length
          ? profileData.friendship_goals
          : ['long-term', 'international'],
        communication_style: profileData.communication_style ?? 'long',
        correspondence_frequency: profileData.correspondence_frequency ?? 'weekly',
        correspondence_method: (profileData.correspondence_method ?? 'digital') as CorrespondenceMethod,
        international_snail_mail: profileData.international_snail_mail ?? false,
        accepting_new_penpals: profileData.accepting_new_penpals ?? true,
        max_penpals: profileData.max_penpals ?? 3,
        onboarding_complete: profileData.onboarding_complete ?? false,
      }

      const { data: chosen, error: chosenError } = await supabase
        .from('profile_interests')
        .select('interest_id')
        .eq('profile_id', activeSession.user.id)

      if (chosenError) notices.push(`Selected interests: ${errorMessage(chosenError)}`)
      const savedInterests = chosenError ? [] : (chosen ?? []).map((item) => Number(item.interest_id))

      const wasEditing = sessionStorage.getItem(editModeKey(activeSession.user.id)) === 'true'
      const shouldResumeDraft = !loadedProfile.onboarding_complete || wasEditing
      let nextProfile = loadedProfile
      let nextInterests = savedInterests

      if (shouldResumeDraft) {
        const rawDraft = localStorage.getItem(draftKey(activeSession.user.id))
        if (rawDraft) {
          try {
            const draft = JSON.parse(rawDraft) as ProfileDraft
            if (draft?.profile && Array.isArray(draft.selectedInterests)) {
              nextProfile = { ...loadedProfile, ...draft.profile }
              nextInterests = draft.selectedInterests.map(Number)
            }
          } catch {
            localStorage.removeItem(draftKey(activeSession.user.id))
          }
        }
      } else {
        localStorage.removeItem(draftKey(activeSession.user.id))
      }

      setProfile(nextProfile)
      setSelectedInterests(nextInterests)
      setDraftReady(true)

      if (!loadedProfile.onboarding_complete || wasEditing) {
        setMode('onboarding')
        sessionStorage.setItem(editModeKey(activeSession.user.id), 'true')
      } else {
        setMode('home')
      }

      if (notices.length) setMessage(notices.join(' • '))
    } catch (error) {
      setMessage(errorMessage(error))
      setMode('onboarding')
      setDraftReady(true)
    } finally {
      setBusy(false)
    }
  }

  function openProfileEditor() {
    if (session) {
      const draft: ProfileDraft = {
        profile,
        selectedInterests,
        savedAt: new Date().toISOString(),
      }
      localStorage.setItem(draftKey(session.user.id), JSON.stringify(draft))
      sessionStorage.setItem(editModeKey(session.user.id), 'true')
    }
    setMessage('')
    setDraftReady(true)
    setMode('onboarding')
  }

  async function submitAuth(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage('')

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setMessage('Account created. Check your email to verify your address, then sign in.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  function toggleGoal(goal: string) {
    setProfile((previous) => {
      const adding = !previous.friendship_goals.includes(goal)
      return {
        ...previous,
        friendship_goals: adding
          ? [...previous.friendship_goals, goal]
          : previous.friendship_goals.filter((item) => item !== goal),
        correspondence_method: goal === 'snail-mail' && adding && previous.correspondence_method === 'digital'
          ? 'both'
          : previous.correspondence_method,
      }
    })
  }

  function toggleInterest(id: number) {
    setSelectedInterests((previous) =>
      previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id],
    )
  }

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault()
    if (!session) return

    if (!profile.birth_year || age === null || age < 18) {
      setMessage('Project PenPal is currently limited to adults age 18 and older.')
      return
    }

    if (!profile.display_name?.trim() || !profile.country?.trim()) {
      setMessage('Please add a display name and country.')
      return
    }

    if (profile.friendship_goals.length === 0 || selectedInterests.length < 3) {
      setMessage('Choose at least one friendship goal and three interests so matching can work well.')
      return
    }

    setBusy(true)
    setMessage('')

    try {
      const { error: profileError } = await supabase.from('profiles').upsert(
        {
          id: session.user.id,
          display_name: profile.display_name.trim(),
          birth_year: profile.birth_year,
          country: profile.country.trim(),
          region: profile.region?.trim() || null,
          about_me: profile.about_me?.trim() || null,
          languages: profile.languages,
          friendship_goals: profile.friendship_goals,
          communication_style: profile.communication_style,
          correspondence_frequency: profile.correspondence_frequency,
          accepting_new_penpals: profile.accepting_new_penpals,
          max_penpals: profile.max_penpals,
          onboarding_complete: true,
        },
        { onConflict: 'id' },
      )

      if (profileError) throw new Error(`Profile save: ${errorMessage(profileError)}`)

      const { error: snailMailError } = await supabase.rpc('save_snail_mail_preferences', {
        preference: profile.correspondence_method,
        international_ok: profile.correspondence_method === 'digital' ? false : profile.international_snail_mail,
      })
      if (snailMailError) throw new Error(`Snail-mail preference: ${errorMessage(snailMailError)}`)

      const { error: deleteError } = await supabase
        .from('profile_interests')
        .delete()
        .eq('profile_id', session.user.id)

      if (deleteError) throw new Error(`Interest reset: ${errorMessage(deleteError)}`)

      const { error: insertError } = await supabase.from('profile_interests').insert(
        selectedInterests.map((interestId) => ({
          profile_id: session.user.id,
          interest_id: interestId,
        })),
      )

      if (insertError) throw new Error(`Interest save: ${errorMessage(insertError)}`)

      localStorage.removeItem(draftKey(session.user.id))
      sessionStorage.removeItem(editModeKey(session.user.id))
      setProfile((previous) => ({
        ...previous,
        international_snail_mail: previous.correspondence_method === 'digital' ? false : previous.international_snail_mail,
        onboarding_complete: true,
      }))
      setMode('home')
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  if (mode === 'discover' && session) {
    return (
      <Discover
        userId={session.user.id}
        currentProfile={profile}
        currentInterestIds={selectedInterests}
        interestCatalog={interests}
        onBack={() => setMode('home')}
        onConnections={() => setMode('connections')}
        onEditProfile={openProfileEditor}
        onSignOut={() => void signOut()}
      />
    )
  }

  if (mode === 'connections' && session) {
    return (
      <Connections
        userId={session.user.id}
        onBack={() => setMode('home')}
        onDiscover={() => setMode('discover')}
        onEditProfile={openProfileEditor}
        onSignOut={() => void signOut()}
      />
    )
  }

  if (mode === 'home') {
    const requestLabel = pendingRequestCount === 1 ? '1 pending request' : `${pendingRequestCount} pending requests`
    const letterLabel = unreadLetterCount === 1 ? '1 unread letter' : `${unreadLetterCount} unread letters`
    const attentionLabel = attentionCount > 0
      ? `Pen pals and requests, ${requestLabel}, ${letterLabel}`
      : 'Pen pals and requests'

    return (
      <main className="page-shell">
        <section className="hero-card dashboard-card">
          <div className="dashboard-topline">
            <div className="brand-row compact-brand">
              <div className="stamp" aria-hidden="true">✉</div>
              <span className="brand-name">Project PenPal</span>
            </div>
            <button className="secondary" onClick={signOut}>Sign out</button>
          </div>
          <div className="dashboard-welcome-row">
            <ProfileAvatar avatarPath={dashboardAvatarPath} displayName={profile.display_name} size="large" className="dashboard-welcome-avatar" />
            <div>
              <p className="eyebrow">Your correspondence begins here</p>
              <h1 className="dashboard-title">Welcome, {profile.display_name}.</h1>
            </div>
          </div>
          <p className="hero-copy">
            Discover compatible people, manage your pen-pal requests, and build friendships one letter at a time.
          </p>
          <div className="profile-summary">
            <article><strong>{profile.country}</strong><span>{profile.region || 'Region kept private'}</span></article>
            <article><strong>{selectedInterests.length}</strong><span>interests selected</span></article>
            <article><strong>{profile.max_penpals}</strong><span>pen-pal capacity · {correspondenceMethodLabel(profile.correspondence_method)}</span></article>
          </div>
          <div className="actions dashboard-actions">
            <button className="primary" onClick={() => setMode('discover')}>Discover matches</button>
            <button
              className={`secondary request-dashboard-button ${attentionCount > 0 ? 'has-notification' : ''}`}
              onClick={() => setMode('connections')}
              aria-label={attentionLabel}
              title={attentionCount > 0 ? `${requestLabel}; ${letterLabel}` : undefined}
            >
              <span>Pen pals & requests</span>
              {attentionCount > 0 && (
                <span className="request-notification-badge" aria-hidden="true">
                  {attentionCount > 99 ? '99+' : attentionCount}
                </span>
              )}
            </button>
            <button className="secondary" onClick={openProfileEditor}>Edit profile</button>
          </div>
        </section>
      </main>
    )
  }

  if (mode === 'onboarding') {
    return (
      <main className="page-shell onboarding-shell">
        <section className="hero-card onboarding-card">
          <div className="dashboard-topline">
            <div className="brand-row compact-brand">
              <div className="stamp" aria-hidden="true">✉</div>
              <span className="brand-name">Project PenPal</span>
            </div>
            <button className="text-button top-signout" onClick={signOut}>Sign out</button>
          </div>

          <p className="eyebrow">Build your pen-pal profile</p>
          <h1 className="onboarding-title">Tell future friends a little about you.</h1>
          <p className="hero-copy compact">
            We only ask for information that helps people match. Exact location and private contact details stay out of your public profile.
          </p>
          <p className="draft-note">Your unfinished changes are saved on this device automatically.</p>

          {message && <p className="status-message">{message}</p>}

          <form className="onboarding-form" onSubmit={saveProfile}>
            <section className="form-section">
              <div className="section-heading"><span>01</span><div><h2>Basics</h2><p>What other members will see first.</p></div></div>
              <div className="two-column">
                <label>Display name<input value={profile.display_name ?? ''} maxLength={40} onChange={(event) => setProfile({ ...profile, display_name: event.target.value })} required /></label>
                <label>Birth year<input type="number" min="1900" max={currentYear - 18} value={profile.birth_year ?? ''} onChange={(event) => setProfile({ ...profile, birth_year: Number(event.target.value) || null })} required /></label>
                <label>Country<input value={profile.country ?? ''} onChange={(event) => setProfile({ ...profile, country: event.target.value })} placeholder="United States" required /></label>
                <label>State / region <span className="optional">optional</span><input value={profile.region ?? ''} onChange={(event) => setProfile({ ...profile, region: event.target.value })} placeholder="Alabama" /></label>
              </div>
              <label>About me<textarea maxLength={2000} rows={6} value={profile.about_me ?? ''} onChange={(event) => setProfile({ ...profile, about_me: event.target.value })} placeholder="What would you want a potential pen pal to know about you?" /></label>
            </section>

            <section className="form-section">
              <div className="section-heading"><span>02</span><div><h2>What are you looking for?</h2><p>Select everything that fits.</p></div></div>
              <div className="choice-grid">
                {goalOptions.map(([value, label]) => (
                  <button key={value} type="button" className={`choice ${profile.friendship_goals.includes(value) ? 'selected' : ''}`} onClick={() => toggleGoal(value)}>{label}</button>
                ))}
              </div>
            </section>

            <section className="form-section">
              <div className="section-heading"><span>03</span><div><h2>Interests</h2><p>Choose at least three. These will power compatibility matching.</p></div></div>
              <div className="interest-grid">
                {interests.map((interest) => (
                  <button key={interest.id} type="button" className={`choice small ${selectedInterests.includes(interest.id) ? 'selected' : ''}`} onClick={() => toggleInterest(interest.id)}>{interest.name}</button>
                ))}
              </div>
            </section>

            <section className="form-section">
              <div className="section-heading"><span>04</span><div><h2>How do you like to write?</h2><p>Matching communication styles should reduce disappointing connections.</p></div></div>
              <div className="two-column">
                <label>Letter style<select value={profile.communication_style ?? 'long'} onChange={(event) => setProfile({ ...profile, communication_style: event.target.value })}><option value="short">Short messages</option><option value="medium">Medium-length messages</option><option value="long">Long letters</option><option value="any">Anything</option></select></label>
                <label>Preferred frequency<select value={profile.correspondence_frequency ?? 'weekly'} onChange={(event) => setProfile({ ...profile, correspondence_frequency: event.target.value })}><option value="several_week">Several times a week</option><option value="weekly">About weekly</option><option value="biweekly">Every couple of weeks</option><option value="monthly">About monthly</option><option value="flexible">Flexible</option></select></label>
                <label>Correspondence format<select value={profile.correspondence_method} onChange={(event) => {
                  const next = event.target.value as CorrespondenceMethod
                  setProfile({ ...profile, correspondence_method: next, international_snail_mail: next === 'digital' ? false : profile.international_snail_mail })
                }}><option value="digital">Digital letters only</option><option value="both">Digital + snail mail</option><option value="snail_mail">Snail mail preferred</option></select><span className="field-help">Mailing addresses are never public and are shared only after mutual consent with an established pen pal.</span></label>
                <label>Pen-pal capacity<select value={profile.max_penpals} onChange={(event) => setProfile({ ...profile, max_penpals: Number(event.target.value) })}>{[1,2,3,4,5,6,7,8,9,10].map((number) => <option key={number} value={number}>{number}</option>)}</select></label>
                <label>Language(s)<input value={profile.languages.join(', ')} onChange={(event) => setProfile({ ...profile, languages: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} placeholder="English, Spanish" /></label>
              </div>
              {profile.correspondence_method !== 'digital' && (
                <label className="check-row"><input type="checkbox" checked={profile.international_snail_mail} onChange={(event) => setProfile({ ...profile, international_snail_mail: event.target.checked })} /> I’m open to exchanging physical letters with pen pals in other countries.</label>
              )}
              <label className="check-row"><input type="checkbox" checked={profile.accepting_new_penpals} onChange={(event) => setProfile({ ...profile, accepting_new_penpals: event.target.checked })} /> I’m currently accepting new pen pals.</label>
            </section>

            <div className="save-row">
              <button className="primary" type="submit" disabled={busy}>{busy ? 'Saving…' : profile.onboarding_complete ? 'Save profile' : 'Finish profile'}</button>
              <span>Your email address and mailing address are never displayed publicly.</span>
            </div>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="page-shell">
      <section className="hero-card">
        <div className="brand-row">
          <div className="stamp" aria-hidden="true">✉</div>
          <span className="brand-name">Project PenPal</span>
        </div>

        {mode === 'welcome' ? (
          <>
            <p className="eyebrow">Friendship-first correspondence</p>
            <h1>Friendships worth writing for.</h1>
            <p className="hero-copy">Meet people around the world who want genuine platonic friendship, meaningful conversation, and letters that are worth opening — on screen or in the mailbox.</p>
            <div className="actions">
              <button className="primary" onClick={() => setMode('signup')}>Create account</button>
              <button className="secondary" onClick={() => setMode('signin')}>Sign in</button>
            </div>
            <div className="feature-grid">
              <article><strong>Better matches</strong><span>Interests, friendship goals, communication style, and correspondence preferences.</span></article>
              <article><strong>Letters, not feeds</strong><span>A calmer space built around real one-to-one correspondence.</span></article>
              <article><strong>Digital or handwritten</strong><span>Build trust here, then exchange mailing addresses only when both pen pals choose to.</span></article>
            </div>
          </>
        ) : (
          <>
            <button className="back" onClick={() => { setMode('welcome'); setMessage('') }}>← Back</button>
            <p className="eyebrow">{mode === 'signup' ? 'Join the beta' : 'Welcome back'}</p>
            <h1>{mode === 'signup' ? 'Create your account.' : 'Sign in.'}</h1>
            <p className="hero-copy compact">{mode === 'signup' ? 'We’ll start with email verification. Your pen-pal profile comes next.' : 'Sign in to continue your correspondence.'}</p>
            <form className="auth-form" onSubmit={submitAuth}>
              <label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
              <label>Password<input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
              <button className="primary" type="submit" disabled={busy}>{busy ? 'Working…' : mode === 'signup' ? 'Create account' : 'Sign in'}</button>
            </form>
            {message && <p className="status-message">{message}</p>}
            <button className="text-button" onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setMessage('') }}>{mode === 'signup' ? 'Already have an account? Sign in' : 'Need an account? Create one'}</button>
          </>
        )}
      </section>
    </main>
  )
}

import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'

type Mode = 'welcome' | 'signup' | 'signin' | 'onboarding' | 'home'

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
  accepting_new_penpals: boolean
  max_penpals: number
  onboarding_complete: boolean
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

export default function App() {
  const [mode, setMode] = useState<Mode>('welcome')
  const [session, setSession] = useState<Session | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [interests, setInterests] = useState<Interest[]>([])
  const [selectedInterests, setSelectedInterests] = useState<number[]>([])
  const [profile, setProfile] = useState<Profile>({
    display_name: '',
    birth_year: null,
    country: '',
    region: '',
    about_me: '',
    languages: ['English'],
    friendship_goals: ['long-term', 'international'],
    communication_style: 'long',
    correspondence_frequency: 'weekly',
    accepting_new_penpals: true,
    max_penpals: 3,
    onboarding_complete: false,
  })

  const age = useMemo(() => profile.birth_year ? currentYear - profile.birth_year : null, [profile.birth_year])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) loadUser(data.session)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (nextSession) loadUser(nextSession)
      else setMode('welcome')
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function loadUser(activeSession: Session) {
    setBusy(true)
    setMessage('')
    try {
      const [{ data: profileData, error: profileError }, { data: interestData, error: interestError }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', activeSession.user.id).single(),
        supabase.from('interests').select('id, slug, name').order('name'),
      ])

      if (profileError) throw profileError
      if (interestError) throw interestError

      const { data: chosen, error: chosenError } = await supabase
        .from('profile_interests')
        .select('interest_id')
        .eq('profile_id', activeSession.user.id)

      if (chosenError) throw chosenError

      setProfile({
        display_name: profileData.display_name ?? '',
        birth_year: profileData.birth_year,
        country: profileData.country ?? '',
        region: profileData.region ?? '',
        about_me: profileData.about_me ?? '',
        languages: profileData.languages?.length ? profileData.languages : ['English'],
        friendship_goals: profileData.friendship_goals?.length ? profileData.friendship_goals : ['long-term', 'international'],
        communication_style: profileData.communication_style ?? 'long',
        correspondence_frequency: profileData.correspondence_frequency ?? 'weekly',
        accepting_new_penpals: profileData.accepting_new_penpals,
        max_penpals: profileData.max_penpals ?? 3,
        onboarding_complete: profileData.onboarding_complete,
      })
      setInterests(interestData ?? [])
      setSelectedInterests((chosen ?? []).map((item) => item.interest_id))
      setMode(profileData.onboarding_complete ? 'home' : 'onboarding')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load your profile.')
      setMode('onboarding')
    } finally {
      setBusy(false)
    }
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
      setMessage(error instanceof Error ? error.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  function toggleGoal(goal: string) {
    setProfile((prev) => ({
      ...prev,
      friendship_goals: prev.friendship_goals.includes(goal)
        ? prev.friendship_goals.filter((item) => item !== goal)
        : [...prev.friendship_goals, goal],
    }))
  }

  function toggleInterest(id: number) {
    setSelectedInterests((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id])
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
      const { error: profileError } = await supabase.from('profiles').update({
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
      }).eq('id', session.user.id)

      if (profileError) throw profileError

      const { error: deleteError } = await supabase.from('profile_interests').delete().eq('profile_id', session.user.id)
      if (deleteError) throw deleteError

      const { error: insertError } = await supabase.from('profile_interests').insert(
        selectedInterests.map((interestId) => ({ profile_id: session.user.id, interest_id: interestId }))
      )
      if (insertError) throw insertError

      setProfile((prev) => ({ ...prev, onboarding_complete: true }))
      setMode('home')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save your profile.')
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  if (mode === 'home') {
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
          <p className="eyebrow">Your correspondence begins here</p>
          <h1 className="dashboard-title">Welcome, {profile.display_name}.</h1>
          <p className="hero-copy">Your profile is ready. Next we’ll build Discover, compatibility matching, pen-pal requests, and your letter inbox.</p>
          <div className="profile-summary">
            <article><strong>{profile.country}</strong><span>{profile.region || 'Region kept private'}</span></article>
            <article><strong>{selectedInterests.length}</strong><span>interests selected</span></article>
            <article><strong>{profile.max_penpals}</strong><span>pen-pal capacity</span></article>
          </div>
          <button className="secondary edit-profile" onClick={() => setMode('onboarding')}>Edit profile</button>
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
          <p className="hero-copy compact">We only ask for information that helps people match. Exact location and private contact details stay out of your public profile.</p>

          {message && <p className="status-message">{message}</p>}

          <form className="onboarding-form" onSubmit={saveProfile}>
            <section className="form-section">
              <div className="section-heading"><span>01</span><div><h2>Basics</h2><p>What other members will see first.</p></div></div>
              <div className="two-column">
                <label>Display name<input value={profile.display_name ?? ''} maxLength={40} onChange={(e) => setProfile({ ...profile, display_name: e.target.value })} required /></label>
                <label>Birth year<input type="number" min="1900" max={currentYear - 18} value={profile.birth_year ?? ''} onChange={(e) => setProfile({ ...profile, birth_year: Number(e.target.value) || null })} required /></label>
                <label>Country<input value={profile.country ?? ''} onChange={(e) => setProfile({ ...profile, country: e.target.value })} placeholder="United States" required /></label>
                <label>State / region <span className="optional">optional</span><input value={profile.region ?? ''} onChange={(e) => setProfile({ ...profile, region: e.target.value })} placeholder="Alabama" /></label>
              </div>
              <label>About me<textarea maxLength={2000} rows={6} value={profile.about_me ?? ''} onChange={(e) => setProfile({ ...profile, about_me: e.target.value })} placeholder="What would you want a potential pen pal to know about you?" /></label>
            </section>

            <section className="form-section">
              <div className="section-heading"><span>02</span><div><h2>What are you looking for?</h2><p>Select everything that fits.</p></div></div>
              <div className="choice-grid">
                {goalOptions.map(([value, label]) => <button key={value} type="button" className={`choice ${profile.friendship_goals.includes(value) ? 'selected' : ''}`} onClick={() => toggleGoal(value)}>{label}</button>)}
              </div>
            </section>

            <section className="form-section">
              <div className="section-heading"><span>03</span><div><h2>Interests</h2><p>Choose at least three. These will power compatibility matching.</p></div></div>
              <div className="interest-grid">
                {interests.map((interest) => <button key={interest.id} type="button" className={`choice small ${selectedInterests.includes(interest.id) ? 'selected' : ''}`} onClick={() => toggleInterest(interest.id)}>{interest.name}</button>)}
              </div>
            </section>

            <section className="form-section">
              <div className="section-heading"><span>04</span><div><h2>How do you like to write?</h2><p>Matching communication styles should reduce disappointing connections.</p></div></div>
              <div className="two-column">
                <label>Letter style<select value={profile.communication_style ?? 'long'} onChange={(e) => setProfile({ ...profile, communication_style: e.target.value })}><option value="short">Short messages</option><option value="medium">Medium-length messages</option><option value="long">Long letters</option><option value="any">Anything</option></select></label>
                <label>Preferred frequency<select value={profile.correspondence_frequency ?? 'weekly'} onChange={(e) => setProfile({ ...profile, correspondence_frequency: e.target.value })}><option value="several_week">Several times a week</option><option value="weekly">About weekly</option><option value="biweekly">Every couple of weeks</option><option value="monthly">About monthly</option><option value="flexible">Flexible</option></select></label>
                <label>Pen-pal capacity<select value={profile.max_penpals} onChange={(e) => setProfile({ ...profile, max_penpals: Number(e.target.value) })}>{[1,2,3,4,5,6,7,8,9,10].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
                <label>Language(s)<input value={profile.languages.join(', ')} onChange={(e) => setProfile({ ...profile, languages: e.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} placeholder="English, Spanish" /></label>
              </div>
              <label className="check-row"><input type="checkbox" checked={profile.accepting_new_penpals} onChange={(e) => setProfile({ ...profile, accepting_new_penpals: e.target.checked })} /> I’m currently accepting new pen pals.</label>
            </section>

            <div className="save-row">
              <button className="primary" type="submit" disabled={busy}>{busy ? 'Saving…' : profile.onboarding_complete ? 'Save profile' : 'Finish profile'}</button>
              <span>Your email address is never displayed publicly.</span>
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
            <p className="hero-copy">Meet people around the world who want genuine platonic friendship, meaningful conversation, and letters that are worth opening.</p>
            <div className="actions"><button className="primary" onClick={() => setMode('signup')}>Create account</button><button className="secondary" onClick={() => setMode('signin')}>Sign in</button></div>
            <div className="feature-grid">
              <article><strong>Better matches</strong><span>Interests, friendship goals, and communication style.</span></article>
              <article><strong>Letters, not feeds</strong><span>A calmer space built around real one-to-one correspondence.</span></article>
              <article><strong>Platonic by design</strong><span>No follower counts, popularity contests, or dating-first mechanics.</span></article>
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

import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import AppV6 from './AppV6'
import AdminPanel from './components/AdminPanel'
import './admin.css'
import './admin-shell.css'

type ModeratorRole = 'moderator' | 'admin'
type AccountStatus = 'active' | 'suspended' | 'banned'

function formatDate(value: string | null) {
  if (!value) return null
  return new Intl.DateTimeFormat(undefined, {
    month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value))
}

export default function AppRoot() {
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<ModeratorRole | null>(null)
  const [accountStatus, setAccountStatus] = useState<AccountStatus>('active')
  const [suspendedUntil, setSuspendedUntil] = useState<string | null>(null)
  const [route, setRoute] = useState(window.location.hash)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let active = true

    async function initialize() {
      const { data } = await supabase.auth.getSession()
      if (!active) return
      setSession(data.session)
      if (data.session) await refreshSecurityState(data.session.user.id)
      else setChecking(false)
    }

    void initialize()

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return
      setSession(nextSession)
      if (nextSession) {
        if (event === 'SIGNED_IN') setChecking(true)
        void refreshSecurityState(nextSession.user.id)
      } else {
        setRole(null)
        setAccountStatus('active')
        setSuspendedUntil(null)
        setChecking(false)
        if (window.location.hash === '#admin') window.location.hash = ''
      }
    })

    const onHashChange = () => setRoute(window.location.hash)
    const onFocus = () => {
      void supabase.auth.getSession().then(({ data }) => {
        if (data.session) void refreshSecurityState(data.session.user.id)
      })
    }
    window.addEventListener('hashchange', onHashChange)
    window.addEventListener('focus', onFocus)
    const timer = window.setInterval(() => {
      void supabase.auth.getSession().then(({ data }) => {
        if (data.session) void refreshSecurityState(data.session.user.id)
      })
    }, 60000)

    return () => {
      active = false
      listener.subscription.unsubscribe()
      window.removeEventListener('hashchange', onHashChange)
      window.removeEventListener('focus', onFocus)
      window.clearInterval(timer)
    }
  }, [])

  async function refreshSecurityState(userId: string) {
    try {
      // This also clears a temporary suspension if its end time has passed.
      await supabase.rpc('refresh_my_account_status')

      const [profileResult, roleResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('account_status, suspended_until')
          .eq('id', userId)
          .maybeSingle(),
        supabase
          .from('admin_users')
          .select('role')
          .eq('user_id', userId)
          .maybeSingle(),
      ])

      if (!profileResult.error && profileResult.data) {
        setAccountStatus((profileResult.data.account_status || 'active') as AccountStatus)
        setSuspendedUntil(profileResult.data.suspended_until ?? null)
      }

      if (!roleResult.error && roleResult.data?.role) {
        setRole(roleResult.data.role as ModeratorRole)
      } else {
        setRole(null)
      }
    } finally {
      setChecking(false)
    }
  }

  function openAdmin() {
    window.location.hash = 'admin'
  }

  function closeAdmin() {
    window.location.hash = ''
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  if (checking && session) {
    return (
      <main className="page-shell">
        <section className="hero-card dashboard-card">
          <div className="brand-row compact-brand"><div className="stamp" aria-hidden="true">✉</div><span className="brand-name">Project PenPal</span></div>
          <p className="eyebrow">Checking account</p>
          <h1 className="dashboard-title">Opening your correspondence…</h1>
        </section>
      </main>
    )
  }

  if (route === '#admin' && session && role) {
    return <AdminPanel userId={session.user.id} role={role} onBack={closeAdmin} onSignOut={() => void signOut()} />
  }

  if (route === '#admin' && session && !role) {
    return (
      <main className="page-shell">
        <section className="hero-card dashboard-card">
          <div className="brand-row compact-brand"><div className="stamp" aria-hidden="true">✉</div><span className="brand-name">Project PenPal</span></div>
          <p className="eyebrow">Private administration</p>
          <h1 className="dashboard-title">Access unavailable.</h1>
          <p className="hero-copy">This account does not have permission to open the moderation dashboard.</p>
          <div className="actions"><button className="primary" onClick={closeAdmin}>Back to Project PenPal</button><button className="secondary" onClick={() => void signOut()}>Sign out</button></div>
        </section>
      </main>
    )
  }

  if (session && accountStatus !== 'active') {
    const until = formatDate(suspendedUntil)
    return (
      <main className="page-shell">
        <section className="hero-card dashboard-card account-restricted-card">
          <div className="dashboard-topline">
            <div className="brand-row compact-brand"><div className="stamp" aria-hidden="true">✉</div><span className="brand-name">Project PenPal</span></div>
            <button className="secondary" onClick={() => void signOut()}>Sign out</button>
          </div>
          <p className="eyebrow">Account status</p>
          <h1 className="dashboard-title">{accountStatus === 'banned' ? 'This account has been banned.' : 'This account is temporarily suspended.'}</h1>
          <p className="hero-copy">
            {accountStatus === 'banned'
              ? 'Normal Project PenPal features are unavailable for this account. If you believe this moderation decision was made in error, an appeal process will be added before public beta.'
              : `Normal Project PenPal features are temporarily unavailable${until ? ` until ${until}` : ''}. Your existing data is retained while the restriction is in place.`}
          </p>
          {role && <div className="actions"><button className="secondary" onClick={openAdmin}>Open moderation dashboard</button></div>}
        </section>
      </main>
    )
  }

  return (
    <>
      <AppV6 />
      {session && role && (
        <button className="admin-launcher" type="button" onClick={openAdmin} title="Open Project PenPal moderation dashboard">
          Admin
        </button>
      )}
    </>
  )
}

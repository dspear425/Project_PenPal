import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import AppV6 from './AppV6'
import AdminPanel from './components/AdminPanel'
import MemberNotices from './components/MemberNotices'
import SupportCenter from './components/SupportCenter'
import AdminQuickTools from './components/AdminQuickTools'
import AdminMemberDirectory from './components/AdminMemberDirectory'
import AdminActivity from './components/AdminActivity'
import AdminTeam from './components/AdminTeam'
import MemberIdentity from './components/MemberIdentity'
import SettingsPrivacy from './components/SettingsPrivacy'
import ProfilePhotoSettings from './components/ProfilePhotoSettings'
import PasswordRecovery from './components/PasswordRecovery'
import ForgotPassword from './components/ForgotPassword'
import './admin.css'
import './admin-shell.css'
import './member-notices.css'
import './support.css'
import './member-identity.css'
import './admin-directory.css'
import './admin-activity.css'
import './admin-team.css'
import './settings.css'
import './profile-photo.css'

type ModeratorRole = 'moderator' | 'admin' | 'owner'
type AccountStatus = 'active' | 'suspended' | 'banned'

type AdminSupportThread = {
  id: string
  moderator_last_read_at: string | null
}

type AdminSupportMessage = {
  thread_id: string
  created_at: string
}

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
  const [adminMessageCount, setAdminMessageCount] = useState(0)
  const [passwordRecovery, setPasswordRecovery] = useState(false)

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

      if (event === 'PASSWORD_RECOVERY' && nextSession) {
        setPasswordRecovery(true)
        setChecking(false)
        return
      }

      if (nextSession) {
        if (event === 'SIGNED_IN') setChecking(true)
        void refreshSecurityState(nextSession.user.id)
      } else {
        setRole(null)
        setAccountStatus('active')
        setSuspendedUntil(null)
        setAdminMessageCount(0)
        setPasswordRecovery(false)
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

  useEffect(() => {
    if (!session || !role || accountStatus !== 'active') {
      setAdminMessageCount(0)
      return
    }

    const refresh = () => void loadAdminMessageCount()
    refresh()
    window.addEventListener('focus', refresh)
    const timer = window.setInterval(refresh, 60000)

    return () => {
      window.removeEventListener('focus', refresh)
      window.clearInterval(timer)
    }
  }, [session?.user.id, role, route, accountStatus])

  async function loadAdminMessageCount() {
    const { data: threadRows, error: threadError } = await supabase
      .from('support_threads')
      .select('id, moderator_last_read_at')

    if (threadError || !threadRows?.length) {
      setAdminMessageCount(0)
      return
    }

    const threads = threadRows as AdminSupportThread[]
    const { data: messageRows, error: messageError } = await supabase
      .from('support_messages')
      .select('thread_id, created_at')
      .eq('sender_role', 'member')
      .in('thread_id', threads.map((thread) => thread.id))

    if (messageError) return

    const lastReadByThread = new Map(
      threads.map((thread) => [
        thread.id,
        thread.moderator_last_read_at ? new Date(thread.moderator_last_read_at).getTime() : 0,
      ]),
    )

    const unread = ((messageRows ?? []) as AdminSupportMessage[]).reduce((count, message) => {
      const lastRead = lastReadByThread.get(message.thread_id) ?? 0
      return new Date(message.created_at).getTime() > lastRead ? count + 1 : count
    }, 0)

    setAdminMessageCount(unread)
  }

  async function refreshSecurityState(userId: string) {
    try {
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
    setPasswordRecovery(false)
    await supabase.auth.signOut()
  }

  function finishPasswordRecovery() {
    setPasswordRecovery(false)
    window.history.replaceState({}, '', window.location.pathname)
  }

  if (passwordRecovery && session) {
    return <PasswordRecovery onComplete={finishPasswordRecovery} onSignOut={() => void signOut()} />
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

  if (route === '#admin' && session && role && accountStatus === 'active') {
    return (
      <div className={`admin-route staff-role-${role}`}>
        <AdminPanel userId={session.user.id} role={role === 'owner' ? 'admin' : role} onBack={closeAdmin} onSignOut={() => void signOut()} />
        <div className="admin-floating-toolbar">
          <AdminActivity />
          <AdminMemberDirectory userId={session.user.id} />
          <AdminQuickTools userId={session.user.id} />
          <AdminTeam currentUserId={session.user.id} role={role} />
        </div>
      </div>
    )
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
      <>
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
                ? 'Normal Project PenPal features are unavailable for this account. Open Account Notices for the moderation notice associated with this action, or Help to contact the moderation team.'
                : `Normal Project PenPal features are temporarily unavailable${until ? ` until ${until}` : ''}. Your existing data is retained while the restriction is in place. Open Account Notices for more information, or Help to contact the moderation team.`}
            </p>
            {role && <p className="hero-copy compact">Staff moderation privileges are unavailable while this account is restricted.</p>}
          </section>
        </main>
        <MemberNotices userId={session.user.id} />
        <SupportCenter userId={session.user.id} />
      </>
    )
  }

  return (
    <>
      <AppV6 />
      {!session && <ForgotPassword />}
      {session && <MemberIdentity userId={session.user.id} requireSetup showLauncher={false} />}
      {session && <ProfilePhotoSettings userId={session.user.id} />}
      {session && <SettingsPrivacy userId={session.user.id} isModerator={Boolean(role)} />}
      {session && <MemberNotices userId={session.user.id} />}
      {session && <SupportCenter userId={session.user.id} />}
      {session && role && accountStatus === 'active' && (
        <button
          className={`admin-launcher ${adminMessageCount > 0 ? 'has-admin-message' : ''}`}
          type="button"
          onClick={openAdmin}
          title={adminMessageCount > 0 ? `${adminMessageCount} unread member ${adminMessageCount === 1 ? 'message' : 'messages'}` : 'Open Project PenPal moderation dashboard'}
          aria-label={adminMessageCount > 0 ? `Admin, ${adminMessageCount} unread member ${adminMessageCount === 1 ? 'message' : 'messages'}` : 'Open Project PenPal moderation dashboard'}
        >
          <span>{role === 'owner' ? 'Owner' : role === 'admin' ? 'Admin' : 'Moderator'}</span>
          {adminMessageCount > 0 && <strong className="admin-message-badge">{adminMessageCount > 99 ? '99+' : adminMessageCount}</strong>}
        </button>
      )}
    </>
  )
}

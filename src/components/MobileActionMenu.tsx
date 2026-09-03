import { useEffect, useMemo, useState } from 'react'
import { getPwaInstallMode, promptPwaInstall } from '../pwa'
import { openLegalCenter } from '../lib/legalEvents'

type InstallMode = ReturnType<typeof getPwaInstallMode>

type AvailableTools = {
  photo: boolean
  settings: boolean
  help: boolean
  notices: boolean
  admin: boolean
}

const emptyTools: AvailableTools = {
  photo: false,
  settings: false,
  help: false,
  notices: false,
  admin: false,
}

function toolAvailable(selector: string) {
  return Boolean(document.querySelector(selector))
}

function activate(selector: string) {
  const element = document.querySelector<HTMLButtonElement>(selector)
  element?.click()
}

export default function MobileActionMenu() {
  const [open, setOpen] = useState(false)
  const [iosHelp, setIosHelp] = useState(false)
  const [tools, setTools] = useState<AvailableTools>(emptyTools)
  const [installMode, setInstallMode] = useState<InstallMode>(() => getPwaInstallMode())
  const [helpUnread, setHelpUnread] = useState(false)
  const [noticeUnread, setNoticeUnread] = useState(false)
  const [adminContext, setAdminContext] = useState(() => window.location.hash === '#admin')
  const [staffOnlyContext, setStaffOnlyContext] = useState(false)

  useEffect(() => {
    let scheduled = false

    const refresh = () => {
      scheduled = false
      setTools({
        photo: toolAvailable('.profile-photo-launcher'),
        settings: toolAvailable('.settings-launcher'),
        help: toolAvailable('.support-launcher'),
        notices: toolAvailable('.member-notice-launcher'),
        admin: toolAvailable('.admin-launcher'),
      })
      setHelpUnread(Boolean(document.querySelector('.support-launcher.has-unread-support')))
      setNoticeUnread(Boolean(document.querySelector('.member-notice-launcher.has-unread-notices')))
      setAdminContext(window.location.hash === '#admin' || toolAvailable('.admin-route'))
      setStaffOnlyContext(toolAvailable('.admin-route.staff-only'))
      setInstallMode(getPwaInstallMode())
    }

    const scheduleRefresh = () => {
      if (scheduled) return
      scheduled = true
      window.requestAnimationFrame(refresh)
    }

    refresh()
    const observer = new MutationObserver(scheduleRefresh)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
    window.addEventListener('focus', scheduleRefresh)
    window.addEventListener('hashchange', scheduleRefresh)
    window.addEventListener('project-penpal:pwa-install-state', scheduleRefresh)

    return () => {
      observer.disconnect()
      window.removeEventListener('focus', scheduleRefresh)
      window.removeEventListener('hashchange', scheduleRefresh)
      window.removeEventListener('project-penpal:pwa-install-state', scheduleRefresh)
    }
  }, [])

  const installAvailable = installMode === 'native' || installMode === 'ios'
  const memberShellAvailable = Object.values(tools).some(Boolean) || adminContext
  const visibleCount = useMemo(() => {
    return Object.values(tools).filter(Boolean).length + (memberShellAvailable ? 1 : 0) + (installAvailable ? 1 : 0) + (adminContext ? 1 : 0)
  }, [tools, memberShellAvailable, installAvailable, adminContext])

  function runTool(selector: string) {
    setOpen(false)
    window.setTimeout(() => activate(selector), 0)
  }

  async function install() {
    if (installMode === 'ios') {
      setIosHelp(true)
      setOpen(false)
      return
    }
    if (installMode === 'native') {
      setOpen(false)
      await promptPwaInstall()
      setInstallMode(getPwaInstallMode())
    }
  }

  if (visibleCount === 0) return null

  return (
    <>
      <div className={`mobile-action-menu ${open ? 'open' : ''} ${adminContext ? 'admin-context' : ''}`}>
        {open && (
          <>
            <button className="mobile-menu-backdrop" type="button" aria-label="Close menu" onClick={() => setOpen(false)} />
            <div className="mobile-menu-sheet" role="menu" aria-label="Project PenPal menu">
              <div className="mobile-menu-heading">
                <div><span>Project PenPal</span><strong>{adminContext ? 'Staff menu' : 'Quick actions'}</strong></div>
                <button type="button" aria-label="Close" onClick={() => setOpen(false)}>×</button>
              </div>

              {adminContext && !staffOnlyContext && (
                <button type="button" role="menuitem" onClick={() => { setOpen(false); window.location.hash = '' }}>
                  <span aria-hidden="true">←</span><div><strong>Back to Project PenPal</strong><small>Leave the moderation dashboard.</small></div>
                </button>
              )}
              {tools.photo && <button type="button" role="menuitem" onClick={() => runTool('.profile-photo-launcher')}><span aria-hidden="true">◎</span><div><strong>Profile photo</strong><small>Upload, crop, or change photo privacy.</small></div></button>}
              {tools.settings && <button type="button" role="menuitem" onClick={() => runTool('.settings-launcher')}><span aria-hidden="true">⚙</span><div><strong>Settings</strong><small>Privacy, security, notifications, and data.</small></div></button>}
              {tools.notices && <button type="button" role="menuitem" onClick={() => runTool('.member-notice-launcher')}><span aria-hidden="true">!</span><div><strong>Account notices {noticeUnread && <em>New</em>}</strong><small>Review moderation notices and account history.</small></div></button>}
              {tools.help && <button type="button" role="menuitem" onClick={() => runTool('.support-launcher')}><span aria-hidden="true">?</span><div><strong>Help {helpUnread && <em>New reply</em>}</strong><small>Search help, contact support, or report a bug.</small></div></button>}
              {memberShellAvailable && <button type="button" role="menuitem" onClick={() => { setOpen(false); openLegalCenter() }}><span aria-hidden="true">§</span><div><strong>Legal & safety</strong><small>Terms, privacy, community rules, and safety guidelines.</small></div></button>}
              {tools.admin && !adminContext && <button type="button" role="menuitem" onClick={() => runTool('.admin-launcher')}><span aria-hidden="true">◆</span><div><strong>Staff dashboard</strong><small>Open moderation and administration tools.</small></div></button>}
              {installAvailable && <button type="button" role="menuitem" onClick={() => void install()}><span aria-hidden="true">↓</span><div><strong>Install Project PenPal</strong><small>{installMode === 'ios' ? 'Add it to your Home Screen.' : 'Use it like an app on this device.'}</small></div></button>}
            </div>
          </>
        )}

        <button
          className="mobile-menu-trigger"
          type="button"
          aria-expanded={open}
          aria-label={open ? 'Close Project PenPal menu' : 'Open Project PenPal menu'}
          onClick={() => setOpen((value) => !value)}
        >
          <span aria-hidden="true">{open ? '×' : '☰'}</span>
          <strong>{open ? 'Close' : 'Menu'}</strong>
          {(helpUnread || noticeUnread) && !open && <i aria-hidden="true" />}
        </button>
      </div>

      {iosHelp && (
        <div className="mobile-install-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setIosHelp(false) }}>
          <section className="mobile-install-card" role="dialog" aria-modal="true" aria-labelledby="ios-install-title">
            <button className="mobile-install-close" type="button" aria-label="Close" onClick={() => setIosHelp(false)}>×</button>
            <span className="mobile-install-icon" aria-hidden="true">✉</span>
            <p className="eyebrow">Install Project PenPal</p>
            <h2 id="ios-install-title">Add it to your Home Screen.</h2>
            <p>In Safari, tap the <strong>Share</strong> button, scroll to <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>. Project PenPal will open in its own app-style window.</p>
            <button className="primary" type="button" onClick={() => setIosHelp(false)}>Got it</button>
          </section>
        </div>
      )}
    </>
  )
}

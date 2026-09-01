import type { HelpContext } from './lib/helpContent'

let lastContext: HelpContext | null = null
let scheduled = false

function detectContext(): HelpContext {
  if (document.querySelector('.settings-panel')) return 'settings'
  if (document.querySelector('.profile-photo-panel')) return 'photos'
  if (document.querySelector('.admin-route')) return 'admin'
  if (document.querySelector('.account-restricted-card')) return 'restricted'
  if (document.querySelector('.correspondence-view')) return 'correspondence'
  if (document.querySelector('.connections-card')) return 'connections'
  if (document.querySelector('.discover-card')) return 'discover'
  if (document.querySelector('.onboarding-card')) return 'profile'
  return 'dashboard'
}

function announceContext() {
  scheduled = false
  const context = detectContext()
  if (context === lastContext) return
  lastContext = context
  window.dispatchEvent(new CustomEvent('project-penpal:help-context', { detail: { context } }))
}

function scheduleContextCheck() {
  if (scheduled) return
  scheduled = true
  window.requestAnimationFrame(announceContext)
}

const observer = new MutationObserver(scheduleContextCheck)

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    observer.observe(document.body, { childList: true, subtree: true })
    scheduleContextCheck()
  }, { once: true })
} else {
  observer.observe(document.body, { childList: true, subtree: true })
  scheduleContextCheck()
}

window.addEventListener('hashchange', scheduleContextCheck)
window.addEventListener('project-penpal:profile-photo-changed', scheduleContextCheck)

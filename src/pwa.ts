type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

type InstallMode = 'native' | 'ios' | 'installed' | 'unavailable'

let deferredPrompt: BeforeInstallPromptEvent | null = null

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
}

function isIos() {
  const ua = window.navigator.userAgent
  const classicIos = /iphone|ipad|ipod/i.test(ua)
  const desktopClassIpad = /macintosh/i.test(ua) && window.navigator.maxTouchPoints > 1
  return classicIos || desktopClassIpad
}

export function getPwaInstallMode(): InstallMode {
  if (isStandalone()) return 'installed'
  if (deferredPrompt) return 'native'
  if (isIos()) return 'ios'
  return 'unavailable'
}

function announceInstallState() {
  window.dispatchEvent(new CustomEvent('project-penpal:pwa-install-state', {
    detail: { mode: getPwaInstallMode() },
  }))
}

export async function promptPwaInstall() {
  if (!deferredPrompt) return false

  const prompt = deferredPrompt
  deferredPrompt = null
  await prompt.prompt()
  const choice = await prompt.userChoice
  announceInstallState()
  return choice.outcome === 'accepted'
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault()
  deferredPrompt = event as BeforeInstallPromptEvent
  announceInstallState()
})

window.addEventListener('appinstalled', () => {
  deferredPrompt = null
  announceInstallState()
})

window.matchMedia('(display-mode: standalone)').addEventListener?.('change', announceInstallState)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('Project PenPal service worker registration failed.', error)
    })
  })
}

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export default function PublicEarlyAccessMessaging() {
  const [host, setHost] = useState<HTMLElement | null>(null)

  useEffect(() => {
    let currentHost: HTMLElement | null = null

    function refresh() {
      const authForm = document.querySelector('.auth-form')
      if (authForm) {
        const card = authForm.closest('.hero-card')
        const eyebrow = card?.querySelector('.eyebrow')
        if (eyebrow?.textContent?.trim() === 'Join the beta') eyebrow.textContent = 'Join Project PenPal'
      }

      const featureGrid = document.querySelector('.hero-card .feature-grid')
      if (!featureGrid) {
        if (currentHost?.isConnected) currentHost.remove()
        currentHost = null
        setHost(null)
        return
      }

      const card = featureGrid.closest('.hero-card')
      if (!card) return

      let nextHost = card.querySelector<HTMLElement>('.public-launch-host')
      if (!nextHost) {
        nextHost = document.createElement('div')
        nextHost.className = 'public-launch-host'
        featureGrid.insertAdjacentElement('afterend', nextHost)
      }
      currentHost = nextHost
      setHost(nextHost)
    }

    refresh()
    const observer = new MutationObserver(refresh)
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      if (currentHost?.isConnected) currentHost.remove()
    }
  }, [])

  if (!host) return null

  return createPortal(
    <section className="public-early-access-card" aria-label="Project PenPal public early access">
      <div className="public-early-access-topline">
        <span>Public early access</span>
        <small>18+ · Free to join</small>
      </div>
      <h2>Find people who could become part of your life.</h2>
      <p>
        Project PenPal is for meaningful platonic friendship—from traditional pen pals to supportive friendships and chosen family that grow naturally over time.
      </p>
      <div className="public-early-access-points">
        <span>Chosen family & supportive friendship</span>
        <span>Letters instead of feeds</span>
        <span>No swiping · no followers · no dating</span>
      </div>
      <div className="public-early-access-footer">
        <small className="public-early-access-note">Early access means we’re still improving the experience with member feedback while the community grows.</small>
        <a href="/about.html">Why Project PenPal? →</a>
      </div>
    </section>,
    host,
  )
}

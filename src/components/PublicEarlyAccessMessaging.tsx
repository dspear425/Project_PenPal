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
        const isSignup = Boolean(authForm.querySelector('input[autocomplete="new-password"]'))
        if (isSignup && eyebrow && eyebrow.textContent?.trim() !== 'Join OutKin') eyebrow.textContent = 'Join OutKin'
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

      const landingEyebrow = card.querySelector('.eyebrow')
      const landingHeading = card.querySelector('h1')
      if (landingEyebrow) landingEyebrow.textContent = 'LGBTQ+-rooted · friendship-first'
      if (landingHeading) landingHeading.textContent = 'Find your people. Build your chosen family.'

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
    <section className="public-early-access-card" aria-label="OutKin public early access">
      <div className="public-early-access-topline">
        <span>Public early access</span>
        <small>18+ · Free to join</small>
      </div>
      <h2>Family is also something we find.</h2>
      <p>
        OutKin is an LGBTQ+-rooted space for meaningful platonic friendship—from traditional pen pals to supportive friendships and chosen family that grow naturally over time.
      </p>
      <div className="public-early-access-points">
        <span>Chosen family & supportive friendship</span>
        <span>Letters instead of feeds</span>
        <span>No swiping · no followers · no dating</span>
      </div>
      <div className="public-early-access-footer">
        <small className="public-early-access-note">Early access means we’re still improving the experience with member feedback while the community grows.</small>
        <a href="/about.html">Why OutKin? →</a>
      </div>
    </section>,
    host,
  )
}

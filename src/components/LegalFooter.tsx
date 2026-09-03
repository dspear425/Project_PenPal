import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { openLegalCenter } from '../lib/legalEvents'

export default function LegalFooter() {
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    let active = true
    void supabase.auth.getSession().then(({ data }) => { if (active) setSession(data.session) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) setSession(nextSession)
    })
    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  if (session) return null

  return (
    <footer className="public-legal-footer" aria-label="Project PenPal policies">
      <span>Project PenPal · 18+</span>
      <button type="button" onClick={() => openLegalCenter('terms')}>Terms</button>
      <button type="button" onClick={() => openLegalCenter('privacy')}>Privacy</button>
      <button type="button" onClick={() => openLegalCenter('community')}>Community Guidelines</button>
      <button type="button" onClick={() => openLegalCenter('safety')}>Safety</button>
    </footer>
  )
}

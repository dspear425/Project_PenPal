import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { openLegalCenter } from '../lib/legalEvents'
import { type LegalDocumentKey } from '../lib/legalDocuments'

type LegalStatus = {
  document_key: LegalDocumentKey
  title: string
  current_version: string
  effective_date: string
  acceptance_required: boolean
  accepted_at: string | null
  needs_acceptance: boolean
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return String(error || 'Unknown error')
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T12:00:00`))
}

export default function LegalAcceptanceGate() {
  const [session, setSession] = useState<Session | null>(null)
  const [rows, setRows] = useState<LegalStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [message, setMessage] = useState('')

  const missing = useMemo(
    () => rows.filter((row) => row.acceptance_required && row.needs_acceptance),
    [rows],
  )

  useEffect(() => {
    let active = true

    const loadSession = async () => {
      const { data } = await supabase.auth.getSession()
      if (!active) return
      setSession(data.session)
      if (data.session) await loadStatus(data.session.user.id)
      else setLoading(false)
    }

    void loadSession()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      setSession(nextSession)
      setAcknowledged(false)
      setMessage('')
      if (nextSession) void loadStatus(nextSession.user.id)
      else {
        setRows([])
        setLoading(false)
      }
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  async function loadStatus(userId: string) {
    setLoading(true)
    setMessage('')
    try {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('account_status')
        .eq('id', userId)
        .maybeSingle()

      if (profileError) throw profileError
      if (profile?.account_status && profile.account_status !== 'active') {
        setRows([])
        return
      }

      const { data, error } = await supabase.rpc('get_my_legal_status')
      if (error) throw error
      setRows((data ?? []) as LegalStatus[])
    } catch (error) {
      setMessage(`Could not verify policy acceptance: ${errorMessage(error)}`)
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  async function accept() {
    if (!session || !acknowledged) return
    setWorking(true)
    setMessage('')
    try {
      const { error } = await supabase.rpc('accept_current_required_policies')
      if (error) throw error
      setAcknowledged(false)
      await loadStatus(session.user.id)
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setWorking(false)
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  if (!session || loading || missing.length === 0) return null

  return (
    <div className="legal-gate-overlay">
      <section className="legal-gate-card" role="dialog" aria-modal="true" aria-labelledby="legal-gate-title">
        <div className="legal-gate-mark" aria-hidden="true">✉</div>
        <p className="eyebrow">Project PenPal policies</p>
        <h2 id="legal-gate-title">Please review the current rules before continuing.</h2>
        <p className="legal-gate-copy">Project PenPal keeps policy acceptance versioned so you can see exactly what applies to your account. These documents cover the service terms, privacy practices, and community behavior standards.</p>

        <div className="legal-gate-documents">
          {missing.map((row) => (
            <button key={row.document_key} type="button" onClick={() => openLegalCenter(row.document_key)}>
              <div><strong>{row.title}</strong><span>Version {row.current_version} · effective {formatDate(row.effective_date)}</span></div>
              <span aria-hidden="true">Read →</span>
            </button>
          ))}
        </div>

        <label className="legal-gate-consent">
          <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
          <span>I agree to the Terms of Service and Community Guidelines and acknowledge the Privacy Policy shown above.</span>
        </label>

        {message && <p className="status-message legal-gate-status">{message}</p>}

        <div className="legal-gate-actions">
          <button className="primary" type="button" disabled={!acknowledged || working} onClick={() => void accept()}>{working ? 'Saving…' : 'Agree & continue'}</button>
          <button className="secondary" type="button" disabled={working} onClick={() => void signOut()}>Sign out</button>
        </div>
      </section>
    </div>
  )
}

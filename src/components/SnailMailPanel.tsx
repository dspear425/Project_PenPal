import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import '../snail-mail.css'

type MailingAddress = {
  recipient_name: string
  address_line1: string
  address_line2: string | null
  city: string
  region: string | null
  postal_code: string | null
  country: string
  created_at?: string
  updated_at?: string
  shared_from_address_updated_at?: string
}

type SnailMailState = {
  relationship_status: 'accepted' | 'paused' | 'ended'
  blocked: boolean
  my_preference: 'digital' | 'both' | 'snail_mail'
  other_preference: 'digital' | 'both' | 'snail_mail'
  my_international: boolean
  other_international: boolean
  my_country: string | null
  other_country: string | null
  exchange_status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'revoked' | null
  exchange_requested_by: string | null
  my_address: MailingAddress | null
  my_shared: boolean
  other_shared: boolean
  other_address: MailingAddress | null
}

type Props = {
  userId: string
  relationshipId: string
  relationshipStatus: 'accepted' | 'paused' | 'ended'
  otherName: string
}

const emptyAddress: MailingAddress = {
  recipient_name: '',
  address_line1: '',
  address_line2: '',
  city: '',
  region: '',
  postal_code: '',
  country: '',
}

const preferenceLabels: Record<string, string> = {
  digital: 'Digital letters only',
  both: 'Digital + snail mail',
  snail_mail: 'Snail mail preferred',
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const value = (error as { message?: unknown }).message
    if (typeof value === 'string') return value
  }
  return String(error || 'Unknown error')
}

function countriesDiffer(a: string | null, b: string | null) {
  if (!a || !b) return false
  return a.trim().toLowerCase() !== b.trim().toLowerCase()
}

function AddressBlock({ address }: { address: MailingAddress }) {
  const locality = [address.city, address.region, address.postal_code].filter(Boolean).join(', ')
  return (
    <address className="snail-address-block">
      <strong>{address.recipient_name}</strong>
      <span>{address.address_line1}</span>
      {address.address_line2 && <span>{address.address_line2}</span>}
      <span>{locality}</span>
      <span>{address.country}</span>
    </address>
  )
}

function addressText(address: MailingAddress) {
  return [
    address.recipient_name,
    address.address_line1,
    address.address_line2,
    [address.city, address.region, address.postal_code].filter(Boolean).join(', '),
    address.country,
  ].filter(Boolean).join('\n')
}

export default function SnailMailPanel({ userId, relationshipId, relationshipStatus, otherName }: Props) {
  const [state, setState] = useState<SnailMailState | null>(null)
  const [address, setAddress] = useState<MailingAddress>(emptyAddress)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [editingAddress, setEditingAddress] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    void loadState()
  }, [relationshipId, userId])

  async function loadState() {
    setLoading(true)
    setMessage('')
    try {
      const { data, error } = await supabase.rpc('get_snail_mail_state', { target_relationship: relationshipId })
      if (error) throw error
      const next = data as SnailMailState
      setState(next)
      setAddress(next.my_address ? {
        recipient_name: next.my_address.recipient_name ?? '',
        address_line1: next.my_address.address_line1 ?? '',
        address_line2: next.my_address.address_line2 ?? '',
        city: next.my_address.city ?? '',
        region: next.my_address.region ?? '',
        postal_code: next.my_address.postal_code ?? '',
        country: next.my_address.country ?? '',
      } : {
        ...emptyAddress,
        country: next.my_country ?? '',
      })
      setEditingAddress(!next.my_address)
    } catch (error) {
      setMessage(errorMessage(error))
      setState(null)
    } finally {
      setLoading(false)
    }
  }

  async function runAction(fn: () => Promise<{ error: unknown }>, success: string) {
    setWorking(true)
    setMessage('')
    try {
      const result = await fn()
      if (result.error) throw result.error
      await loadState()
      setMessage(success)
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setWorking(false)
    }
  }

  async function requestExchange() {
    await runAction(
      () => supabase.rpc('request_snail_mail_exchange', { target_relationship: relationshipId }),
      `Address-exchange request sent to ${otherName}. No mailing address has been shared yet.`,
    )
  }

  async function respondExchange(decision: 'accept' | 'decline') {
    await runAction(
      () => supabase.rpc('respond_snail_mail_exchange', { target_relationship: relationshipId, decision }),
      decision === 'accept'
        ? 'Address exchange accepted. Each of you can now decide separately whether to share an address.'
        : 'Address-exchange request declined.',
    )
  }

  async function cancelExchange() {
    await runAction(
      () => supabase.rpc('cancel_snail_mail_exchange', { target_relationship: relationshipId }),
      'Address-exchange request cancelled.',
    )
  }

  async function saveAddress(event: React.FormEvent) {
    event.preventDefault()
    setWorking(true)
    setMessage('')
    try {
      const { data, error } = await supabase.rpc('save_my_mailing_address', {
        mailing_name: address.recipient_name.trim(),
        mailing_line1: address.address_line1.trim(),
        mailing_line2: address.address_line2?.trim() || null,
        mailing_city: address.city.trim(),
        mailing_region: address.region?.trim() || null,
        mailing_postal_code: address.postal_code?.trim() || null,
        mailing_country: address.country.trim(),
      })
      if (error) throw error
      setAddress(data as MailingAddress)
      setEditingAddress(false)
      await loadState()
      setMessage(state?.my_shared
        ? 'Private address updated. Your existing share still contains the older address snapshot until you revoke and share again.'
        : 'Private mailing address saved. It has not been shared with anyone.')
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setWorking(false)
    }
  }

  async function deleteAddress() {
    if (!window.confirm('Delete your saved mailing address? This also revokes every active in-app address share you created.')) return
    await runAction(
      () => supabase.rpc('delete_my_mailing_address'),
      'Your saved mailing address was deleted and active address shares were revoked.',
    )
  }

  async function shareAddress() {
    if (!window.confirm(`Share your saved mailing address with ${otherName}? They will be able to copy it and may retain it outside Project PenPal.`)) return
    await runAction(
      () => supabase.rpc('share_my_mailing_address', { target_relationship: relationshipId }),
      `Your mailing address is now shared with ${otherName}.`,
    )
  }

  async function revokeShare() {
    await runAction(
      () => supabase.rpc('revoke_my_mailing_address_share', { target_relationship: relationshipId }),
      `Project PenPal no longer shows your mailing address to ${otherName}.`,
    )
  }

  async function copyOtherAddress() {
    if (!state?.other_address) return
    try {
      await navigator.clipboard.writeText(addressText(state.other_address))
      setMessage(`${otherName}'s mailing address copied.`)
    } catch {
      setMessage('Your browser could not copy the address automatically. You can select it manually.')
    }
  }

  if (loading) {
    return <section className="snail-mail-panel"><p className="connection-empty">Checking snail-mail options…</p></section>
  }

  if (!state) {
    return <section className="snail-mail-panel"><h2>Snail mail</h2>{message && <p className="status-message">{message}</p>}</section>
  }

  if (relationshipStatus === 'ended' || state.relationship_status === 'ended') {
    return (
      <section className="snail-mail-panel snail-mail-closed">
        <div className="snail-mail-heading"><div><p className="eyebrow">Physical correspondence</p><h2>Snail mail</h2></div><span className="snail-mail-stamp" aria-hidden="true">📪</span></div>
        <p>This pen-pal relationship has ended, so any in-app mailing-address access from this relationship has been revoked.</p>
      </section>
    )
  }

  const pendingIncoming = state.exchange_status === 'pending' && state.exchange_requested_by !== userId
  const pendingOutgoing = state.exchange_status === 'pending' && state.exchange_requested_by === userId
  const exchangeAccepted = state.exchange_status === 'accepted'
  const crossBorder = countriesDiffer(state.my_country, state.other_country)
  const bothOpen = state.my_preference !== 'digital' && state.other_preference !== 'digital'
  const internationalCompatible = !crossBorder || (state.my_international && state.other_international)
  const canRequest = relationshipStatus === 'accepted' && bothOpen && internationalCompatible

  return (
    <section className="snail-mail-panel">
      <div className="snail-mail-heading">
        <div>
          <p className="eyebrow">Physical correspondence</p>
          <h2>Snail mail with {otherName}</h2>
          <p>Move from digital letters to handwritten mail only when both of you are comfortable.</p>
        </div>
        <span className="snail-mail-stamp" aria-hidden="true">📬</span>
      </div>

      {message && <p className="status-message snail-mail-status">{message}</p>}

      <div className="snail-preference-grid">
        <article><span>You</span><strong>{preferenceLabels[state.my_preference]}</strong>{state.my_preference !== 'digital' && <small>{state.my_international ? 'International mail okay' : 'Domestic mail only'}</small>}</article>
        <article><span>{otherName}</span><strong>{preferenceLabels[state.other_preference]}</strong>{state.other_preference !== 'digital' && <small>{state.other_international ? 'International mail okay' : 'Domestic mail only'}</small>}</article>
      </div>

      {!bothOpen && !exchangeAccepted && (
        <div className="snail-mail-info">
          <strong>Address exchange is not available yet.</strong>
          <p>{state.my_preference === 'digital'
            ? 'Your profile is currently set to Digital letters only. Change your correspondence preference under Edit profile if you want to use snail mail.'
            : `${otherName}'s profile is currently set to Digital letters only.`}</p>
        </div>
      )}

      {bothOpen && !internationalCompatible && !exchangeAccepted && (
        <div className="snail-mail-info">
          <strong>International mailing preferences do not match.</strong>
          <p>You are in different countries, and both people must opt into international snail mail before an address exchange can begin.</p>
        </div>
      )}

      {!exchangeAccepted && !pendingIncoming && !pendingOutgoing && canRequest && (
        <div className="snail-exchange-request">
          <div><strong>Ready to write on paper?</strong><p>Request permission to exchange mailing addresses. Accepting the request shares no address by itself.</p></div>
          <button className="primary" type="button" disabled={working} onClick={() => void requestExchange()}>Request address exchange</button>
        </div>
      )}

      {pendingOutgoing && (
        <div className="snail-exchange-request pending">
          <div><strong>Waiting for {otherName}</strong><p>Your request is pending. Your mailing address has not been shared.</p></div>
          <button className="secondary" type="button" disabled={working} onClick={() => void cancelExchange()}>Cancel request</button>
        </div>
      )}

      {pendingIncoming && (
        <div className="snail-exchange-request incoming">
          <div><strong>{otherName} wants to exchange mailing addresses.</strong><p>Accepting only opens the sharing controls. Neither person's address becomes visible until they explicitly share it.</p></div>
          <div className="snail-mail-actions"><button className="primary" type="button" disabled={working || relationshipStatus !== 'accepted'} onClick={() => void respondExchange('accept')}>Accept exchange</button><button className="secondary" type="button" disabled={working} onClick={() => void respondExchange('decline')}>Decline</button></div>
        </div>
      )}

      {exchangeAccepted && (
        <>
          <div className="snail-mail-safety-note">
            <strong>Share thoughtfully.</strong>
            <p>A PO box, private mailbox, or mail-forwarding address can offer more privacy than a home address. Project PenPal does not verify mailing addresses or identities. Revoking access stops the app from displaying your address, but it cannot erase a copy someone already made.</p>
          </div>

          <div className="snail-mail-columns">
            <section className="snail-address-card">
              <div className="snail-address-card-heading"><div><span>Your private vault</span><h3>Your mailing address</h3></div>{state.my_shared && <span className="snail-shared-badge">Shared with {otherName}</span>}</div>

              {!editingAddress && state.my_address ? (
                <>
                  <AddressBlock address={state.my_address} />
                  <div className="snail-mail-actions">
                    <button className="secondary" type="button" disabled={working} onClick={() => setEditingAddress(true)}>Edit saved address</button>
                    {state.my_shared
                      ? <button className="secondary" type="button" disabled={working} onClick={() => void revokeShare()}>Revoke access</button>
                      : <button className="primary" type="button" disabled={working || relationshipStatus !== 'accepted'} onClick={() => void shareAddress()}>Share with {otherName}</button>}
                    <button className="text-button danger-link" type="button" disabled={working} onClick={() => void deleteAddress()}>Delete saved address</button>
                  </div>
                  {state.my_shared && <small className="snail-address-note">Editing your private vault does not update the address already shared with {otherName}. Revoke and share again when you want them to receive the new address.</small>}
                </>
              ) : (
                <form className="snail-address-form" onSubmit={saveAddress}>
                  <label>Name on envelope<input maxLength={120} value={address.recipient_name} onChange={(event) => setAddress({ ...address, recipient_name: event.target.value })} required /></label>
                  <label>Address line 1<input maxLength={160} value={address.address_line1} onChange={(event) => setAddress({ ...address, address_line1: event.target.value })} placeholder="Street address, PO Box, or private mailbox" required /></label>
                  <label>Address line 2 <span className="optional">optional</span><input maxLength={160} value={address.address_line2 ?? ''} onChange={(event) => setAddress({ ...address, address_line2: event.target.value })} /></label>
                  <div className="snail-address-grid">
                    <label>City / locality<input maxLength={120} value={address.city} onChange={(event) => setAddress({ ...address, city: event.target.value })} required /></label>
                    <label>State / province <span className="optional">optional</span><input maxLength={120} value={address.region ?? ''} onChange={(event) => setAddress({ ...address, region: event.target.value })} /></label>
                    <label>Postal code <span className="optional">optional</span><input maxLength={32} value={address.postal_code ?? ''} onChange={(event) => setAddress({ ...address, postal_code: event.target.value })} /></label>
                    <label>Country<input maxLength={80} value={address.country} onChange={(event) => setAddress({ ...address, country: event.target.value })} required /></label>
                  </div>
                  <div className="snail-mail-actions"><button className="primary" disabled={working}>{working ? 'Saving…' : 'Save privately'}</button>{state.my_address && <button className="secondary" type="button" onClick={() => { setEditingAddress(false); setAddress(state.my_address as MailingAddress) }}>Cancel</button>}</div>
                  <small>Saving this address does not share it. It stays in your private address vault until you choose a specific pen pal.</small>
                </form>
              )}
            </section>

            <section className="snail-address-card received-address-card">
              <div className="snail-address-card-heading"><div><span>{otherName}'s choice</span><h3>Address from {otherName}</h3></div>{state.other_shared && <span className="snail-shared-badge received">Shared with you</span>}</div>
              {state.other_address ? (
                <>
                  <AddressBlock address={state.other_address} />
                  <button className="secondary" type="button" onClick={() => void copyOtherAddress()}>Copy mailing address</button>
                </>
              ) : (
                <div className="snail-waiting-address"><span aria-hidden="true">✉</span><strong>Not shared yet.</strong><p>{otherName} can decide whether to share a mailing address independently from you.</p></div>
              )}
            </section>
          </div>
        </>
      )}
    </section>
  )
}

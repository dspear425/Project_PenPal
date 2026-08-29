import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { signedProfilePhotoUrl } from '../lib/profilePhoto'

type Props = {
  userId: string
  targetUserId: string
  targetName: string
  relationshipId?: string | null
  canReportProfilePhoto?: boolean
  onClose: () => void
  onBlocked: () => void
}

const reportCategories = [
  ['harassment', 'Harassment or unwanted contact'],
  ['scam', 'Scam, fraud, or asking for money'],
  ['sexual_content', 'Unwanted sexual content'],
  ['hate_abuse', 'Hate, threats, or abusive behavior'],
  ['impersonation', 'Impersonation or false identity'],
  ['spam', 'Spam or mass messaging'],
  ['other', 'Something else'],
] as const

const photoCategories = [
  ['nudity_sexual', 'Nudity or sexual imagery'],
  ['hate_extremism', 'Hate or extremist imagery'],
  ['graphic_content', 'Graphic or disturbing content'],
  ['impersonation', 'Impersonation / not the account holder'],
  ['spam_advertising', 'Advertising, spam, or promotional image'],
  ['privacy_concern', 'Privacy or personal-information concern'],
  ['other', 'Something else'],
] as const

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return String(error || 'Unknown error')
}

export default function SafetyPanel({
  userId,
  targetUserId,
  targetName,
  relationshipId,
  canReportProfilePhoto = false,
  onClose,
  onBlocked,
}: Props) {
  const [view, setView] = useState<'menu' | 'report' | 'photo-report' | 'block' | 'reported'>('menu')
  const [category, setCategory] = useState('harassment')
  const [photoCategory, setPhotoCategory] = useState('other')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [reportedKind, setReportedKind] = useState<'member' | 'photo'>('member')
  const [photoReportAvailable, setPhotoReportAvailable] = useState(canReportProfilePhoto)

  useEffect(() => {
    let active = true
    setPhotoReportAvailable(canReportProfilePhoto)

    if (canReportProfilePhoto) return () => { active = false }

    void supabase
      .from('profiles')
      .select('avatar_path')
      .eq('id', targetUserId)
      .maybeSingle()
      .then(async ({ data, error }) => {
        if (!active || error || !data?.avatar_path) return
        const url = await signedProfilePhotoUrl(String(data.avatar_path))
        if (active && url) setPhotoReportAvailable(true)
      })

    return () => { active = false }
  }, [targetUserId, canReportProfilePhoto])

  async function submitReport(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage('')

    try {
      const { error } = await supabase.from('reports').insert({
        reporter_id: userId,
        reported_id: targetUserId,
        relationship_id: relationshipId || null,
        category,
        details: details.trim() || null,
      })

      if (error) throw error
      setReportedKind('member')
      setView('reported')
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function submitPhotoReport(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage('')

    try {
      const { error } = await supabase.rpc('submit_profile_photo_report', {
        target_user: targetUserId,
        target_relationship: relationshipId || null,
        violation_category: photoCategory,
        report_details: details.trim() || null,
      })
      if (error) throw error
      setReportedKind('photo')
      setView('reported')
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function blockMember() {
    setBusy(true)
    setMessage('')

    try {
      const { error } = await supabase.rpc('block_member', { target_user: targetUserId })
      if (error) throw error
      onBlocked()
    } catch (error) {
      setMessage(errorMessage(error))
      setBusy(false)
    }
  }

  function backToMenu() {
    setView('menu')
    setMessage('')
    setDetails('')
  }

  return (
    <div className="safety-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose()
    }}>
      <section className="safety-panel" role="dialog" aria-modal="true" aria-labelledby="safety-title">
        <button className="safety-close" type="button" onClick={onClose} disabled={busy} aria-label="Close">×</button>

        {view === 'menu' && (
          <>
            <p className="eyebrow">Safety & boundaries</p>
            <h2 id="safety-title">Manage your connection with {targetName}.</h2>
            <p className="safety-copy">
              Reporting sends information to Project PenPal for review. Blocking is private and immediately prevents further contact between your accounts.
            </p>

            <div className="safety-option-list">
              <button className="safety-option" type="button" onClick={() => setView('report')}>
                <span className="safety-option-icon" aria-hidden="true">!</span>
                <span><strong>Report {targetName}</strong><small>Tell us about harassment, scams, spam, abuse, or another safety concern.</small></span>
              </button>
              {photoReportAvailable && (
                <button className="safety-option" type="button" onClick={() => { setDetails(''); setView('photo-report') }}>
                  <span className="safety-option-icon" aria-hidden="true">▧</span>
                  <span><strong>Report profile photo</strong><small>Flag an inappropriate, misleading, graphic, or privacy-sensitive profile image for moderator review.</small></span>
                </button>
              )}
              <button className="safety-option danger-option" type="button" onClick={() => setView('block')}>
                <span className="safety-option-icon" aria-hidden="true">×</span>
                <span><strong>Block {targetName}</strong><small>End the connection and prevent both accounts from contacting or discovering one another.</small></span>
              </button>
            </div>
          </>
        )}

        {view === 'report' && (
          <form onSubmit={submitReport}>
            <button className="back safety-back" type="button" onClick={backToMenu}>← Safety options</button>
            <p className="eyebrow">Report a concern</p>
            <h2 id="safety-title">What happened with {targetName}?</h2>
            <p className="safety-copy">Your report is not shown to the person you report.</p>

            <label className="safety-label">
              Reason
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                {reportCategories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>

            <label className="safety-label">
              Details <span className="optional">optional · {details.length}/2000</span>
              <textarea
                rows={7}
                maxLength={2000}
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                placeholder="Share anything that would help a moderator understand what happened."
              />
            </label>

            {message && <p className="status-message">{message}</p>}
            <div className="safety-actions">
              <button className="primary" type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit report'}</button>
              <button className="secondary" type="button" onClick={onClose} disabled={busy}>Cancel</button>
            </div>
          </form>
        )}

        {view === 'photo-report' && (
          <form onSubmit={submitPhotoReport}>
            <button className="back safety-back" type="button" onClick={backToMenu}>← Safety options</button>
            <p className="eyebrow">Report profile photo</p>
            <h2 id="safety-title">What is wrong with {targetName}’s photo?</h2>
            <p className="safety-copy">The exact photo version you are reporting is preserved privately for moderator review, even if the member changes it later.</p>

            <label className="safety-label">
              Photo concern
              <select value={photoCategory} onChange={(event) => setPhotoCategory(event.target.value)}>
                {photoCategories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>

            <label className="safety-label">
              Details <span className="optional">optional · {details.length}/2000</span>
              <textarea
                rows={7}
                maxLength={2000}
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                placeholder="Tell moderators what they should look for in the photo."
              />
            </label>

            {message && <p className="status-message">{message}</p>}
            <div className="safety-actions">
              <button className="primary" type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Report photo'}</button>
              <button className="secondary" type="button" onClick={onClose} disabled={busy}>Cancel</button>
            </div>
          </form>
        )}

        {view === 'reported' && (
          <>
            <div className="safety-success-icon" aria-hidden="true">✓</div>
            <p className="eyebrow">Report received</p>
            <h2 id="safety-title">Thanks for letting us know.</h2>
            <p className="safety-copy">
              {reportedKind === 'photo'
                ? 'The reported photo version has been attached to the moderation record for private review.'
                : `The report has been saved for moderation review. Reporting does not automatically block ${targetName}.`}
            </p>
            <div className="safety-actions">
              <button className="secondary" type="button" onClick={() => setView('block')}>Block {targetName} too</button>
              <button className="primary" type="button" onClick={onClose}>Done</button>
            </div>
          </>
        )}

        {view === 'block' && (
          <>
            <button className="back safety-back" type="button" onClick={backToMenu} disabled={busy}>← Safety options</button>
            <p className="eyebrow danger-eyebrow">Block member</p>
            <h2 id="safety-title">Block {targetName}?</h2>
            <p className="safety-copy">
              This will immediately end any request or pen-pal relationship between you. You will no longer appear to one another in Discover, and new letters cannot be exchanged. They are not notified that you blocked them.
            </p>
            {message && <p className="status-message">{message}</p>}
            <div className="safety-actions">
              <button className="danger-button" type="button" onClick={() => void blockMember()} disabled={busy}>{busy ? 'Blocking…' : `Block ${targetName}`}</button>
              <button className="secondary" type="button" onClick={onClose} disabled={busy}>Keep connection</button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

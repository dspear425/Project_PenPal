import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { signedProfilePhotoUrl } from '../lib/profilePhoto'
import '../admin-photo-report.css'

type Props = {
  targetUserId: string
  targetName: string
  evidencePath: string
  currentAvatarPath: string | null
  visibilityAtReport: string | null
  violationCategory: string | null
  onChanged: () => Promise<void> | void
}

const violationOptions = [
  ['nudity_sexual', 'Nudity / sexual imagery'],
  ['hate_extremism', 'Hate / extremist imagery'],
  ['graphic_content', 'Graphic / disturbing content'],
  ['impersonation', 'Impersonation / misleading identity'],
  ['spam_advertising', 'Spam / advertising'],
  ['privacy_concern', 'Privacy concern'],
  ['other', 'Other'],
] as const

const violationLabels: Record<string, string> = Object.fromEntries(violationOptions)

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const value = (error as { message?: unknown }).message
    if (typeof value === 'string') return value
  }
  return String(error || 'Unknown error')
}

export default function AdminPhotoReportEvidence({
  targetUserId,
  targetName,
  evidencePath,
  currentAvatarPath,
  visibilityAtReport,
  violationCategory,
  onChanged,
}: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [loadingImage, setLoadingImage] = useState(true)
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')
  const [reason, setReason] = useState('')
  const [category, setCategory] = useState(violationCategory || 'other')

  const isCurrentPhoto = currentAvatarPath === evidencePath

  useEffect(() => {
    let active = true
    setLoadingImage(true)
    setImageUrl(null)
    setCategory(violationCategory || 'other')

    void signedProfilePhotoUrl(evidencePath).then((url) => {
      if (!active) return
      setImageUrl(url)
      setLoadingImage(false)
    })

    return () => { active = false }
  }, [evidencePath, violationCategory])

  async function removeReportedPhoto(notifyMember: boolean) {
    if (!isCurrentPhoto || reason.trim().length < 3) return
    const action = notifyMember ? 'remove this photo and warn the member' : 'remove this photo'
    if (!window.confirm(`Confirm: ${action}?`)) return

    setWorking(true)
    setMessage('')
    try {
      const { error } = await supabase.rpc('moderator_remove_profile_photo', {
        target_user: targetUserId,
        expected_photo_path: evidencePath,
        violation_category: category,
        action_reason: reason.trim(),
        notify_member: notifyMember,
      })
      if (error) throw error
      setReason('')
      setMessage(notifyMember
        ? `${targetName}'s profile photo was removed and a warning notice was sent.`
        : `${targetName}'s profile photo was removed and the moderation action was logged.`)
      await onChanged()
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setWorking(false)
    }
  }

  return (
    <section className="admin-photo-evidence-section">
      <div className="admin-photo-evidence-heading">
        <div>
          <h3>Reported profile photo</h3>
          <p>This is the exact immutable image version attached when the member submitted the report.</p>
        </div>
        <span className={isCurrentPhoto ? 'current' : 'historical'}>{isCurrentPhoto ? 'Current photo' : 'Historical evidence'}</span>
      </div>

      {message && <p className="status-message admin-photo-evidence-status">{message}</p>}

      <div className="admin-photo-evidence-grid">
        <div className="admin-photo-evidence-image">
          {loadingImage ? <span>Loading image…</span> : imageUrl ? <img src={imageUrl} alt="Reported profile photo evidence" /> : <span>Evidence image unavailable.</span>}
        </div>
        <div className="admin-photo-evidence-facts">
          <span><strong>Reported concern</strong>{violationLabels[violationCategory || 'other'] || 'Other'}</span>
          <span><strong>Visibility when reported</strong>{visibilityAtReport || 'Unknown'}</span>
          <span><strong>Evidence object</strong><code>{evidencePath}</code></span>
          {!isCurrentPhoto && (
            <div className="admin-photo-evidence-warning">
              <strong>Do not remove the current image from this report.</strong>
              <span>{currentAvatarPath ? 'The member replaced the reported image with a newer profile photo.' : 'The member no longer has a current profile photo.'} This older image remains available only as moderation evidence.</span>
            </div>
          )}
        </div>
      </div>

      {isCurrentPhoto && (
        <div className="admin-photo-report-actions">
          <div>
            <strong>Moderate this current photo</strong>
            <p>Removal affects only the current profile image. The immutable evidence object remains available for the moderation record.</p>
          </div>
          <label>Photo violation<select value={category} onChange={(event) => setCategory(event.target.value)}>{violationOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Reason <span>required · audited</span><textarea rows={3} maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why should this photo be removed?" /></label>
          <div className="admin-photo-report-action-row">
            <button className="secondary" type="button" disabled={working || reason.trim().length < 3} onClick={() => void removeReportedPhoto(false)}>Remove photo</button>
            <button className="danger-button" type="button" disabled={working || reason.trim().length < 3} onClick={() => void removeReportedPhoto(true)}>Remove + warn member</button>
          </div>
        </div>
      )}
    </section>
  )
}

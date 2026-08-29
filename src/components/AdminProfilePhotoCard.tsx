import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import ProfileAvatar from './ProfileAvatar'

type PhotoReport = {
  id: string
  reporter_id: string
  status: string
  details: string | null
  photo_evidence_path: string | null
  photo_visibility_at_report: string | null
  photo_violation_category: string | null
  created_at: string
  reviewed_at: string | null
}

type PhotoContext = {
  avatar_path: string | null
  avatar_visibility: 'discover' | 'connections' | 'hidden'
  avatar_updated_at: string | null
  photo_reports: PhotoReport[]
}

type Props = {
  currentUserId: string
  targetUserId: string
  targetName: string
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

const violationLabels = Object.fromEntries(violationOptions)

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const value = (error as { message?: unknown }).message
    if (typeof value === 'string') return value
  }
  return String(error || 'Unknown error')
}

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value))
}

function visibilityLabel(value: PhotoContext['avatar_visibility']) {
  if (value === 'discover') return 'Show in Discover'
  if (value === 'connections') return 'Pen pals only'
  return 'Hidden from members'
}

export default function AdminProfilePhotoCard({ currentUserId, targetUserId, targetName }: Props) {
  const [context, setContext] = useState<PhotoContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')
  const [category, setCategory] = useState('other')
  const [reason, setReason] = useState('')

  const selectedIsSelf = currentUserId === targetUserId

  useEffect(() => {
    void loadPhotoContext()
  }, [targetUserId])

  async function loadPhotoContext() {
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('moderator_profile_photo_context', { target_user: targetUserId })
      if (error) throw error
      setContext((data ?? null) as PhotoContext | null)
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  async function removePhoto(notifyMember: boolean) {
    if (!context?.avatar_path || reason.trim().length < 3) return
    const label = notifyMember ? 'remove this photo and warn the member' : 'remove this photo'
    if (!window.confirm(`Confirm: ${label}?`)) return

    setWorking(true)
    setMessage('')
    try {
      const { error } = await supabase.rpc('moderator_remove_profile_photo', {
        target_user: targetUserId,
        expected_photo_path: context.avatar_path,
        violation_category: category,
        action_reason: reason.trim(),
        notify_member: notifyMember,
      })
      if (error) throw error
      setReason('')
      await loadPhotoContext()
      setMessage(notifyMember
        ? 'Profile photo removed and a member notice was issued.'
        : 'Profile photo removed. The action was recorded in moderation history.')
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setWorking(false)
    }
  }

  if (loading) {
    return <section className="admin-profile-photo-card"><p className="connection-empty">Loading profile photo…</p></section>
  }

  const photoReports = context?.photo_reports ?? []

  return (
    <section className="admin-profile-photo-card">
      <div className="admin-profile-photo-heading">
        <div>
          <h4>Profile photo</h4>
          <p>Moderators can review the current image regardless of the member’s visibility setting.</p>
        </div>
        {photoReports.length > 0 && <span className="admin-photo-report-count">{photoReports.length} photo report{photoReports.length === 1 ? '' : 's'}</span>}
      </div>

      {message && <p className="status-message admin-profile-photo-status">{message}</p>}

      <div className="admin-profile-photo-current">
        <ProfileAvatar avatarPath={context?.avatar_path ?? null} displayName={targetName} size="large" />
        <div className="admin-profile-photo-facts">
          <span><strong>Current status</strong>{context?.avatar_path ? 'Photo on profile' : 'No current photo'}</span>
          <span><strong>Visibility</strong>{visibilityLabel(context?.avatar_visibility ?? 'hidden')}</span>
          <span><strong>Last photo update</strong>{formatDate(context?.avatar_updated_at ?? null)}</span>
          {context?.avatar_path && <span><strong>Evidence-safe object</strong><code>{context.avatar_path}</code></span>}
        </div>
      </div>

      {context?.avatar_path && !selectedIsSelf && (
        <div className="admin-photo-moderation-controls">
          <div>
            <strong>Remove current photo</strong>
            <p>A reason is required and permanently recorded. “Remove + warn” also creates an Account Notice for the member.</p>
          </div>
          <label>Photo violation<select value={category} onChange={(event) => setCategory(event.target.value)}>{violationOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Reason <span>required · audited</span><textarea rows={3} maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why does this photo need to be removed?" /></label>
          <div className="admin-photo-action-row">
            <button className="secondary" type="button" disabled={working || reason.trim().length < 3} onClick={() => void removePhoto(false)}>Remove photo</button>
            <button className="danger-button" type="button" disabled={working || reason.trim().length < 3} onClick={() => void removePhoto(true)}>Remove + warn member</button>
          </div>
        </div>
      )}

      {selectedIsSelf && context?.avatar_path && (
        <div className="admin-photo-self-note">Use your normal Profile photo settings to change your own staff photo.</div>
      )}

      {photoReports.length > 0 && (
        <div className="admin-profile-photo-reports">
          <h5>Recent photo reports</h5>
          {photoReports.slice(0, 5).map((report) => (
            <article key={report.id}>
              <div><strong>{violationLabels[report.photo_violation_category || 'other'] || 'Other'}</strong><span className={`admin-status-pill ${report.status}`}>{report.status}</span></div>
              <small>{formatDate(report.created_at)} · visibility at report: {report.photo_visibility_at_report || 'unknown'}</small>
              {report.details && <p>{report.details}</p>}
              {report.photo_evidence_path && context?.avatar_path !== report.photo_evidence_path && <em>Reported image is no longer the member’s current photo.</em>}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

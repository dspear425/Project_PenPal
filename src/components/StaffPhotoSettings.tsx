import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { validateProfilePhotoFile } from '../lib/profilePhoto'
import ProfileAvatar from './ProfileAvatar'
import ProfilePhotoCropper from './ProfilePhotoCropper'

type Props = {
  userId: string
  role: 'moderator' | 'admin' | 'owner'
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const value = (error as { message?: unknown }).message
    if (typeof value === 'string') return value
  }
  return String(error || 'Unknown error')
}

function roleLabel(role: Props['role']) {
  if (role === 'owner') return 'Owner'
  if (role === 'admin') return 'Administrator'
  return 'Moderator'
}

export default function StaffPhotoSettings({ userId, role }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [avatarPath, setAvatarPath] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [cropFile, setCropFile] = useState<File | null>(null)
  const [headerTarget, setHeaderTarget] = useState<HTMLElement | null>(null)

  useEffect(() => {
    void loadStaffPhoto()
  }, [userId])

  useEffect(() => {
    const findHeader = () => {
      setHeaderTarget(document.querySelector<HTMLElement>('.admin-header .discover-nav'))
    }
    findHeader()
    const frame = window.requestAnimationFrame(findHeader)
    return () => window.cancelAnimationFrame(frame)
  }, [])

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  async function loadStaffPhoto() {
    setLoading(true)
    setMessage('')
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('display_name, staff_avatar_path')
        .eq('id', userId)
        .single()
      if (error) throw error
      setDisplayName(data.display_name ?? null)
      setAvatarPath(data.staff_avatar_path ?? null)
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  function closePanel() {
    if (working) return
    setCropFile(null)
    setOpen(false)
  }

  function chooseFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setMessage('')
    try {
      validateProfilePhotoFile(file)
      setCropFile(file)
    } catch (error) {
      setMessage(errorMessage(error))
    }
  }

  async function saveCroppedPhoto(processed: Blob) {
    setWorking(true)
    setMessage('Saving staff photo…')
    let localPreview: string | null = null
    const previousPath = avatarPath

    try {
      const uniquePart = typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`
      const path = `${userId}/staff-avatar-${Date.now()}-${uniquePart}.jpg`

      const { error: uploadError } = await supabase.storage
        .from('profile-photos')
        .upload(path, processed, {
          upsert: false,
          contentType: 'image/jpeg',
          cacheControl: '3600',
        })
      if (uploadError) throw uploadError

      const { data, error: saveError } = await supabase.rpc('save_my_staff_photo', {
        photo_path: path,
      })
      if (saveError) throw saveError

      localPreview = URL.createObjectURL(processed)
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setPreviewUrl(localPreview)
      const row = Array.isArray(data) ? data[0] : data
      setAvatarPath(row?.staff_avatar_path ?? path)
      setCropFile(null)
      setMessage('Staff photo saved. It is private to the staff/admin experience and is not used in Discover.')

      if (previousPath && previousPath !== path) {
        void supabase.storage.from('profile-photos').remove([previousPath])
      }
    } catch (error) {
      if (localPreview) URL.revokeObjectURL(localPreview)
      setMessage(errorMessage(error))
      throw error
    } finally {
      setWorking(false)
    }
  }

  async function removePhoto() {
    if (!avatarPath) return
    if (!window.confirm('Remove your staff photo?')) return

    setWorking(true)
    setMessage('')
    const previousPath = avatarPath
    try {
      const { error } = await supabase.rpc('remove_my_staff_photo')
      if (error) throw error
      setAvatarPath(null)
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
      setMessage('Staff photo removed. Your initials will be shown instead.')
      void supabase.storage.from('profile-photos').remove([previousPath])
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setWorking(false)
    }
  }

  const identityControl = (
    <button
      className="staff-identity-chip"
      type="button"
      onClick={() => { setOpen(true); setMessage('') }}
      title="Open staff photo settings"
    >
      <ProfileAvatar avatarPath={avatarPath} displayName={displayName} size="small" />
      <span><strong>{displayName || 'Staff account'}</strong><small>{roleLabel(role)}</small></span>
    </button>
  )

  return (
    <>
      {headerTarget ? createPortal(identityControl, headerTarget) : identityControl}

      <button
        className="profile-photo-launcher staff-photo-launcher"
        type="button"
        onClick={() => { setOpen(true); setMessage('') }}
        aria-label="Open staff photo settings"
      >
        <span aria-hidden="true">◉</span><span>Staff photo</span>
      </button>

      {open && (
        <div className="profile-photo-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) closePanel() }}>
          <section className="profile-photo-panel" role="dialog" aria-modal="true" aria-labelledby="staff-photo-title">
            <header>
              <div>
                <p className="eyebrow">Staff identity</p>
                <h2 id="staff-photo-title">Staff photo.</h2>
                <p>This photo is kept separate from member profiles. It is used only in the private staff/admin experience.</p>
              </div>
              <button className="settings-close" type="button" onClick={closePanel} disabled={working}>×</button>
            </header>

            {message && <p className="status-message profile-photo-status">{message}</p>}

            {loading ? <p className="connection-empty">Loading staff photo…</p> : cropFile ? (
              <ProfilePhotoCropper
                file={cropFile}
                working={working}
                onCancel={() => {
                  setCropFile(null)
                  setMessage('')
                  window.setTimeout(() => inputRef.current?.click(), 0)
                }}
                onConfirm={saveCroppedPhoto}
              />
            ) : (
              <div className="staff-photo-layout">
                <section className="profile-photo-preview-card">
                  {previewUrl
                    ? <div className="profile-photo-preview"><img src={previewUrl} alt="Your staff photo preview" /></div>
                    : <ProfileAvatar avatarPath={avatarPath} displayName={displayName} size="large" />}
                  <div>
                    <strong>{displayName || 'Staff account'}</strong>
                    <span>{roleLabel(role)} · {avatarPath ? 'Staff photo added' : 'Using initials avatar'}</span>
                  </div>
                  <input ref={inputRef} className="profile-photo-file-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseFile} />
                  <div className="profile-photo-actions">
                    <button className="primary" type="button" disabled={working} onClick={() => inputRef.current?.click()}>{avatarPath ? 'Replace photo' : 'Choose photo'}</button>
                    {avatarPath && <button className="secondary" type="button" disabled={working} onClick={() => void removePhoto()}>Remove</button>}
                  </div>
                  <small>JPEG, PNG, or WebP · maximum 5 MB. The selected crop is resized to 512×512 and re-encoded before upload.</small>
                </section>

                <section className="staff-photo-privacy-note">
                  <h3>Private staff identity</h3>
                  <p>This image is not a member avatar. It cannot appear in Discover, pen-pal requests, correspondence profiles, or snail-mail sharing.</p>
                  <p>The underlying Storage bucket remains private and access is controlled by the existing staff/photo policies.</p>
                </section>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  )
}

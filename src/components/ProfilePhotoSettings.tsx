import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { prepareProfilePhoto } from '../lib/profilePhoto'
import ProfileAvatar from './ProfileAvatar'

type Visibility = 'discover' | 'connections' | 'hidden'

type Props = {
  userId: string
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const value = (error as { message?: unknown }).message
    if (typeof value === 'string') return value
  }
  return String(error || 'Unknown error')
}

export default function ProfilePhotoSettings({ userId }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [avatarPath, setAvatarPath] = useState<string | null>(null)
  const [visibility, setVisibility] = useState<Visibility>('discover')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    if (open) void loadProfilePhoto()
  }, [open, userId])

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  async function loadProfilePhoto() {
    setLoading(true)
    setMessage('')
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('display_name, avatar_path, avatar_visibility')
        .eq('id', userId)
        .single()
      if (error) throw error
      setDisplayName(data.display_name ?? null)
      setAvatarPath(data.avatar_path ?? null)
      setVisibility((data.avatar_visibility ?? 'discover') as Visibility)
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  async function chooseFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setWorking(true)
    setMessage('Preparing photo…')
    try {
      const processed = await prepareProfilePhoto(file)
      const localPreview = URL.createObjectURL(processed)
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setPreviewUrl(localPreview)

      const path = `${userId}/avatar.jpg`
      const { error: uploadError } = await supabase.storage
        .from('profile-photos')
        .upload(path, processed, {
          upsert: true,
          contentType: 'image/jpeg',
          cacheControl: '3600',
        })
      if (uploadError) throw uploadError

      const { data, error: saveError } = await supabase.rpc('save_my_profile_photo', {
        photo_path: path,
        visibility,
      })
      if (saveError) throw saveError

      const row = Array.isArray(data) ? data[0] : data
      setAvatarPath(row?.avatar_path ?? path)
      setMessage('Profile photo saved. The uploaded image was resized to a square and its original metadata was removed.')
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setWorking(false)
    }
  }

  async function saveVisibility(next: Visibility) {
    setVisibility(next)
    setWorking(true)
    setMessage('')
    try {
      const { error } = await supabase.rpc('save_my_profile_photo', {
        photo_path: avatarPath,
        visibility: next,
      })
      if (error) throw error
      setMessage(next === 'discover'
        ? 'Your photo can appear in Discover.'
        : next === 'connections'
          ? 'Your photo is now limited to established pen pals.'
          : 'Your photo is hidden from other members.')
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setWorking(false)
    }
  }

  async function removePhoto() {
    if (!avatarPath) return
    if (!window.confirm('Remove your current Project PenPal profile photo?')) return

    setWorking(true)
    setMessage('')
    try {
      const { error: storageError } = await supabase.storage.from('profile-photos').remove([avatarPath])
      if (storageError) throw storageError
      const { error } = await supabase.rpc('remove_my_profile_photo')
      if (error) throw error
      setAvatarPath(null)
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
      setMessage('Profile photo removed. Your initials will be shown instead.')
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setWorking(false)
    }
  }

  return (
    <>
      <button className="profile-photo-launcher" type="button" onClick={() => { setOpen(true); setMessage('') }}>
        <span aria-hidden="true">◉</span><span>Profile photo</span>
      </button>

      {open && (
        <div className="profile-photo-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !working) setOpen(false) }}>
          <section className="profile-photo-panel" role="dialog" aria-modal="true" aria-labelledby="profile-photo-title">
            <header>
              <div>
                <p className="eyebrow">Profile identity</p>
                <h2 id="profile-photo-title">Profile photo.</h2>
                <p>Add one optional photo to make correspondence feel more personal without turning Project PenPal into a photo-first matching app.</p>
              </div>
              <button className="settings-close" type="button" onClick={() => setOpen(false)} disabled={working}>×</button>
            </header>

            {message && <p className="status-message profile-photo-status">{message}</p>}

            {loading ? <p className="connection-empty">Loading your photo settings…</p> : (
              <div className="profile-photo-layout">
                <section className="profile-photo-preview-card">
                  {previewUrl
                    ? <div className="profile-photo-preview"><img src={previewUrl} alt="Your new profile photo preview" /></div>
                    : <ProfileAvatar avatarPath={avatarPath} displayName={displayName} size="large" />}
                  <div>
                    <strong>{displayName || 'Your profile'}</strong>
                    <span>{avatarPath ? 'Profile photo added' : 'Using initials avatar'}</span>
                  </div>
                  <input ref={inputRef} className="profile-photo-file-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void chooseFile(event)} />
                  <div className="profile-photo-actions">
                    <button className="primary" type="button" disabled={working} onClick={() => inputRef.current?.click()}>{working ? 'Working…' : avatarPath ? 'Replace photo' : 'Choose photo'}</button>
                    {avatarPath && <button className="secondary" type="button" disabled={working} onClick={() => void removePhoto()}>Remove</button>}
                  </div>
                  <small>JPEG, PNG, or WebP · maximum 5 MB. Images are center-cropped to 512×512 and re-encoded before upload, removing embedded EXIF/GPS metadata.</small>
                </section>

                <section className="profile-photo-privacy-card">
                  <div>
                    <h3>Who can see it?</h3>
                    <p>The image is stored in a private bucket. This setting controls who is allowed to receive a signed image URL.</p>
                  </div>

                  <label className={visibility === 'discover' ? 'selected' : ''}>
                    <input type="radio" name="photo-visibility" checked={visibility === 'discover'} onChange={() => void saveVisibility('discover')} disabled={working} />
                    <span><strong>Show in Discover</strong><small>Eligible signed-in members can see your photo when they can see your discoverable profile.</small></span>
                  </label>
                  <label className={visibility === 'connections' ? 'selected' : ''}>
                    <input type="radio" name="photo-visibility" checked={visibility === 'connections'} onChange={() => void saveVisibility('connections')} disabled={working} />
                    <span><strong>Pen pals only</strong><small>Your photo becomes available only after an accepted connection and remains available with preserved correspondence history.</small></span>
                  </label>
                  <label className={visibility === 'hidden' ? 'selected' : ''}>
                    <input type="radio" name="photo-visibility" checked={visibility === 'hidden'} onChange={() => void saveVisibility('hidden')} disabled={working} />
                    <span><strong>Hidden</strong><small>Keep the uploaded image on your account but show initials to other members.</small></span>
                  </label>

                  <div className="profile-photo-safety-note">
                    <strong>Photo ≠ identity verification</strong>
                    <p>A profile photo does not mean Project PenPal has verified who someone is. Photos must remain appropriate for a general 18+ friendship community; existing Safety tools can be used to report concerns.</p>
                  </div>
                </section>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  )
}

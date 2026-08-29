import { useEffect, useState } from 'react'
import { initialsForName, signedProfilePhotoUrl } from '../lib/profilePhoto'

type Props = {
  avatarPath?: string | null
  displayName?: string | null
  className?: string
  size?: 'small' | 'medium' | 'large'
}

export default function ProfileAvatar({ avatarPath, displayName, className = '', size = 'medium' }: Props) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setUrl(null)
    if (!avatarPath) return () => { active = false }

    void signedProfilePhotoUrl(avatarPath).then((nextUrl) => {
      if (active) setUrl(nextUrl)
    })

    return () => { active = false }
  }, [avatarPath])

  return (
    <div className={`profile-avatar profile-avatar-${size} ${className}`.trim()} aria-label={displayName ? `${displayName}'s profile photo` : 'Profile photo'}>
      {url ? <img src={url} alt="" /> : <span aria-hidden="true">{initialsForName(displayName)}</span>}
    </div>
  )
}

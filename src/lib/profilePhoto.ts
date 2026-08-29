import { supabase } from './supabase'

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const OUTPUT_SIZE = 512
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export async function prepareProfilePhoto(file: File): Promise<Blob> {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error('Choose a JPEG, PNG, or WebP image.')
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('Profile photos must be 5 MB or smaller.')
  }

  const bitmap = await createImageBitmap(file)
  try {
    const sourceSize = Math.min(bitmap.width, bitmap.height)
    const sx = Math.max(0, Math.floor((bitmap.width - sourceSize) / 2))
    const sy = Math.max(0, Math.floor((bitmap.height - sourceSize) / 2))

    const canvas = document.createElement('canvas')
    canvas.width = OUTPUT_SIZE
    canvas.height = OUTPUT_SIZE
    const context = canvas.getContext('2d')
    if (!context) throw new Error('This browser could not prepare the image.')

    context.drawImage(
      bitmap,
      sx,
      sy,
      sourceSize,
      sourceSize,
      0,
      0,
      OUTPUT_SIZE,
      OUTPUT_SIZE,
    )

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.86)
    })
    if (!blob) throw new Error('This browser could not prepare the image.')
    return blob
  } finally {
    bitmap.close()
  }
}

export async function signedProfilePhotoUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('profile-photos')
    .createSignedUrl(path, 3600)

  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

export function initialsForName(name: string | null | undefined) {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return 'PP'
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join('') || 'PP'
}

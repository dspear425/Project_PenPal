import { supabase } from './supabase'

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const OUTPUT_SIZE = 512
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export type ProfilePhotoCrop = {
  x: number
  y: number
  size: number
}

export function validateProfilePhotoFile(file: File) {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error('Choose a JPEG, PNG, or WebP image.')
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('Profile photos must be 5 MB or smaller.')
  }
}

export async function prepareProfilePhoto(file: File, crop?: ProfilePhotoCrop): Promise<Blob> {
  validateProfilePhotoFile(file)

  const bitmap = await createImageBitmap(file)
  try {
    const defaultSize = Math.min(bitmap.width, bitmap.height)
    const requestedSize = crop?.size ?? defaultSize
    const sourceSize = Math.max(1, Math.min(requestedSize, bitmap.width, bitmap.height))
    const maxX = Math.max(0, bitmap.width - sourceSize)
    const maxY = Math.max(0, bitmap.height - sourceSize)
    const sx = crop
      ? Math.max(0, Math.min(crop.x, maxX))
      : Math.max(0, (bitmap.width - sourceSize) / 2)
    const sy = crop
      ? Math.max(0, Math.min(crop.y, maxY))
      : Math.max(0, (bitmap.height - sourceSize) / 2)

    const canvas = document.createElement('canvas')
    canvas.width = OUTPUT_SIZE
    canvas.height = OUTPUT_SIZE
    const context = canvas.getContext('2d')
    if (!context) throw new Error('This browser could not prepare the image.')

    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
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

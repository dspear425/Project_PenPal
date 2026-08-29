import { useEffect, useMemo, useRef, useState } from 'react'
import { prepareProfilePhoto } from '../lib/profilePhoto'

type Props = {
  file: File
  working: boolean
  onCancel: () => void
  onConfirm: (blob: Blob) => Promise<void> | void
}

type ImageSize = {
  width: number
  height: number
}

type Point = {
  x: number
  y: number
}

type DragState = {
  pointerId: number
  startX: number
  startY: number
  originX: number
  originY: number
}

const VIEWPORT = 320
const MOVE_STEP = 18

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export default function ProfilePhotoCropper({ file, working, onCancel, onConfirm }: Props) {
  const [imageUrl, setImageUrl] = useState('')
  const [imageSize, setImageSize] = useState<ImageSize | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 })
  const [message, setMessage] = useState('')
  const dragRef = useRef<DragState | null>(null)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    setImageUrl(url)
    setImageSize(null)
    setZoom(1)
    setOffset({ x: 0, y: 0 })
    setMessage('')

    const image = new Image()
    image.onload = () => setImageSize({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => setMessage('This image could not be opened. Try another photo.')
    image.src = url

    return () => URL.revokeObjectURL(url)
  }, [file])

  const geometry = useMemo(() => {
    if (!imageSize) return null
    const baseScale = Math.max(VIEWPORT / imageSize.width, VIEWPORT / imageSize.height)
    const scale = baseScale * zoom
    const displayWidth = imageSize.width * scale
    const displayHeight = imageSize.height * scale
    return {
      baseScale,
      scale,
      displayWidth,
      displayHeight,
      maxX: Math.max(0, (displayWidth - VIEWPORT) / 2),
      maxY: Math.max(0, (displayHeight - VIEWPORT) / 2),
    }
  }, [imageSize, zoom])

  useEffect(() => {
    if (!geometry) return
    setOffset((current) => ({
      x: clamp(current.x, -geometry.maxX, geometry.maxX),
      y: clamp(current.y, -geometry.maxY, geometry.maxY),
    }))
  }, [geometry?.maxX, geometry?.maxY])

  function clampOffset(next: Point) {
    if (!geometry) return next
    return {
      x: clamp(next.x, -geometry.maxX, geometry.maxX),
      y: clamp(next.y, -geometry.maxY, geometry.maxY),
    }
  }

  function startDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!geometry || working) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    }
  }

  function moveDrag(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId || working) return
    setOffset(clampOffset({
      x: drag.originX + (event.clientX - drag.startX),
      y: drag.originY + (event.clientY - drag.startY),
    }))
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function moveBy(x: number, y: number) {
    setOffset((current) => clampOffset({ x: current.x + x, y: current.y + y }))
  }

  function resetCrop() {
    setZoom(1)
    setOffset({ x: 0, y: 0 })
  }

  async function confirmCrop() {
    if (!geometry || !imageSize || working) return
    setMessage('')

    try {
      const sourceSize = VIEWPORT / geometry.scale
      const x = (geometry.displayWidth / 2 - VIEWPORT / 2 - offset.x) / geometry.scale
      const y = (geometry.displayHeight / 2 - VIEWPORT / 2 - offset.y) / geometry.scale
      const blob = await prepareProfilePhoto(file, { x, y, size: sourceSize })
      await onConfirm(blob)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The crop could not be prepared.')
    }
  }

  return (
    <section className="profile-cropper" aria-labelledby="profile-crop-title">
      <div className="profile-crop-heading">
        <div>
          <p className="eyebrow">Step 2 of 2</p>
          <h3 id="profile-crop-title">Choose how your photo looks.</h3>
          <p>Drag the photo to reposition it and use Zoom to frame yourself. The circle shows how it will usually appear as an avatar.</p>
        </div>
        <button className="secondary" type="button" disabled={working} onClick={resetCrop}>Reset</button>
      </div>

      {message && <p className="status-message profile-crop-status">{message}</p>}

      <div className="profile-crop-workspace">
        <div>
          <div
            className={`profile-crop-viewport ${working ? 'is-working' : ''}`}
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            role="img"
            aria-label="Interactive profile photo crop preview"
          >
            {imageUrl && imageSize && geometry && (
              <img
                src={imageUrl}
                alt=""
                draggable={false}
                style={{
                  width: `${geometry.displayWidth}px`,
                  height: `${geometry.displayHeight}px`,
                  transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
                }}
              />
            )}
            <div className="profile-crop-circle" aria-hidden="true" />
            <div className="profile-crop-crosshair" aria-hidden="true"><span /><span /></div>
          </div>
          <p className="profile-crop-drag-hint">Drag with a mouse or finger to reposition.</p>
        </div>

        <div className="profile-crop-controls">
          <label>
            <span>Zoom <strong>{Math.round(zoom * 100)}%</strong></span>
            <input
              type="range"
              min="1"
              max="3"
              step="0.01"
              value={zoom}
              disabled={working || !imageSize}
              onChange={(event) => setZoom(Number(event.target.value))}
            />
          </label>

          <div className="profile-crop-nudge">
            <span>Fine position</span>
            <div className="profile-crop-nudge-grid" aria-label="Photo positioning controls">
              <span />
              <button type="button" disabled={working || !imageSize} aria-label="Move photo up" onClick={() => moveBy(0, -MOVE_STEP)}>↑</button>
              <span />
              <button type="button" disabled={working || !imageSize} aria-label="Move photo left" onClick={() => moveBy(-MOVE_STEP, 0)}>←</button>
              <button type="button" disabled={working || !imageSize} aria-label="Center photo" onClick={() => setOffset({ x: 0, y: 0 })}>•</button>
              <button type="button" disabled={working || !imageSize} aria-label="Move photo right" onClick={() => moveBy(MOVE_STEP, 0)}>→</button>
              <span />
              <button type="button" disabled={working || !imageSize} aria-label="Move photo down" onClick={() => moveBy(0, MOVE_STEP)}>↓</button>
              <span />
            </div>
            <small>These buttons provide precise positioning without dragging.</small>
          </div>

          <div className="profile-crop-output-note">
            <strong>What gets uploaded</strong>
            <span>Only the crop you choose is re-encoded into a fresh 512×512 JPEG. The original photo and its embedded metadata are not uploaded.</span>
          </div>
        </div>
      </div>

      <div className="profile-crop-actions">
        <button className="primary" type="button" disabled={working || !imageSize} onClick={() => void confirmCrop()}>{working ? 'Saving photo…' : 'Use this crop'}</button>
        <button className="secondary" type="button" disabled={working} onClick={onCancel}>Choose a different photo</button>
      </div>
    </section>
  )
}

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = resolve(root, 'public')
mkdirSync(outputDir, { recursive: true })

const palette = {
  plum: [81, 33, 63, 255],
  berry: [122, 46, 85, 255],
  teal: [79, 119, 115, 255],
  paper: [255, 250, 243, 255],
  coral: [201, 111, 99, 255],
  gold: [181, 138, 73, 255],
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])))
  return Buffer.concat([length, typeBuffer, data, crc])
}

function makeCanvas(size) {
  const pixels = new Uint8Array(size * size * 4)
  const setPixel = (x, y, color) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return
    const index = (Math.floor(y) * size + Math.floor(x)) * 4
    pixels[index] = color[0]
    pixels[index + 1] = color[1]
    pixels[index + 2] = color[2]
    pixels[index + 3] = color[3]
  }
  const fillRect = (x, y, width, height, color) => {
    const x0 = Math.max(0, Math.floor(x))
    const y0 = Math.max(0, Math.floor(y))
    const x1 = Math.min(size, Math.ceil(x + width))
    const y1 = Math.min(size, Math.ceil(y + height))
    for (let py = y0; py < y1; py += 1) {
      for (let px = x0; px < x1; px += 1) setPixel(px, py, color)
    }
  }
  const fillCircle = (centerX, centerY, radius, color) => {
    const x0 = Math.max(0, Math.floor(centerX - radius))
    const y0 = Math.max(0, Math.floor(centerY - radius))
    const x1 = Math.min(size, Math.ceil(centerX + radius))
    const y1 = Math.min(size, Math.ceil(centerY + radius))
    const radiusSquared = radius * radius
    for (let py = y0; py < y1; py += 1) {
      for (let px = x0; px < x1; px += 1) {
        const dx = px + 0.5 - centerX
        const dy = py + 0.5 - centerY
        if (dx * dx + dy * dy <= radiusSquared) setPixel(px, py, color)
      }
    }
  }
  const fillRoundedRect = (x, y, width, height, radius, color) => {
    const x0 = Math.max(0, Math.floor(x))
    const y0 = Math.max(0, Math.floor(y))
    const x1 = Math.min(size, Math.ceil(x + width))
    const y1 = Math.min(size, Math.ceil(y + height))
    const safeRadius = Math.min(radius, width / 2, height / 2)
    for (let py = y0; py < y1; py += 1) {
      for (let px = x0; px < x1; px += 1) {
        const sampleX = px + 0.5
        const sampleY = py + 0.5
        const nearestX = Math.max(x + safeRadius, Math.min(sampleX, x + width - safeRadius))
        const nearestY = Math.max(y + safeRadius, Math.min(sampleY, y + height - safeRadius))
        const dx = sampleX - nearestX
        const dy = sampleY - nearestY
        if (dx * dx + dy * dy <= safeRadius * safeRadius) setPixel(px, py, color)
      }
    }
  }
  const line = (x0, y0, x1, y1, thickness, color) => {
    const dx = x1 - x0
    const dy = y1 - y0
    const steps = Math.max(Math.abs(dx), Math.abs(dy), 1)
    const radius = Math.max(1, Math.round(thickness / 2))
    for (let step = 0; step <= steps; step += 1) {
      const x = x0 + (dx * step) / steps
      const y = y0 + (dy * step) / steps
      fillCircle(x, y, radius, color)
    }
  }
  return { pixels, fillCircle, fillRect, fillRoundedRect, line }
}

function drawIcon(size) {
  const { pixels, fillCircle, fillRect, fillRoundedRect, line } = makeCanvas(size)
  fillRect(0, 0, size, size, palette.plum)

  const left = size * 0.148
  const right = size * 0.852
  const top = size * 0.277
  const bottom = size * 0.73
  const border = Math.max(4, size * 0.035)
  const radius = size * 0.074
  const centerX = size / 2
  const foldY = size * 0.555

  fillRoundedRect(left, top, right - left, bottom - top, radius, palette.coral)
  fillRoundedRect(
    left + border,
    top + border,
    right - left - border * 2,
    bottom - top - border * 2,
    Math.max(2, radius - border),
    palette.paper,
  )

  line(left + border * 1.2, top + border * 1.2, centerX, foldY, border * 0.75, palette.berry)
  line(right - border * 1.2, top + border * 1.2, centerX, foldY, border * 0.75, palette.berry)
  line(left + border * 1.2, bottom - border * 1.2, centerX - size * 0.082, size * 0.516, border * 0.52, palette.teal)
  line(right - border * 1.2, bottom - border * 1.2, centerX + size * 0.082, size * 0.516, border * 0.52, palette.teal)

  const badgeX = size * 0.77
  const badgeY = size * 0.258
  const badgeRadius = size * 0.086
  const nodeRadius = Math.max(3, size * 0.016)
  const nodeTop = { x: badgeX, y: badgeY - size * 0.041 }
  const nodeLeft = { x: badgeX - size * 0.043, y: badgeY + size * 0.027 }
  const nodeRight = { x: badgeX + size * 0.043, y: badgeY + size * 0.027 }
  fillCircle(badgeX, badgeY, badgeRadius, palette.gold)
  line(nodeTop.x, nodeTop.y, nodeLeft.x, nodeLeft.y, size * 0.016, palette.plum)
  line(nodeLeft.x, nodeLeft.y, nodeRight.x, nodeRight.y, size * 0.016, palette.plum)
  line(nodeRight.x, nodeRight.y, nodeTop.x, nodeTop.y, size * 0.016, palette.plum)
  fillCircle(nodeTop.x, nodeTop.y, nodeRadius, palette.plum)
  fillCircle(nodeLeft.x, nodeLeft.y, nodeRadius, palette.plum)
  fillCircle(nodeRight.x, nodeRight.y, nodeRadius, palette.plum)

  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (size * 4 + 1)
    raw[rowStart] = 0
    const sourceStart = y * size * 4
    Buffer.from(pixels.buffer, pixels.byteOffset + sourceStart, size * 4).copy(raw, rowStart + 1)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND'),
  ])
}

for (const size of [180, 192, 512]) {
  writeFileSync(resolve(outputDir, `icon-${size}.png`), drawIcon(size))
}

console.log('Generated OutKin PWA icons: 180, 192, 512.')

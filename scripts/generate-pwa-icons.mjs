import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = resolve(root, 'public')
mkdirSync(outputDir, { recursive: true })

const palette = {
  paper: [244, 239, 230, 255],
  white: [255, 253, 249, 255],
  rust: [138, 78, 61, 255],
  soft: [199, 155, 133, 255],
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
  const line = (x0, y0, x1, y1, thickness, color) => {
    const dx = x1 - x0
    const dy = y1 - y0
    const steps = Math.max(Math.abs(dx), Math.abs(dy), 1)
    const radius = Math.max(1, Math.round(thickness / 2))
    for (let step = 0; step <= steps; step += 1) {
      const x = x0 + (dx * step) / steps
      const y = y0 + (dy * step) / steps
      fillRect(x - radius, y - radius, radius * 2 + 1, radius * 2 + 1, color)
    }
  }
  return { pixels, fillRect, line }
}

function drawIcon(size) {
  const { pixels, fillRect, line } = makeCanvas(size)
  fillRect(0, 0, size, size, palette.paper)

  const left = size * 0.17
  const right = size * 0.83
  const top = size * 0.25
  const bottom = size * 0.76
  const border = Math.max(4, size * 0.035)
  const centerX = size / 2
  const foldY = size * 0.55

  fillRect(left, top, right - left, bottom - top, palette.rust)
  fillRect(left + border, top + border, right - left - border * 2, bottom - top - border * 2, palette.white)

  line(left + border, top + border, centerX, foldY, border * 0.75, palette.rust)
  line(right - border, top + border, centerX, foldY, border * 0.75, palette.rust)
  line(left + border, bottom - border, centerX - size * 0.08, foldY + size * 0.02, border * 0.5, palette.soft)
  line(right - border, bottom - border, centerX + size * 0.08, foldY + size * 0.02, border * 0.5, palette.soft)

  const badgeSize = size * 0.17
  const badgeX = size * 0.72
  const badgeY = size * 0.13
  fillRect(badgeX, badgeY, badgeSize, badgeSize, palette.rust)
  line(badgeX + badgeSize * 0.25, badgeY + badgeSize / 2, badgeX + badgeSize * 0.75, badgeY + badgeSize / 2, border * 0.42, palette.white)
  line(badgeX + badgeSize / 2, badgeY + badgeSize * 0.25, badgeX + badgeSize / 2, badgeY + badgeSize * 0.75, border * 0.42, palette.white)

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

console.log('Generated Project PenPal PWA icons: 180, 192, 512.')

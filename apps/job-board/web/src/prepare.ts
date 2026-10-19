// Turns a picked File into the bytes we upload. Browser-only, no network. Only api.ts imports it.
//
// Images (JPEG, PNG) are always redrawn through a canvas, never uploaded as picked:
//   - A canvas holds pixels, not metadata, so EXIF, GPS and maker notes are gone. Orientation is applied
//     while decoding, so phone photos stay upright.
//   - Long edge at most 2560 px, never upscaled. JPEG at q0.85, except a PNG with transparency stays PNG.
//   - A 480 px JPEG thumbnail comes from the same pixels.
//   - The encoder's own output is scrubbed too (some browsers embed a colour profile segment), because the
//     server refuses any image that still carries metadata (gate.upload_done, `clean`).
// PDFs and ZIPs pass through untouched.
import { UPLOAD_RULES, type UploadKind } from '@boromtech/domain'

export interface Prepared {
  blob: Blob
  /** The picked name, with the extension matching `mime` for images. */
  name: string
  mime: string
  /** Pixel size of `blob`, images only. */
  width?: number
  height?: number
  /** 480 px JPEG, images only. */
  thumb?: Blob
}

/** A file the user can fix by picking another one. The message is shown as is. */
export class PrepareError extends Error {}

const MAX_EDGE = 2560
const THUMB_EDGE = 480
const MB = 1048576

export async function prepare(file: File, kind: UploadKind): Promise<Prepared> {
  const rules = UPLOAD_RULES[kind]
  const mime = typeOf(file)
  if (!(rules.mimes as readonly string[]).includes(mime)) throw new PrepareError(`${file.name}: only ${accepted(kind)} files are accepted here.`)
  if (file.size === 0) throw new PrepareError(`${file.name} is empty.`)
  const out = mime.startsWith('image/') ? await image(file, mime) : { blob: file, name: file.name, mime }
  if (out.blob.size > rules.maxBytes) throw new PrepareError(`${file.name} is larger than ${rules.maxBytes / MB} MB.`)
  return { ...out, name: clamp(out.name) }
}

/** The server keeps names up to 200 characters; shorten the stem, keep the extension. */
function clamp(name: string): string {
  const ext = /\.[^.]{1,10}$/.exec(name)?.[0] ?? ''
  return name.length <= 200 ? name : name.slice(0, 200 - ext.length) + ext
}

const EXTENSIONS: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', pdf: 'application/pdf', zip: 'application/zip' }

/** Some systems report '' or Windows' ZIP type; fall back to the extension. */
function typeOf(file: File): string {
  if (file.type === 'application/x-zip-compressed') return 'application/zip'
  return file.type || EXTENSIONS[file.name.split('.').pop()!.toLowerCase()] || ''
}

/** e.g. "JPG, PNG or PDF". */
function accepted(kind: UploadKind): string {
  const names = UPLOAD_RULES[kind].mimes.map((m) => m.split('/')[1].replace('jpeg', 'jpg').toUpperCase())
  return `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`
}

async function image(file: File, mime: string): Promise<Prepared> {
  const picture = await decode(file)
  try {
    const main = scale(picture.source, picture.width, picture.height, MAX_EDGE)
    const keepPng = mime === 'image/png' && hasAlpha(main)
    const type = keepPng ? 'image/png' : 'image/jpeg'
    // An opaque image needs no background; a transparent PNG becoming a JPEG thumbnail gets white, not black.
    const thumb = scale(main.canvas, main.canvas.width, main.canvas.height, THUMB_EDGE, '#fff')
    return {
      blob: await scrub(await encode(main.canvas, type, 0.85)),
      name: file.name.replace(/\.[^.]*$/, '') + (keepPng ? '.png' : '.jpg'),
      mime: type,
      width: main.canvas.width,
      height: main.canvas.height,
      thumb: await scrub(await encode(thumb.canvas, 'image/jpeg', 0.8)),
    }
  } finally {
    picture.release()
  }
}

interface Picture {
  source: CanvasImageSource
  width: number
  height: number
  release(): void
}

/** Decodes with EXIF orientation applied. createImageBitmap first; <img> where it lacks 'from-image'. */
async function decode(file: File): Promise<Picture> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { source: bmp, width: bmp.width, height: bmp.height, release: () => bmp.close() }
    } catch {
      // An older engine rejects the 'from-image' value; an <img> applies EXIF orientation by default.
    }
  }
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.src = url
  try {
    await img.decode()
  } catch {
    URL.revokeObjectURL(url)
    throw new PrepareError(`${file.name} can't be opened as an image. Export it as JPG or PNG and try again.`)
  }
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) }
}

type Canvas = OffscreenCanvas | HTMLCanvasElement
type Context = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D
interface Surface {
  canvas: Canvas
  ctx: Context
}

/** OffscreenCanvas where it has a 2D context (Safari added that in 16.4), else a detached <canvas>. */
function surface(width: number, height: number): Surface {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (ctx) return { canvas, ctx }
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new PrepareError('This browser can’t process images. Try another browser.')
  return { canvas, ctx }
}

/**
 * Draws `src` with its long edge at most `max` (never larger than the source). Big reductions go in halving
 * steps, so browsers whose smoothing is a single bilinear pass don't alias, and so a huge photo never needs
 * one full-size canvas (iOS caps canvas area).
 */
function scale(src: CanvasImageSource, width: number, height: number, max: number, background?: string): Surface {
  const k = Math.min(1, max / Math.max(width, height))
  const w = Math.max(1, Math.round(width * k))
  const h = Math.max(1, Math.round(height * k))
  let cur = src
  let cw = width
  let ch = height
  while (cw >= w * 2 && ch >= h * 2) {
    cw = Math.round(cw / 2)
    ch = Math.round(ch / 2)
    const step = surface(cw, ch)
    step.ctx.imageSmoothingQuality = 'high'
    step.ctx.drawImage(cur, 0, 0, cw, ch)
    cur = step.canvas
  }
  const out = surface(w, h)
  if (background) {
    out.ctx.fillStyle = background
    out.ctx.fillRect(0, 0, w, h)
  }
  out.ctx.imageSmoothingQuality = 'high'
  out.ctx.drawImage(cur, 0, 0, w, h)
  return out
}

function hasAlpha({ canvas, ctx }: Surface): boolean {
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true
  return false
}

async function encode(canvas: Canvas, type: string, quality: number): Promise<Blob> {
  const blob =
    'convertToBlob' in canvas
      ? await canvas.convertToBlob({ type, quality })
      : await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
  if (!blob || blob.type !== type) throw new PrepareError('This browser can’t process images. Try another browser.')
  return blob
}

// ---- metadata scrub: drops exactly what the server's `clean` check refuses ----------------------------

/** JPEG markers: APP1 (EXIF/XMP), APP2 (ICC), APP13 (IPTC), COM. These two sets must equal the ones
 * apps/job-board/api/internal/facts/facts.go rejects, or uploads from some browsers fail verification. */
const JPEG_DROP = new Set([0xe1, 0xe2, 0xed, 0xfe])
const PNG_DROP = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt'])

async function scrub(blob: Blob): Promise<Blob> {
  const b = new Uint8Array(await blob.arrayBuffer())
  const parts = blob.type === 'image/jpeg' ? jpegParts(b) : pngParts(b)
  return parts.length === 1 ? blob : new Blob(parts, { type: blob.type })
}

/** Segments before SOS, minus the dropped ones, then everything from SOS on. */
function jpegParts(b: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer>[] {
  if (b[0] !== 0xff || b[1] !== 0xd8) return [b]
  const parts = [b.subarray(0, 2)]
  let i = 2
  let dropped = false
  while (i + 4 <= b.length && b[i] === 0xff && b[i + 1] !== 0xda) {
    const end = i + 2 + ((b[i + 2] << 8) | b[i + 3])
    if (JPEG_DROP.has(b[i + 1])) dropped = true
    else parts.push(b.subarray(i, end))
    i = end
  }
  parts.push(b.subarray(i))
  return dropped ? parts : [b]
}

/** Signature, then every chunk (length, type, data, CRC) except text and EXIF chunks. */
function pngParts(b: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer>[] {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const parts = [b.subarray(0, 8)]
  let i = 8
  let dropped = false
  while (i + 12 <= b.length) {
    const end = i + 12 + view.getUint32(i)
    if (PNG_DROP.has(String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]))) dropped = true
    else parts.push(b.subarray(i, end))
    i = end
  }
  if (i < b.length) parts.push(b.subarray(i))
  return dropped ? parts : [b]
}

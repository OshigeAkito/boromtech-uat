// Attachments as the UI sees them, and the upload limits the file picker needs before asking the server.
// Postgres is the authority (lib.file_rules(), lib.file_visible()). UPLOAD_RULES mirrors lib.file_rules() for
// UX only, and contract.test.ts fails CI if they differ.

/** Kinds a browser may upload. 'avatar' exists in SQL, but only the transport writes it (at sign-in). */
export type UploadKind = 'submission' | 'brief'

/** Mirrors lib.file_rules() for the uploadable kinds. */
export const UPLOAD_RULES = {
  submission: { mimes: ['image/jpeg', 'image/png', 'application/pdf', 'application/zip'], maxBytes: 15 * 1048576 },
  brief: { mimes: ['image/jpeg', 'image/png', 'application/pdf'], maxBytes: 25 * 1048576 },
} as const satisfies Record<UploadKind, { mimes: readonly string[]; maxBytes: number }>

export interface Attachment {
  id: string
  name: string
  mime: string
  bytes: number | null
  width: number | null
  height: number | null
  /** Same-origin URL; the server answers with a cached redirect to a signed R2 URL. Works in <img> and <a>. */
  src: string
  /** Small JPEG preview for images; null for PDFs and ZIPs (render an icon). */
  thumbSrc: string | null
}

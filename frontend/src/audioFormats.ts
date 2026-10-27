/**
 * Files the upload picker accepts. Kept in step with the allowlist in the
 * backend's RecordingService -- the server rejects anything else anyway.
 */
export const ACCEPTED_EXTENSIONS = [
  'm4a',
  'mp3',
  'wav',
  'aac',
  'ogg',
  'opus',
  'flac',
  'webm',
  'mp4',
] as const;

export const ACCEPTED_LABEL = ACCEPTED_EXTENSIONS.map((ext) => ext.toUpperCase()).join(', ');

/**
 * Narrows the system picker only. Android reports MIME types inconsistently
 * (m4a can arrive as audio/mp4a-latm), so the extension check is the real gate.
 */
export const PICKER_TYPES = ['audio/*', 'video/mp4', 'video/webm'];

/** Matches spring.servlet.multipart.max-file-size in application.yml. */
export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

/** A user-facing reason the file can't be uploaded, or null if it looks fine. */
export function checkPickedFile(name: string, size?: number): string | null {
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) {
    return `Gist can't read ${ext ? `.${ext}` : 'that kind of'} files. Choose a ${ACCEPTED_LABEL} file.`;
  }
  if (size !== undefined && size > MAX_UPLOAD_BYTES) {
    return `That file is ${(size / 1024 / 1024).toFixed(0)} MB. The upload limit is 200 MB.`;
  }
  return null;
}

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

const ALLOWED = new Set<string>(ALLOWED_IMAGE_MIME_TYPES);

export interface ImageValidationOk {
  ok: true;
}
export interface ImageValidationErr {
  ok: false;
  reason: string;
}
export type ImageValidationResult = ImageValidationOk | ImageValidationErr;

export function validateImageFile(file: File): ImageValidationResult {
  if (!ALLOWED.has(file.type)) {
    return {
      ok: false,
      reason: '対応していない画像形式です（JPEG / PNG / GIF / WebP のみ対応）',
    };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      reason: 'ファイルサイズは 5MB 以下にしてください',
    };
  }
  return { ok: true };
}

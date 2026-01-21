const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'video/mp4', 'video/quicktime'];
const MAX_SIZE = 300 * 1024 * 1024; // 300MB

export function validateFile(file: File): { valid: boolean; error?: string } {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { valid: false, error: `File type not supported. Allowed: ${ALLOWED_TYPES.join(', ')}` };
  }

  if (file.size > MAX_SIZE) {
    return { valid: false, error: `File too large. Max: 300MB` };
  }

  return { valid: true };
}

export function getFileExtension(filename: string): string {
  return filename.split('.').pop() || '';
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

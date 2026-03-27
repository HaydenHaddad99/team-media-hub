import { describe, it, expect } from 'vitest'
import { validateFile, getFileExtension, formatFileSize } from '../lib/validation'

// Minimal File-like constructor helper
function fakeFile(name: string, size: number, type: string): File {
  const blob = new Blob(['x'.repeat(Math.min(size, 100))], { type })
  Object.defineProperty(blob, 'size', { value: size })
  Object.defineProperty(blob, 'name', { value: name })
  return blob as File
}

describe('validateFile', () => {
  it('accepts image/jpeg', () => {
    const f = fakeFile('photo.jpg', 1024, 'image/jpeg')
    expect(validateFile(f)).toEqual({ valid: true })
  })

  it('accepts image/png', () => {
    const f = fakeFile('photo.png', 1024, 'image/png')
    expect(validateFile(f)).toEqual({ valid: true })
  })

  it('accepts image/heic', () => {
    const f = fakeFile('photo.heic', 1024, 'image/heic')
    expect(validateFile(f)).toEqual({ valid: true })
  })

  it('accepts video/mp4', () => {
    const f = fakeFile('video.mp4', 1024, 'video/mp4')
    expect(validateFile(f)).toEqual({ valid: true })
  })

  it('accepts video/quicktime', () => {
    const f = fakeFile('video.mov', 1024, 'video/quicktime')
    expect(validateFile(f)).toEqual({ valid: true })
  })

  it('rejects unsupported file type', () => {
    const f = fakeFile('doc.pdf', 1024, 'application/pdf')
    const result = validateFile(f)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('not supported')
  })

  it('rejects files over 300MB', () => {
    const f = fakeFile('big.jpg', 301 * 1024 * 1024, 'image/jpeg')
    const result = validateFile(f)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('too large')
  })

  it('accepts files at exactly 300MB', () => {
    const f = fakeFile('exact.jpg', 300 * 1024 * 1024, 'image/jpeg')
    expect(validateFile(f).valid).toBe(true)
  })
})

describe('getFileExtension', () => {
  it('extracts jpg', () => {
    expect(getFileExtension('photo.jpg')).toBe('jpg')
  })

  it('extracts png', () => {
    expect(getFileExtension('image.png')).toBe('png')
  })

  it('handles no extension', () => {
    expect(getFileExtension('README')).toBe('README')
  })

  it('handles multiple dots', () => {
    expect(getFileExtension('archive.tar.gz')).toBe('gz')
  })
})

describe('formatFileSize', () => {
  it('formats zero bytes', () => {
    expect(formatFileSize(0)).toBe('0 Bytes')
  })

  it('formats bytes', () => {
    expect(formatFileSize(500)).toBe('500 Bytes')
  })

  it('formats KB', () => {
    const result = formatFileSize(1024)
    expect(result).toBe('1 KB')
  })

  it('formats MB', () => {
    const result = formatFileSize(1048576)
    expect(result).toBe('1 MB')
  })

  it('formats GB', () => {
    const result = formatFileSize(1073741824)
    expect(result).toBe('1 GB')
  })

  it('formats fractional MB', () => {
    const result = formatFileSize(1572864) // 1.5 MB
    expect(result).toBe('1.5 MB')
  })
})

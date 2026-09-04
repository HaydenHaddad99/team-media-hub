import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
    getPlatform: vi.fn(() => 'web'),
  },
}));

const writeFile = vi.fn(async (_opts: { path: string; data: string; directory: string }) => ({
  uri: 'file:///cache/x',
}));
const deleteFile = vi.fn(async () => {});
const savePhoto = vi.fn(async () => {});
const saveVideo = vi.fn(async () => {});

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { writeFile, deleteFile },
  Directory: { Cache: 'CACHE' },
}));

vi.mock('@capacitor-community/media', () => ({
  Media: { savePhoto, saveVideo },
}));

import { Capacitor } from '@capacitor/core';
import { saveMediaToDevice } from '../lib/download';

// Plain object standing in for a fetch Response. Constructing a real
// `new Response(new Blob(...))` mixes jsdom's Blob with undici's Response,
// which explodes with "object.stream is not a function" on CI's Node —
// the plain object keeps everything inside jsdom's implementations.
const mockResponse = (body: string, status = 200, type = 'image/jpeg') =>
  ({
    ok: status >= 200 && status < 300,
    status,
    blob: async () => new Blob([body], { type }),
  }) as unknown as Response;

describe('saveMediaToDevice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
  });

  it('opens URLs in new tabs on web', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await saveMediaToDevice([{ url: 'https://cdn.example/a.jpg', filename: 'a.jpg' }]);
    expect(open).toHaveBeenCalledWith('https://cdn.example/a.jpg', '_blank');
    expect(savePhoto).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it('fetches, writes to cache, saves photo to library, cleans up on native', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse('fake-image-bytes')
    );

    await saveMediaToDevice([{ url: 'https://cdn.example/a.jpg', filename: 'a.jpg' }]);

    expect(fetchMock).toHaveBeenCalledWith('https://cdn.example/a.jpg');
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(writeFile.mock.calls[0]![0].path).toMatch(/a\.jpg$/);
    expect(savePhoto).toHaveBeenCalledWith({ path: 'file:///cache/x' });
    expect(saveVideo).not.toHaveBeenCalled();
    expect(deleteFile).toHaveBeenCalledTimes(1);
    fetchMock.mockRestore();
  });

  it('routes videos to saveVideo by blob type', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse('fake-video-bytes', 200, 'video/quicktime')
    );

    await saveMediaToDevice([{ url: 'https://cdn.example/v', filename: 'clip' }]);

    expect(saveVideo).toHaveBeenCalledWith({ path: 'file:///cache/x' });
    expect(savePhoto).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it('routes videos to saveVideo by extension when blob type is generic', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse('fake-video-bytes', 200, 'application/octet-stream')
    );

    await saveMediaToDevice([{ url: 'https://cdn.example/v.mov', filename: 'IMG_9468.mov' }]);

    expect(saveVideo).toHaveBeenCalledWith({ path: 'file:///cache/x' });
    fetchMock.mockRestore();
  });

  it('sanitizes path separators out of filenames', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse('x'));

    await saveMediaToDevice([{ url: 'https://cdn.example/a.jpg', filename: '../../etc/passwd' }]);

    expect(writeFile.mock.calls[0]![0].path).not.toContain('/');
    fetchMock.mockRestore();
  });

  it('cleans up the temp file even when the library save fails', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse('x'));
    savePhoto.mockRejectedValueOnce(new Error('permission denied'));

    await expect(
      saveMediaToDevice([{ url: 'https://cdn.example/a.jpg', filename: 'a.jpg' }])
    ).rejects.toThrow('permission denied');
    expect(deleteFile).toHaveBeenCalledTimes(1);
    fetchMock.mockRestore();
  });

  it('throws on a failed fetch on native', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse('', 403));
    await expect(
      saveMediaToDevice([{ url: 'https://cdn.example/a.jpg', filename: 'a.jpg' }])
    ).rejects.toThrow('Download failed (403)');
    expect(savePhoto).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });
});

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
const share = vi.fn(async () => {});

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { writeFile, deleteFile },
  Directory: { Cache: 'CACHE' },
}));

vi.mock('@capacitor/share', () => ({
  Share: { share },
}));

import { Capacitor } from '@capacitor/core';
import { saveMediaToDevice } from '../lib/download';

// Plain object standing in for a fetch Response. Constructing a real
// `new Response(new Blob(...))` mixes jsdom's Blob with undici's Response,
// which explodes with "object.stream is not a function" on CI's Node —
// the plain object keeps everything inside jsdom's implementations.
const mockResponse = (body: string, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    blob: async () => new Blob([body], { type: 'image/jpeg' }),
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
    expect(share).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it('fetches, writes to cache, shares, then cleans up on native', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse('fake-image-bytes')
    );

    await saveMediaToDevice([{ url: 'https://cdn.example/a.jpg', filename: 'a.jpg' }]);

    expect(fetchMock).toHaveBeenCalledWith('https://cdn.example/a.jpg');
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(writeFile.mock.calls[0]![0].path).toMatch(/a\.jpg$/);
    expect(share).toHaveBeenCalledWith({ files: ['file:///cache/x'] });
    expect(deleteFile).toHaveBeenCalledTimes(1);
    fetchMock.mockRestore();
  });

  it('sanitizes path separators out of filenames', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse('x'));

    await saveMediaToDevice([{ url: 'https://cdn.example/a.jpg', filename: '../../etc/passwd' }]);

    expect(writeFile.mock.calls[0]![0].path).not.toContain('/');
    fetchMock.mockRestore();
  });

  it('swallows share-sheet cancellation, propagates real errors', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => mockResponse('x')
    );

    share.mockRejectedValueOnce(new Error('Share canceled'));
    await expect(
      saveMediaToDevice([{ url: 'https://cdn.example/a.jpg', filename: 'a.jpg' }])
    ).resolves.toBeUndefined();

    share.mockRejectedValueOnce(new Error('boom'));
    await expect(
      saveMediaToDevice([{ url: 'https://cdn.example/a.jpg', filename: 'a.jpg' }])
    ).rejects.toThrow('boom');
    fetchMock.mockRestore();
  });

  it('throws on a failed fetch on native', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse('', 403));
    await expect(
      saveMediaToDevice([{ url: 'https://cdn.example/a.jpg', filename: 'a.jpg' }])
    ).rejects.toThrow('Download failed (403)');
    expect(share).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });
});

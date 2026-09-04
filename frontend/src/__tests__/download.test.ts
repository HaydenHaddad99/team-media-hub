import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
    getPlatform: vi.fn(() => 'web'),
  },
}));

const savePhoto = vi.fn(async () => {});
const saveVideo = vi.fn(async () => {});

vi.mock('@capacitor-community/media', () => ({
  Media: { savePhoto, saveVideo },
}));

import { Capacitor } from '@capacitor/core';
import { saveMediaToDevice } from '../lib/download';

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

  it('passes the presigned URL straight to savePhoto on native', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await saveMediaToDevice([
      { url: 'https://cdn.example/a.jpg?sig=abc', filename: 'a.jpg', contentType: 'image/jpeg' },
    ]);

    expect(savePhoto).toHaveBeenCalledWith({ path: 'https://cdn.example/a.jpg?sig=abc' });
    expect(saveVideo).not.toHaveBeenCalled();
    // the whole point of the rewrite: no JS-side download / base64 encoding
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('routes videos to saveVideo by content type', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);

    await saveMediaToDevice([
      { url: 'https://cdn.example/v', filename: 'clip', contentType: 'video/quicktime' },
    ]);

    expect(saveVideo).toHaveBeenCalledWith({ path: 'https://cdn.example/v' });
    expect(savePhoto).not.toHaveBeenCalled();
  });

  it('falls back to the filename extension when content type is missing', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);

    await saveMediaToDevice([{ url: 'https://cdn.example/v', filename: 'IMG_9468.mov' }]);

    expect(saveVideo).toHaveBeenCalledWith({ path: 'https://cdn.example/v' });
    expect(savePhoto).not.toHaveBeenCalled();
  });

  it('saves each file when several are selected', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);

    await saveMediaToDevice([
      { url: 'https://cdn.example/a.jpg', filename: 'a.jpg', contentType: 'image/jpeg' },
      { url: 'https://cdn.example/b.mov', filename: 'b.mov', contentType: 'video/quicktime' },
    ]);

    expect(savePhoto).toHaveBeenCalledTimes(1);
    expect(saveVideo).toHaveBeenCalledTimes(1);
  });

  it('propagates plugin errors', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    savePhoto.mockRejectedValueOnce(new Error('Unable to download image from URL'));

    await expect(
      saveMediaToDevice([{ url: 'https://cdn.example/a.jpg', filename: 'a.jpg' }])
    ).rejects.toThrow('Unable to download image from URL');
  });
});

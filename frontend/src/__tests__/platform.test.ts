import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
    getPlatform: vi.fn(() => 'web'),
  },
}));

import { Capacitor } from '@capacitor/core';
import { isNativePlatform, getNativePlatform } from '../lib/platform';

describe('platform', () => {
  beforeEach(() => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    vi.mocked(Capacitor.getPlatform).mockReturnValue('web');
  });

  it('reports web as not native', () => {
    expect(isNativePlatform()).toBe(false);
    expect(getNativePlatform()).toBe('web');
  });

  it('reports native platforms as native', () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(Capacitor.getPlatform).mockReturnValue('ios');
    expect(isNativePlatform()).toBe(true);
    expect(getNativePlatform()).toBe('ios');
  });
});

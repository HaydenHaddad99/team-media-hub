import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'co.teammediahub.app',
  appName: 'Team Media Hub',
  webDir: '../frontend/dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;

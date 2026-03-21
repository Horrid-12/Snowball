import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.howwid.snowball',
  appName: 'Snowball',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;

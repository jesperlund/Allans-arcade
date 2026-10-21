import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.jesperlund.allansarcade',
  appName: "Allan's Arcade",
  webDir: 'dist',
  backgroundColor: '#1b2550',
  android: {
    allowMixedContent: false,
  },
};

export default config;

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.techsource.attendance',
  appName: 'Tech Source Attendance',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;

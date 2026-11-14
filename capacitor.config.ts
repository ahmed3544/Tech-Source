import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.techsource.attendance',
  appName: 'Tech Source Attendance',
  webDir: 'dist',
  server: {
    // The new APK opens the Cloudflare Worker frontend. Its /api/* bridge
    // currently forwards requests to the existing Vercel production backend.
    url: 'https://tech-source.tech-source.workers.dev',
    androidScheme: 'https'
  }
};

export default config;

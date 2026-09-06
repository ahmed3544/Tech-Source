import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.techsource.attendance',
  appName: 'Tech Source Attendance',
  webDir: 'dist',
  server: {
    // The APK must use the live Vercel app so all relative /api/*
    // requests (login, data, punch, sync, shifts, leaves, etc.) reach
    // the Express backend instead of the local Capacitor WebView.
    url: 'https://tech-source.vercel.app',
    androidScheme: 'https'
  }
};

export default config;

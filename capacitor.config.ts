import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cozycraft.furniture',
  appName: 'CozyCraft Furniture',
  webDir: 'www',
  bundledWebRuntime: false,
  plugins: {
    SystemBars: {
      // MainActivity applies native window insets to the whole WebView. This is
      // required because the storefront is hosted in an iframe and CSS custom
      // properties injected into the Angular shell do not cross that boundary.
      insetsHandling: 'disable',
      style: 'light',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'banner', 'list'],
    },
  },
};

export default config;

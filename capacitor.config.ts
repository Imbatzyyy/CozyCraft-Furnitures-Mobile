import type { CapacitorConfig } from '@capacitor/cli';
import { RELEASE_CONFIG } from './src/app/updates/release-config';

const config: CapacitorConfig = {
  appId: 'com.cozycraft.furniture',
  appName: 'Cozy Craft Furnitures',
  webDir: 'www',
  bundledWebRuntime: false,
  plugins: {
    CapacitorUpdater: {
      autoUpdate: 'off',
      publicKey: RELEASE_CONFIG.publicKey,
      version: RELEASE_CONFIG.nativeVersion,
      appReadyTimeout: 60000,
      responseTimeout: 120,
      autoDeleteFailed: true,
      autoDeletePrevious: true,
      resetWhenUpdate: true,
      statsUrl: '',
      updateUrl: '',
      channelUrl: '',
      allowModifyUrl: false,
      allowModifyAppId: false,
      allowSetDefaultChannel: false,
      allowPreview: false,
      allowHttpsToHttpRedirect: false,
      allowShakeChannelSelector: false,
      shakeMenu: false,
    },
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

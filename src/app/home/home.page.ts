import { AfterViewInit, Component, ElementRef, HostListener, ViewChild } from '@angular/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
})
export class HomePage implements AfterViewInit {
  @ViewChild('storefront') storefront?: ElementRef<HTMLIFrameElement>;
  // Native push registration is supported on both packaged mobile platforms.
  private readonly nativePushConfigured = ['android', 'ios'].includes(Capacitor.getPlatform());
  private pendingAppUrl = window.localStorage.getItem('cozycraft-pending-native-url') || '';
  private pushToken = window.localStorage.getItem('cozycraft-native-push-token') || '';
  private deliveryTimers: number[] = [];

  private deliverAppUrl(url: string) {
    if (!url) return;
    this.pendingAppUrl = url;
    window.localStorage.setItem('cozycraft-pending-native-url', url);
    this.deliveryTimers.forEach((timer) => window.clearTimeout(timer));
    this.deliveryTimers = [0, 250, 750, 1500, 3000].map((delay) => window.setTimeout(() => {
      this.storefront?.nativeElement.contentWindow?.postMessage(
        { type: url.includes('://payment/') ? 'cozycraft-payment-callback' : 'cozycraft-auth-callback', url },
        '*',
      );
    }, delay));
  }

  onStorefrontLoad() {
    if (this.pendingAppUrl) this.deliverAppUrl(this.pendingAppUrl);
    this.deliverPushToken();
  }

  private deliverPushToken() {
    if (!this.pushToken) return;
    this.storefront?.nativeElement.contentWindow?.postMessage({
      type: 'cozycraft-push-token',
      token: this.pushToken,
      platform: Capacitor.getPlatform(),
    }, '*');
  }

  private async registerForPushNotifications() {
    if (!this.nativePushConfigured) return;
    if (Capacitor.getPlatform() === 'android') {
      await PushNotifications.createChannel({
        // A new channel id is intentional: Android never raises the importance
        // of an existing channel after it has been created on a device.
        id: 'cozycraft_important_v2',
        name: 'Important CozyCraft updates',
        description: 'Heads-up order, payment, delivery, refund, and account updates.',
        importance: 5,
        visibility: 1,
        vibration: true,
      });
    }
    const current = await PushNotifications.checkPermissions();
    const permission = current.receive === 'granted'
      ? current
      : await PushNotifications.requestPermissions();
    if (permission.receive === 'granted') await PushNotifications.register();
  }

  ngAfterViewInit() {
    // appUrlOpen covers a running app. getLaunchUrl is also required when
    // PayMongo's Back to merchant deep link cold-starts the native process.
    // deliverAppUrl keeps the callback until the storefront acknowledges it.
    void App.getLaunchUrl()
      .then((launch) => {
        if (launch?.url) this.deliverAppUrl(launch.url);
      })
      .catch((error) => {
        console.error('Unable to read the CozyCraft launch URL', error);
      });
    void PushNotifications.addListener('registration', ({ value }) => {
      this.pushToken = value;
      window.localStorage.setItem('cozycraft-native-push-token', value);
      this.deliverPushToken();
    });
    void PushNotifications.addListener('registrationError', (error) => {
      console.error('CozyCraft push registration failed', error);
    });
    void PushNotifications.addListener('pushNotificationActionPerformed', () => {
      this.storefront?.nativeElement.contentWindow?.postMessage(
        { type: 'cozycraft-open-notifications' },
        '*',
      );
    });
    void PushNotifications.addListener('pushNotificationReceived', (notification) => {
      this.storefront?.nativeElement.contentWindow?.postMessage({
        type: 'cozycraft-push-received',
        notification,
      }, '*');
    });
    void this.registerForPushNotifications().catch((error) => {
      console.error('CozyCraft push permission setup failed', error);
    });
    void App.addListener('appUrlOpen', async ({ url }) => {
      await Browser.close().catch(() => undefined);
      this.deliverAppUrl(url);
    });
    void App.addListener('appStateChange', ({ isActive }) => {
      if (isActive && this.pendingAppUrl) this.deliverAppUrl(this.pendingAppUrl);
    });
    void App.addListener('backButton', () => {
      this.storefront?.nativeElement.contentWindow?.postMessage(
        { type: 'cozycraft-native-back' },
        '*',
      );
    });
    void LocalNotifications.addListener('localNotificationActionPerformed', () => {
      this.storefront?.nativeElement.contentWindow?.postMessage(
        { type: 'cozycraft-open-notifications' },
        '*',
      );
    });
  }

  @HostListener('window:message', ['$event'])
  async onMessage(event: MessageEvent) {
    if (event.data?.type === 'cozycraft-app-url-consumed') {
      const url = String(event.data.url || '');
      if (!url || url === this.pendingAppUrl) {
        this.pendingAppUrl = '';
        window.localStorage.removeItem('cozycraft-pending-native-url');
        this.deliveryTimers.forEach((timer) => window.clearTimeout(timer));
        this.deliveryTimers = [];
      }
      return;
    }
    if (event.data?.type === 'cozycraft-native-back-unhandled') {
      await App.exitApp();
      return;
    }
    if (event.data?.type === 'cozycraft-open-oauth') {
      const url = String(event.data.url || '');
      if (!url.startsWith('https://')) return;
      await Browser.open({ url, presentationStyle: 'popover' });
      return;
    }
    if (event.data?.type === 'cozycraft-open-paymongo') {
      const url = String(event.data.url || '');
      if (!url.startsWith('https://')) {
        this.storefront?.nativeElement.contentWindow?.postMessage({
          type: 'cozycraft-paymongo-error',
          message: 'PayMongo did not provide a valid secure payment link.',
        }, '*');
        return;
      }
      try {
        await Browser.open({ url, presentationStyle: 'fullscreen' });
        this.storefront?.nativeElement.contentWindow?.postMessage({
          type: 'cozycraft-paymongo-opened',
        }, '*');
      } catch (error) {
        console.error('Unable to open PayMongo checkout', error);
        this.storefront?.nativeElement.contentWindow?.postMessage({
          type: 'cozycraft-paymongo-error',
          message: 'The secure PayMongo page could not be opened. Please try again.',
        }, '*');
      }
      return;
    }
    if (event.data?.type === 'cozycraft-local-notification') {
      const permission = await LocalNotifications.checkPermissions();
      const result = permission.display === 'granted'
        ? permission
        : await LocalNotifications.requestPermissions();
      if (result.display !== 'granted') return;
      const rawId = String(event.data.id || Date.now());
      const numericId = [...rawId].reduce((value, character) => ((value * 31) + character.charCodeAt(0)) | 0, 17);
      await LocalNotifications.schedule({ notifications: [{
        id: Math.abs(numericId || Date.now()) % 2147483647,
        title: String(event.data.title || 'CozyCraft update'),
        body: String(event.data.body || 'You have a new update.'),
        schedule: { at: new Date(Date.now() + 350) },
        channelId: 'cozycraft_important_v2',
        smallIcon: 'ic_stat_cozycraft',
        iconColor: '#A65F43',
        extra: { notificationId: rawId },
      }] });
    }
  }
}

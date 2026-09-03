import { AfterViewInit, Component, ElementRef, HostListener, ViewChild } from '@angular/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import type { OpenOptions } from '@capacitor/browser';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor, CapacitorHttp } from '@capacitor/core';

export const paymongoBrowserOptions = (url: string, platform: string): OpenOptions => ({
  url,
  presentationStyle: platform === 'ios' ? 'popover' : 'fullscreen',
  toolbarColor: '#F7F6F3',
});

const nativePaymentFunctions = new Set([
  'create-paymongo-checkout',
  'cancel-paymongo-checkout',
  'sync-paymongo-payments',
]);

export const isAllowedNativePaymentFunction = (name: string) => nativePaymentFunctions.has(name);

export const nativePaymentFunctionUrl = (name: string) =>
  `https://gwjsivqksyimuabbdyqq.supabase.co/functions/v1/${name}`;

export type NativePaymentOrderState = 'paid' | 'pending' | 'failed' | 'unknown';

export const nativePaymentOrderState = (value: unknown): NativePaymentOrderState => {
  if (!value || typeof value !== 'object') return 'unknown';
  const order = value as Record<string, unknown>;
  const paymentStatus = String(order['payment_status'] || '').trim().toLowerCase();
  const orderStatus = String(order['status'] || '').trim().toLowerCase();

  if (paymentStatus === 'paid') return 'paid';
  if (
    ['failed', 'cancelled', 'canceled', 'expired'].includes(paymentStatus) ||
    ['cancelled', 'canceled'].includes(orderStatus)
  ) return 'failed';
  if (paymentStatus || orderStatus) return 'pending';
  return 'unknown';
};

export const nativePaymentReturnUrl = (orderId: string, result: 'success' | 'cancelled') =>
  `com.cozycraft.furniture://payment/return?payment=${result}&order=${encodeURIComponent(orderId)}`;

export const nativeIOSMajorVersion = (userAgent: string) => {
  const match = userAgent.match(/(?:CPU(?: iPhone)? OS|iPhone OS) (\d+)[._]/i);
  return Number(match?.[1] || 0);
};

const iosLaunchStyleSelector = 'style[data-cozycraft-ios-launch-fix]';
const iosLaunchMarkSelector = '[data-cozycraft-ios-launch-mark]';

const replaceIOSLaunchMark = (targetDocument: Document) => {
  const mark = targetDocument.querySelector<HTMLElement>('.splash .auth-mark');
  const logo = mark?.querySelector<HTMLImageElement>('img');
  if (!mark || !logo || mark.querySelector(iosLaunchMarkSelector)) return false;

  const svgNamespace = 'http://www.w3.org/2000/svg';
  const svg = targetDocument.createElementNS(svgNamespace, 'svg');
  const definitions = targetDocument.createElementNS(svgNamespace, 'defs');
  const clipPath = targetDocument.createElementNS(svgNamespace, 'clipPath');
  const image = targetDocument.createElementNS(svgNamespace, 'image');
  const clipId = 'cozycraft-ios-single-sofa';

  svg.setAttribute('viewBox', '0 0 4688 1563');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', logo.alt || 'CozyCraft Furniture');
  svg.setAttribute('data-cozycraft-ios-launch-mark', 'true');
  clipPath.setAttribute('id', clipId);

  // Preserve the original wordmark while removing only the lower rail and
  // feet beneath its sofa-shaped O. The upper sofa outline remains intact,
  // so iOS displays one sofa instead of two stacked silhouettes.
  [
    ['0', '0', '1600', '1563'],
    ['2760', '0', '1928', '1563'],
    ['1600', '0', '1160', '610'],
    ['1600', '780', '1160', '783'],
  ].forEach(([x, y, width, height]) => {
    const rectangle = targetDocument.createElementNS(svgNamespace, 'rect');
    rectangle.setAttribute('x', x);
    rectangle.setAttribute('y', y);
    rectangle.setAttribute('width', width);
    rectangle.setAttribute('height', height);
    clipPath.appendChild(rectangle);
  });

  image.setAttribute('href', logo.currentSrc || logo.src || logo.getAttribute('src') || '');
  image.setAttribute('width', '4688');
  image.setAttribute('height', '1563');
  image.setAttribute('clip-path', `url(#${clipId})`);
  definitions.appendChild(clipPath);
  svg.append(definitions, image);
  mark.replaceChildren(svg);
  return true;
};

export const installIOSLaunchStyle = (targetDocument: Document | null, platform: string) => {
  if (platform !== 'ios' || !targetDocument?.head) return false;
  let changed = replaceIOSLaunchMark(targetDocument);

  if (!targetDocument.querySelector(iosLaunchStyleSelector)) {
    const style = targetDocument.createElement('style');
    style.dataset['cozycraftIosLaunchFix'] = 'true';
    style.textContent = `
      .splash .auth-mark > svg[data-cozycraft-ios-launch-mark] {
        display: block;
        width: 100%;
        height: 100%;
        overflow: visible;
        filter: invert(1) brightness(5);
        opacity: .98;
      }
    `;
    targetDocument.head.appendChild(style);
    changed = true;
  }

  return changed;
};

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
})
export class HomePage implements AfterViewInit {
  @ViewChild('storefront') storefront?: ElementRef<HTMLIFrameElement>;
  private readonly platform = Capacitor.getPlatform();
  // The native iOS target currently deploys from iOS 26.0. Some iframe user
  // agents omit the OS token, so 26 is the safe native-only fallback.
  private readonly iosMajorVersion = this.platform === 'ios'
    ? nativeIOSMajorVersion(window.navigator.userAgent) || 26
    : 0;
  // Native push registration is supported on both packaged mobile platforms.
  private readonly nativePushConfigured = ['android', 'ios'].includes(this.platform);
  private pendingAppUrl = window.localStorage.getItem('cozycraft-pending-native-url') || '';
  private pushToken = window.localStorage.getItem('cozycraft-native-push-token') || '';
  private deliveryTimers: number[] = [];
  private paymongoBrowserOpening = false;
  private pendingPaymongoOrderId = '';
  private pendingPaymongoHeaders: Record<string, string> = {};
  private paymentMonitorTimer?: number;
  private paymentMonitorDeadline = 0;
  private paymentMonitorRunning = false;

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
    installIOSLaunchStyle(this.storefront?.nativeElement.contentDocument ?? null, this.platform);
    this.installNativePaymentBridge();
    this.deliverNativePlatform();
    if (this.pendingAppUrl) this.deliverAppUrl(this.pendingAppUrl);
    this.deliverPushToken();
    void this.deliverPushPermission();
  }

  private async deliverPushPermission() {
    const permission = this.nativePushConfigured
      ? (await PushNotifications.checkPermissions()).receive
      : 'unsupported';
    this.storefront?.nativeElement.contentWindow?.postMessage({
      type: 'cozycraft-push-permission',
      status: permission,
    }, '*');
  }

  private deliverNativePlatform() {
    this.storefront?.nativeElement.contentWindow?.postMessage({
      type: 'cozycraft-native-platform',
      platform: this.platform,
      iosMajor: this.iosMajorVersion,
    }, '*');
  }

  private installNativePaymentBridge() {
    const document = this.storefront?.nativeElement.contentDocument;
    if (!document?.head || document.querySelector('script[data-cozycraft-native-payment-bridge]')) return;
    const script = document.createElement('script');
    script.src = '../native-payment-bridge.js';
    script.dataset['cozycraftNativePaymentBridge'] = 'true';
    document.head.prepend(script);
  }

  private deliverPushToken() {
    if (!this.pushToken) return;
    this.storefront?.nativeElement.contentWindow?.postMessage({
      type: 'cozycraft-push-token',
      token: this.pushToken,
      platform: this.platform,
    }, '*');
  }

  private rememberPendingPaymongoRequest(
    functionName: string,
    responseStatus: number,
    responseData: unknown,
    headers: Record<string, string>,
  ) {
    if (functionName !== 'create-paymongo-checkout' || responseStatus < 200 || responseStatus >= 300) return;
    if (!responseData || typeof responseData !== 'object') return;
    const orderId = String((responseData as Record<string, unknown>)['orderId'] || '').trim();
    if (!orderId) return;
    this.pendingPaymongoOrderId = orderId;
    this.pendingPaymongoHeaders = { ...headers };
  }

  private stopPaymentMonitor(clearRequest = false) {
    if (this.paymentMonitorTimer !== undefined) window.clearTimeout(this.paymentMonitorTimer);
    this.paymentMonitorTimer = undefined;
    this.paymentMonitorRunning = false;
    this.paymentMonitorDeadline = 0;
    if (clearRequest) {
      this.pendingPaymongoOrderId = '';
      this.pendingPaymongoHeaders = {};
    }
  }

  private schedulePaymentMonitor(delay = 0) {
    if (!this.pendingPaymongoOrderId || !Object.keys(this.pendingPaymongoHeaders).length) return;
    if (!this.paymentMonitorDeadline) this.paymentMonitorDeadline = Date.now() + 2 * 60_000;
    if (this.paymentMonitorTimer !== undefined) window.clearTimeout(this.paymentMonitorTimer);
    this.paymentMonitorTimer = window.setTimeout(() => void this.checkPendingPaymongoOrder(), delay);
  }

  private async readPendingPaymongoOrder(): Promise<NativePaymentOrderState> {
    const orderId = this.pendingPaymongoOrderId;
    const headers = { ...this.pendingPaymongoHeaders };
    if (!orderId || !Object.keys(headers).length) return 'unknown';

    // The webhook is normally enough, while this explicit reconciliation makes
    // the app return immediately even if webhook delivery is a little late.
    await CapacitorHttp.request({
      url: nativePaymentFunctionUrl('sync-paymongo-payments'),
      method: 'POST',
      headers,
      data: { orderIds: [orderId] },
      connectTimeout: 10_000,
      readTimeout: 20_000,
      responseType: 'json',
    });

    const response = await CapacitorHttp.request({
      url: `https://gwjsivqksyimuabbdyqq.supabase.co/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&select=id,order_number,payment_status,status`,
      method: 'GET',
      headers: { ...headers, Accept: 'application/json' },
      connectTimeout: 10_000,
      readTimeout: 15_000,
      responseType: 'json',
    });
    if (response.status < 200 || response.status >= 300) return 'unknown';
    const rows = Array.isArray(response.data)
      ? response.data
      : typeof response.data === 'string'
        ? JSON.parse(response.data)
        : [];
    return nativePaymentOrderState(Array.isArray(rows) ? rows[0] : undefined);
  }

  private async checkPendingPaymongoOrder() {
    if (this.paymentMonitorRunning || !this.pendingPaymongoOrderId) return;
    if (this.paymentMonitorDeadline && Date.now() >= this.paymentMonitorDeadline) {
      this.stopPaymentMonitor(true);
      return;
    }
    this.paymentMonitorRunning = true;
    try {
      const state = await this.readPendingPaymongoOrder();
      if (state === 'paid') {
        const orderId = this.pendingPaymongoOrderId;
        this.stopPaymentMonitor(true);
        await Browser.close().catch(() => undefined);
        this.deliverAppUrl(nativePaymentReturnUrl(orderId, 'success'));
        return;
      }
      if (state === 'failed') {
        const orderId = this.pendingPaymongoOrderId;
        this.stopPaymentMonitor(true);
        await Browser.close().catch(() => undefined);
        this.deliverAppUrl(nativePaymentReturnUrl(orderId, 'cancelled'));
        return;
      }
    } catch (error) {
      // A transient timeout should not interrupt a payment that is still open.
      console.warn('PayMongo payment status is not available yet', error);
    } finally {
      this.paymentMonitorRunning = false;
    }
    this.schedulePaymentMonitor(2_000);
  }

  private async registerForPushNotifications() {
    if (!this.nativePushConfigured) {
      await this.deliverPushPermission();
      return;
    }
    if (this.platform === 'android') {
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
    await this.deliverPushPermission();
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
    void App.addListener('appUrlOpen', async ({ url }) => {
      this.stopPaymentMonitor(true);
      await Browser.close().catch(() => undefined);
      this.deliverAppUrl(url);
    });
    void App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) this.storefront?.nativeElement.contentWindow?.postMessage({ type: 'cozycraft-native-app-active' }, '*');
      if (isActive && this.pendingAppUrl) this.deliverAppUrl(this.pendingAppUrl);
      if (isActive && this.pendingPaymongoOrderId) this.schedulePaymentMonitor(0);
    });
    void Browser.addListener('browserFinished', () => {
      // Ignore the defensive close immediately before presenting a fresh
      // checkout. A genuine user dismissal happens after opening completes.
      if (!this.paymongoBrowserOpening) this.stopPaymentMonitor(true);
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
    if (event.data?.type === 'cozycraft-request-push-permission') {
      if (event.source !== this.storefront?.nativeElement.contentWindow) return;
      await this.registerForPushNotifications().catch((error) => {
        console.error('CozyCraft push permission setup failed', error);
        void this.deliverPushPermission();
      });
      return;
    }
    if (event.data?.type === 'cozycraft-native-payment-request') {
      if (event.source !== this.storefront?.nativeElement.contentWindow) return;

      const requestId = String(event.data.requestId || '');
      const functionName = String(event.data.functionName || '');
      if (!/^[a-zA-Z0-9-]{8,100}$/.test(requestId) || !isAllowedNativePaymentFunction(functionName)) {
        return;
      }

      const incomingHeaders = event.data.headers && typeof event.data.headers === 'object'
        ? event.data.headers as Record<string, unknown>
        : {};
      const allowedHeaders = new Set([
        'authorization',
        'apikey',
        'content-type',
        'x-client-info',
        'x-supabase-api-version',
      ]);
      const headers = Object.entries(incomingHeaders).reduce<Record<string, string>>((result, [key, value]) => {
        if (allowedHeaders.has(key.toLowerCase()) && typeof value === 'string') result[key] = value;
        return result;
      }, {});

      try {
        const rawBody = typeof event.data.body === 'string' ? event.data.body : '';
        const data = rawBody ? JSON.parse(rawBody) : {};
        const response = await CapacitorHttp.request({
          url: nativePaymentFunctionUrl(functionName),
          method: 'POST',
          headers,
          data,
          connectTimeout: 15_000,
          readTimeout: 30_000,
          responseType: 'json',
        });
        this.rememberPendingPaymongoRequest(functionName, response.status, response.data, headers);
        this.storefront?.nativeElement.contentWindow?.postMessage({
          type: 'cozycraft-native-payment-response',
          requestId,
          status: response.status,
          data: response.data,
          contentType: response.headers?.['content-type'] || 'application/json',
        }, '*');
      } catch (error) {
        console.error(`Native ${functionName} request failed`, error);
        this.storefront?.nativeElement.contentWindow?.postMessage({
          type: 'cozycraft-native-payment-response',
          requestId,
          error: 'The secure payment service did not respond. Please try again.',
        }, '*');
      }
      return;
    }
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
      // Prevent a double tap, delayed iframe event, or restored checkout from
      // trying to present two native browser controllers at the same time.
      if (this.paymongoBrowserOpening) return;
      this.paymongoBrowserOpening = true;
      try {
        // The iOS app uses SceneDelegate. SFSafariViewController can fail to
        // appear when Capacitor presents it with `fullscreen` under that scene
        // lifecycle, even though Browser.open resolves successfully. Popover is
        // rendered as the normal secure Safari sheet on iPhone and works with
        // SceneDelegate. Android ignores this iOS-only option.
        await Browser.close().catch(() => undefined);
        await Browser.open(paymongoBrowserOptions(url, this.platform));
        this.schedulePaymentMonitor(750);
        this.storefront?.nativeElement.contentWindow?.postMessage({
          type: 'cozycraft-paymongo-opened',
        }, '*');
      } catch (error) {
        console.error('Unable to open PayMongo checkout', error);
        this.storefront?.nativeElement.contentWindow?.postMessage({
          type: 'cozycraft-paymongo-error',
          message: 'The secure PayMongo page could not be opened. Please try again.',
        }, '*');
      } finally {
        this.paymongoBrowserOpening = false;
      }
      return;
    }
    if (event.data?.type === 'cozycraft-local-notification') {
      const permission = await LocalNotifications.checkPermissions();
      // Local order alerts respect the permission the customer chose in
      // context. Realtime updates must never summon an OS permission dialog.
      if (permission.display !== 'granted') return;
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

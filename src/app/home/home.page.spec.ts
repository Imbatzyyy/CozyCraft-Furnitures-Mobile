import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ElementRef } from '@angular/core';
import { IonicModule } from '@ionic/angular';

import {
  HomePage,
  installIOSLaunchStyle,
  isAllowedNativePaymentFunction,
  nativeIOSMajorVersion,
  nativePaymentFunctionUrl,
  nativePaymentOrderState,
  nativePaymentReturnUrl,
  paymongoBrowserOptions,
} from './home.page';

describe('HomePage', () => {
  let component: HomePage;
  let fixture: ComponentFixture<HomePage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [HomePage],
      imports: [IonicModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(HomePage);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('uses the SceneDelegate-safe PayMongo presentation on iOS', () => {
    expect(paymongoBrowserOptions('https://checkout.paymongo.com/example-session', 'ios')).toEqual({
      url: 'https://checkout.paymongo.com/example-session',
      presentationStyle: 'popover',
      toolbarColor: '#F7F6F3',
    });
  });

  it('retains the Android browser presentation for GCash and card checkouts', () => {
    expect(paymongoBrowserOptions('https://checkout.paymongo.com/example-session', 'android')).toEqual({
      url: 'https://checkout.paymongo.com/example-session',
      presentationStyle: 'fullscreen',
      toolbarColor: '#F7F6F3',
    });
  });

  it('reads the native iOS major version used by the storefront dock', () => {
    expect(nativeIOSMajorVersion(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X) AppleWebKit/605.1.15',
    )).toBe(26);
    expect(nativeIOSMajorVersion('Mozilla/5.0 (Linux; Android 16)')).toBe(0);
  });

  it('keeps one sofa mark on the iOS launch screen without changing Android', () => {
    const iosDocument = document.implementation.createHTMLDocument('iOS storefront');
    iosDocument.body.innerHTML = `
      <main class="splash">
        <div class="auth-mark">
          <img src="assets/cozycraft.png" alt="CozyCraft Furniture">
        </div>
      </main>
    `;

    expect(installIOSLaunchStyle(iosDocument, 'ios')).toBeTrue();
    const launchFix = iosDocument.querySelector<HTMLStyleElement>(
      'style[data-cozycraft-ios-launch-fix]',
    );
    const correctedMark = iosDocument.querySelector<SVGElement>(
      'svg[data-cozycraft-ios-launch-mark]',
    );
    expect(launchFix?.textContent).toContain('svg[data-cozycraft-ios-launch-mark]');
    expect(correctedMark).not.toBeNull();
    expect(correctedMark?.querySelector('image')?.getAttribute('href')).toContain('cozycraft.png');
    expect(correctedMark?.querySelectorAll('clipPath rect').length).toBe(4);
    expect(iosDocument.querySelector('.splash .auth-mark img')).toBeNull();
    expect(installIOSLaunchStyle(iosDocument, 'ios')).toBeFalse();
    expect(iosDocument.querySelectorAll('style[data-cozycraft-ios-launch-fix]').length).toBe(1);

    const androidDocument = document.implementation.createHTMLDocument('Android storefront');
    androidDocument.body.innerHTML = `
      <main class="splash">
        <div class="auth-mark">
          <img src="assets/cozycraft.png" alt="CozyCraft Furniture">
        </div>
      </main>
    `;
    expect(installIOSLaunchStyle(androidDocument, 'android')).toBeFalse();
    expect(androidDocument.querySelector('style[data-cozycraft-ios-launch-fix]')).toBeNull();
    expect(androidDocument.querySelector('svg[data-cozycraft-ios-launch-mark]')).toBeNull();
    expect(androidDocument.querySelector('.splash .auth-mark img')).not.toBeNull();
  });

  it('only proxies the payment functions required by the native checkout lifecycle', () => {
    expect(isAllowedNativePaymentFunction('create-paymongo-checkout')).toBeTrue();
    expect(isAllowedNativePaymentFunction('cancel-paymongo-checkout')).toBeTrue();
    expect(isAllowedNativePaymentFunction('sync-paymongo-payments')).toBeTrue();
    expect(isAllowedNativePaymentFunction('cozycraft-assistant')).toBeFalse();
    expect(isAllowedNativePaymentFunction('../create-paymongo-checkout')).toBeFalse();
  });

  it('builds the fixed Supabase endpoint for an approved payment function', () => {
    expect(nativePaymentFunctionUrl('create-paymongo-checkout')).toBe(
      'https://gwjsivqksyimuabbdyqq.supabase.co/functions/v1/create-paymongo-checkout',
    );
  });

  it('only reports payment success from the persisted paid status', () => {
    expect(nativePaymentOrderState({ payment_status: 'paid', status: 'Processing' })).toBe('paid');
    expect(nativePaymentOrderState({ payment_status: 'pending', status: 'Processing' })).toBe('pending');
    expect(nativePaymentOrderState({ payment_status: 'failed', status: 'Cancelled' })).toBe('failed');
    expect(nativePaymentOrderState(undefined)).toBe('unknown');
  });

  it('builds the app callback consumed by the storefront payment flow', () => {
    expect(nativePaymentReturnUrl('order id/123', 'success')).toBe(
      'com.cozycraft.furniture://payment/return?payment=success&order=order%20id%2F123',
    );
  });

  it('answers the storefront permission handshake after its listener is ready', async () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const storefrontWindow = iframe.contentWindow;
    expect(storefrontWindow).not.toBeNull();
    component.storefront = new ElementRef<HTMLIFrameElement>(iframe);
    const permissionBridge = component as unknown as {
      deliverPushPermission: () => Promise<void>;
    };
    const deliverPermission = spyOn(permissionBridge, 'deliverPushPermission').and.resolveTo();

    await component.onMessage(new MessageEvent('message', {
      data: { type: 'cozycraft-request-push-permission-status' },
      source: storefrontWindow!,
    }));

    expect(deliverPermission).toHaveBeenCalledTimes(1);
    iframe.remove();
  });
});

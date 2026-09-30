import { nativePaymentBrowserUrl } from './payment-browser-handoff';

describe('native payment browser handoff', () => {
  const order = '11111111-1111-4111-8111-111111111111';
  it('preserves the exact session and order without leaking the provider fragment to the server', () => {
    const checkout = 'https://checkout.paymongo.com/cs_fixture#private=fixture';
    const target = new URL(nativePaymentBrowserUrl(checkout, order)!);
    expect(target.origin + target.pathname).toBe('https://www.cozycraftfurnitures.com/mobile-payment.html');
    expect(target.search).toBe('');
    const fragment = new URLSearchParams(target.hash.slice(1));
    expect(fragment.get('order')).toBe(order);
    expect(fragment.get('checkout')).toBe(checkout);
  });
  it('supports the alternate approved PayMongo checkout host', () => {
    expect(nativePaymentBrowserUrl('https://payments.paymongo.com/fixture', order)).not.toBeNull();
  });
  it('rejects unsafe URLs, credential-bearing URLs, unexpected ports and missing orders', () => {
    for (const url of ['http://checkout.paymongo.com/x', 'https://checkout.paymongo.com.evil.test/x', 'https://evil.test/x', 'https://user:secret@checkout.paymongo.com/x', 'https://checkout.paymongo.com:8443/x', 'javascript:alert(1)', 'not a URL']) {
      expect(nativePaymentBrowserUrl(url, order)).toBeNull();
    }
    expect(nativePaymentBrowserUrl('https://checkout.paymongo.com/x', '')).toBeNull();
    expect(nativePaymentBrowserUrl('https://checkout.paymongo.com/x', 'another-order')).toBeNull();
  });
});

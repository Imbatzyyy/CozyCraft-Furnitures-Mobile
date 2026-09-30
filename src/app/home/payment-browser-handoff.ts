// Use a tiny first-party page to remember app ownership before entering
// PayMongo. This also repairs return navigation for already-created sessions
// whose provider return address still points at the customer website.
export function nativePaymentBrowserUrl(checkoutUrl: string, orderId: string): string | null {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) return null;
  try {
    const checkout = new URL(checkoutUrl);
    if (checkout.protocol !== 'https:' || checkout.username || checkout.password || checkout.port ||
        !['checkout.paymongo.com', 'payments.paymongo.com'].includes(checkout.hostname)) return null;
    const fragment = new URLSearchParams({ order: orderId, checkout: checkout.href });
    // The provider link (including any access fragment) never reaches the
    // website server, query logs or Referer headers.
    return `https://www.cozycraftfurnitures.com/mobile-payment.html#${fragment}`;
  } catch {
    return null;
  }
}

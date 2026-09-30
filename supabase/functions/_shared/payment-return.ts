// Return destinations are server-owned. Never trust a caller's returnOrigin.
const origin = "https://www.cozycraftfurnitures.com";

export function paymentReturnUrls(orderId: string, mobileReturn: boolean) {
  const page = mobileReturn ? "mobile-payment.html" : "payment-return";
  const order = encodeURIComponent(orderId);
  return {
    success_url: `${origin}/${page}?payment=success&order=${order}`,
    cancel_url: `${origin}/${page}?payment=cancelled&order=${order}`,
  };
}

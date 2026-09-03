(() => {
  const parentWindow = window.parent;
  if (parentWindow === window) return;

  const originalFetch = window.fetch.bind(window);
  const functionPrefix = 'https://gwjsivqksyimuabbdyqq.supabase.co/functions/v1/';
  const allowedFunctions = new Set([
    'create-paymongo-checkout',
    'cancel-paymongo-checkout',
    'sync-paymongo-payments',
  ]);
  const pendingRequests = new Map();

  const paymentFunctionName = (input) => {
    const rawUrl = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
    if (!rawUrl?.startsWith(functionPrefix)) return '';
    const functionName = rawUrl.slice(functionPrefix.length).split(/[/?#]/, 1)[0];
    return allowedFunctions.has(functionName) ? functionName : '';
  };

  const settleRequest = (requestId, action) => {
    const pending = pendingRequests.get(requestId);
    if (!pending) return;
    pendingRequests.delete(requestId);
    window.clearTimeout(pending.timer);
    pending.signal?.removeEventListener('abort', pending.abort);
    action(pending);
  };

  window.addEventListener('message', (event) => {
    if (event.source !== parentWindow || event.data?.type !== 'cozycraft-native-payment-response') return;
    const requestId = String(event.data.requestId || '');
    settleRequest(requestId, ({ resolve, reject }) => {
      if (event.data.error) {
        reject(new Error(String(event.data.error)));
        return;
      }
      const status = Number(event.data.status);
      if (!Number.isInteger(status) || status < 200 || status > 599) {
        reject(new Error('The secure payment service returned an invalid response.'));
        return;
      }
      const body = typeof event.data.data === 'string'
        ? event.data.data
        : JSON.stringify(event.data.data ?? {});
      resolve(new Response(body, {
        status,
        headers: { 'content-type': String(event.data.contentType || 'application/json') },
      }));
    });
  });

  window.fetch = async (input, init = {}) => {
    const functionName = paymentFunctionName(input);
    if (!functionName) return originalFetch(input, init);

    const sourceRequest = input instanceof Request ? input : null;
    const method = String(init.method || sourceRequest?.method || 'GET').toUpperCase();
    if (method === 'OPTIONS') return originalFetch(input, init);
    if (method !== 'POST') throw new Error('Unsupported secure payment request method.');

    const headers = new Headers(sourceRequest?.headers || {});
    new Headers(init.headers || {}).forEach((value, key) => headers.set(key, value));
    const body = init.body == null && sourceRequest ? await sourceRequest.clone().text() : String(init.body || '');
    const signal = init.signal || sourceRequest?.signal;
    if (signal?.aborted) throw new DOMException('The payment request was cancelled.', 'AbortError');

    return new Promise((resolve, reject) => {
      const requestId = `payment-${crypto.randomUUID()}`;
      const abort = () => settleRequest(requestId, ({ reject: rejectPending }) => {
        rejectPending(new DOMException('The payment request was cancelled.', 'AbortError'));
      });
      const timer = window.setTimeout(() => settleRequest(requestId, ({ reject: rejectPending }) => {
        rejectPending(new Error('PayMongo is taking too long to respond. Please try again.'));
      }), 35_000);

      pendingRequests.set(requestId, { resolve, reject, timer, signal, abort });
      signal?.addEventListener('abort', abort, { once: true });
      parentWindow.postMessage({
        type: 'cozycraft-native-payment-request',
        requestId,
        functionName,
        headers: Object.fromEntries(headers.entries()),
        body,
      }, '*');
    });
  };
})();

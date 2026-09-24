// Only a database notification ID crosses the bridge. The signed-in storefront
// resolves ownership and destination; never navigate to a URL from a push.
export function nativeNotificationId(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const id = String((data as Record<string, unknown>)['notificationId'] || '');
  return /^[1-9]\d{0,15}$/.test(id) && Number.isSafeInteger(Number(id)) ? id : '';
}

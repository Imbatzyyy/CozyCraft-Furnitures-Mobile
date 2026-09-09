const pending = new Map<string, Promise<void>>()
export const pendingGoogleSetup = (userId: string) => pending.get(userId)
export function submitGoogleSetupOnce(userId: string, action: () => Promise<void>) {
  const existing = pending.get(userId)
  if (existing) return existing
  const request = Promise.resolve().then(action).finally(() => {
    if (pending.get(userId) === request) pending.delete(userId)
  })
  pending.set(userId, request)
  return request
}

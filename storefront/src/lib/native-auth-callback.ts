// The native bridge retries delivery until acknowledged. Accept each one-time
// PKCE code only once, including while its first exchange is still pending.
export function nativeAuthCallbackConsumer(consume: (url: URL) => Promise<void>, acknowledge: (url: string) => void, fail: () => void) {
  const received = new Set<string>()
  return (value: unknown) => {
    let url: URL
    try { url = new URL(String(value)) } catch { return }
    if (url.protocol !== "com.cozycraft.furniture:" || url.hostname !== "auth" || url.pathname !== "/callback") return
    const code = url.searchParams.get("code")
    if (!code) return
    acknowledge(url.href)
    if (received.has(code)) return
    received.add(code)
    if (received.size > 32) received.delete(received.values().next().value!)
    void consume(url).catch(fail)
  }
}

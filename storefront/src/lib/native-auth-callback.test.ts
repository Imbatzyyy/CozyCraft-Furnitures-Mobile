import { expect, it, vi } from "vitest"
import { nativeAuthCallbackConsumer } from "./native-auth-callback"
it("acknowledges retries but exchanges a native code once even during a slow request", async () => {
  let resolve!: () => void
  const consume = vi.fn(() => new Promise<void>((r) => { resolve = r }))
  const ack = vi.fn(), fail = vi.fn()
  const receive = nativeAuthCallbackConsumer(consume, ack, fail)
  const url = "com.cozycraft.furniture://auth/callback?code=one-time"
  for (let i = 0; i < 10; i++) receive(url)
  expect(consume).toHaveBeenCalledTimes(1)
  expect(ack).toHaveBeenCalledTimes(10)
  resolve(); await Promise.resolve()
  receive(url)
  expect(consume).toHaveBeenCalledTimes(1)
  expect(fail).not.toHaveBeenCalled()
})
it("ignores malformed or unrelated callbacks and contains exchange failures", async () => {
  const consume = vi.fn().mockRejectedValue(new Error("expired")), ack = vi.fn(), fail = vi.fn()
  const receive = nativeAuthCallbackConsumer(consume, ack, fail)
  receive("not a URL"); receive("https://untrusted.test/auth/callback?code=x")
  expect(consume).not.toHaveBeenCalled()
  receive("com.cozycraft.furniture://auth/callback?code=expired")
  await Promise.resolve(); await Promise.resolve()
  expect(fail).toHaveBeenCalledTimes(1)
})

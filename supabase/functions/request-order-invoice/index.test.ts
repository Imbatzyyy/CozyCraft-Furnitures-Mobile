import { assertEquals, assert } from "jsr:@std/assert@1.0.14"
import { stub } from "jsr:@std/testing@1.0.15/mock"
Deno.test("ownership, delivery, recipient and provider acceptance guards", async () => {
  let handler: (r: Request) => Promise<Response> = async () => new Response()
  const env = { SUPABASE_URL: "https://fixture.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "fixture-secret", RESEND_API_KEY: "fixture-email" }
  const es = stub(Deno.env, "get", (name: string) => env[name as keyof typeof env])
  const ss = stub(Deno, "serve", ((fn: typeof handler) => { handler = fn; return {} }) as typeof Deno.serve)
  let owner = true, status = "delivered", accepted = true, verified = true, sends = 0
  const keys: string[] = []
  const fs = stub(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url.includes("/auth/v1/user")) return Response.json({ id: "user-1", email: "owner@example.test", email_confirmed_at: verified ? "2026-01-01" : null })
    if (url.includes("/rest/v1/profiles")) return Response.json({ customer_active: true })
    if (url.includes("/rest/v1/orders")) {
      assert(url.includes("user_id=eq.user-1"))
      assert(url.includes("id=eq.11111111-1111-4111-8111-111111111111"))
      return Response.json(owner ? { id: "11111111-1111-4111-8111-111111111111", order_number: "CC-1", status, created_at: "2026-01-01", subtotal: 100, delivery_fee: 10, reward_discount: 0, total: 110, payment_method: "cod", payment_status: "paid", shipping_address: {}, order_items: [{ id: 1, product_name: "Sofa", unit_price: 100, quantity: 1 }] } : null)
    }
    assertEquals(url, "https://api.resend.com/emails")
    sends++; keys.push(new Headers(init?.headers).get("Idempotency-Key")!)
    assertEquals(JSON.parse(String(init?.body)).to, ["owner@example.test"])
    return accepted ? Response.json({ id: "provider-1" }) : Response.json({}, { status: 503 })
  })
  const request = () => new Request("https://function.test", { method: "POST", headers: { Authorization: "Bearer fixture-token", Origin: "capacitor://localhost" }, body: JSON.stringify({ orderId: "11111111-1111-4111-8111-111111111111", email: "attacker@example.test" }) })
  try {
    await import("./index.ts")
    assertEquals((await handler(new Request("https://function.test", { method: "POST" }))).status, 401)
    owner = false; assertEquals((await handler(request())).status, 404)
    owner = true; status = "shipped"; assertEquals((await handler(request())).status, 409)
    status = "delivered"; verified = false; assertEquals((await handler(request())).status, 403)
    assertEquals(sends, 0)
    verified = true; accepted = false; assertEquals((await handler(request())).status, 503)
    accepted = true
    assertEquals(await (await handler(request())).json(), { accepted: true, email: "owner@example.test", orderNumber: "CC-1" })
    assertEquals((await handler(request())).status, 200)
    assertEquals(new Set(keys).size, 1)
  } finally { fs.restore(); ss.restore(); es.restore() }
})

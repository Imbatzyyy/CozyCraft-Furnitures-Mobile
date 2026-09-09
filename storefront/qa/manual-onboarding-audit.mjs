// Real router, fields, legal navigation, settings and signup client. Requests
// are intercepted: no real accounts or emails are created by this audit.
import assert from "node:assert/strict"
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || "playwright")
const base = process.env.APP_URL || "http://127.0.0.1:5197"
for (const engine of [chromium, webkit]) {
  const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {})
  const context = await browser.newContext({ viewport: { width: 320, height: 568 }, deviceScaleFactor: 2 })
  let submitted = null, calls = 0
  const errors = []
  await context.routeWebSocket(/supabase\.(co|in)/, ws => ws.close())
  await context.route(/https:\/\/[^/]*supabase\.(co|in)\//, async route => {
    const req = route.request(), path = new URL(req.url()).pathname
    let data = []
    if (req.method() === "OPTIONS") return route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } })
    if (path === "/rest/v1/store_settings") {
      await new Promise(r => setTimeout(r, 600))
      data = [{ id: true, account_settings: { username_required: true, google_auth_enabled: true, password_minimum_length: 10 } }]
    } else if (path === "/auth/v1/signup") {
      calls++; submitted = req.postDataJSON()
      await new Promise(r => setTimeout(r, 600))
      data = { id: "11111111-1111-4111-8111-111111111111", email: submitted.email, identities: [{ id: "qa-identity" }], user_metadata: submitted.data, app_metadata: { provider: "email" } }
    }
    await route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(data) })
  })
  const page = await context.newPage()
  page.on("pageerror", e => errors.push(e.message))
  if (engine === chromium) await (await context.newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: 6 })
  await page.goto(`${base}/#/create-account`)
  await page.getByLabel("First name", { exact: true }).fill("Mary Jane")
  await page.getByLabel("Last name", { exact: true }).fill("Santos")
  const next = () => page.locator("button[type=submit]").click()
  await next()
  await page.getByLabel("Username", { exact: false }).fill("mary.home")
  await page.setViewportSize({ width: 320, height: 360 })
  await page.getByLabel("Username", { exact: false }).press("End")
  assert.equal(await page.getByLabel("Username", { exact: false }).inputValue(), "mary.home")
  await next()
  await page.getByLabel("Email address", { exact: true }).fill("mary@example.test")
  await next()
  await page.setViewportSize({ width: 320, height: 568 })
  await page.getByLabel("Create a password", { exact: false }).fill("CozyStrong123!")
  await page.getByRole("link", { name: "Terms", exact: true }).click()
  await page.goBack()
  await page.getByLabel("Create a password", { exact: false }).waitFor()
  assert.equal(await page.getByLabel("Create a password", { exact: false }).inputValue(), "", "Password retained outside form")
  await page.getByLabel("Create a password", { exact: false }).fill("CozyStrong123!")
  await page.getByLabel("Confirm password", { exact: false }).fill("CozyStrong123!")
  await page.getByRole("checkbox").check()
  await page.getByText("At least 10 characters", { exact: true }).waitFor()
  assert.equal(await page.getByText("Reload account settings", { exact: true }).count(), 0)
  await page.screenshot({ path: `/tmp/cozy-manual-onboarding-${engine.name()}.png` })
  await next()
  await page.getByText("One last step.", { exact: true }).waitFor()
  assert.equal(calls, 1)
  assert.equal(submitted.data.full_name, "Mary Jane Santos")
  assert.equal(submitted.data.username, "mary.home")
  assert.equal(submitted.email, "mary@example.test")
  assert.deepEqual(errors, [])
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false)
  console.log(`${engine.name()}: FULL APP manual signup; slow settings; keyboard-sized viewport; Terms/Back without step reset; complete payload once PASS`)
  await browser.close()
}

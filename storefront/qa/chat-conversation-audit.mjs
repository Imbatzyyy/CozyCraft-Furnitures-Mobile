// Real MobileCareChat component with in-memory responses; no provider requests.
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { setTimeout as delay } from "node:timers/promises"
import { fileURLToPath } from "node:url"
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || "playwright")
const storefront = fileURLToPath(new URL("..", import.meta.url))
const base = "http://127.0.0.1:5198"
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--config", "qa/vite.config.ts", "--port", "5198", "--strictPort"], { cwd: storefront, stdio: "inherit" })
let stopped = false
server.once("exit", () => { stopped = true })
let checks = 0
try {
  let ready = false
  for (let i = 0; i < 100; i++) {
    await delay(200)
    if (stopped) throw new Error("Chat QA server stopped")
    try { ready = (await fetch(base, { signal: AbortSignal.timeout(1000) })).ok } catch {}
    if (ready) break
  }
  assert.ok(ready, "Chat QA server must start")
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch()
    try {
      for (const [width, height] of [[320,640], [390,844], [768,1024], [844,390]]) {
        const page = await browser.newPage({ viewport: { width, height }, reducedMotion: width === 320 ? "reduce" : "no-preference" })
        const errors = []
        page.on("pageerror", error => errors.push(error.message))
        await page.route(/https:\/\/.*supabase\.(co|in)\//, () => { throw new Error("Chat fixture must not contact live Supabase") })
        await page.goto(`${base}/?care&platform=${engine === webkit ? "ios" : "android"}&text=${width === 320 ? "extra-large" : "comfortable"}`)
        const send = async question => {
          const before = await page.locator(".ai-message-list article.assistant:not(.typing)").count()
          await page.getByRole("textbox", { name: "Message CozyCraft Care" }).fill(question)
          await page.getByRole("button", { name: "Send message", exact: true }).click()
          await page.waitForFunction(count => document.querySelectorAll(".ai-message-list article.assistant:not(.typing)").length > count, before)
          return page.locator(".ai-message-list article.assistant:not(.typing)").last()
        }
        for (const question of ["hello", "hello po", "What is CozyCraft?", "What is a wishlist?", "What payment methods do you accept?", "Recommend furniture"]) {
          const reply = await send(question)
          assert.equal(await reply.locator(".ai-direction-card").count(), 0, `${question}: unwanted directions`)
          assert.equal(await reply.locator(".ai-navigation-action").count(), 0, `${question}: invented route`)
          assert.ok((await reply.innerText()).length > 30)
        }
        if (width === 390) await page.screenshot({ path: `/tmp/cozy-chat-conversation-${engine.name()}.png`, fullPage: true })
        const reply = await send("Where can I see support?")
        assert.equal(await reply.locator(".ai-direction-card").count(), 1)
        assert.equal(await reply.locator(".ai-navigation-action").count(), 1)
        assert.ok(await page.locator(".ai-composer").evaluate(el => { const r = el.getBoundingClientRect(); return r.bottom <= innerHeight + 1 && r.top >= 0 }))
        assert.ok(await page.locator(".care-minimal").evaluate(el => el.scrollWidth <= el.clientWidth + 1))
        assert.deepEqual(errors, [])
        await reply.locator(".ai-navigation-action").click()
        assert.match(await page.getByLabel("Chat state").innerText(), /^closed support/)
        console.log(`PASS ${engine.name()} ${width}px: six conversational replies, product list, real support navigation, composer and overflow`)
        checks++
        await page.close()
      }
    } finally { await browser.close() }
  }
  console.log(`PASS ${checks} chat layouts and 56 message interactions.`)
} finally { server.kill("SIGTERM") }

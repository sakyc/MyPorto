/* Optional browser check. Uses mocked accounts only; never changes owner credentials.
   Install Playwright as described in browser-check.cjs, then run this file. */
const path = require("node:path");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const QRCode = require("qrcode");
let playwright;
try { playwright = require("playwright"); }
catch { playwright = require(path.resolve(".cache/browser-check/node_modules/playwright")); }
const content = require("../apps/api/src/db/seed-content.json");
const origin = process.env.TEST_WEB_ORIGIN || "http://localhost:3000";

(async () => {
  const browser = await playwright.chromium.launch({ channel: "chrome", headless: true });
  try {
    fs.mkdirSync(".local", { recursive: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let account = { username: "ui-owner", email: "ui@example.com", verificationMethod: "totp", pinConfigured: false, totpEnabled: true };
    let saved, qrRequests = 0;
    const qrDataUrl = await QRCode.toDataURL("UI preview only; not an authenticator secret");
    await page.route("**/api/admin/**", async (route) => {
      const endpoint = new URL(route.request().url()).pathname.replace("/api/admin", "");
      let body;
      switch (endpoint) {
        case "/me": body = { email: account.email, csrfToken: "ui-csrf" }; break;
        case "/content": body = content; break;
        case "/publish/preview": body = { changes: [], revalidate: [], revision: "ui" }; break;
        case "/status": body = { api: "online", database: "connected", latency: 1, unread: 0, activity: [], backup: "UI fixture", lastPublish: { version: 1, commitHash: "fixture", publishedAt: new Date().toISOString() } }; break;
        case "/analytics": body = { today: 0, last7: 0, total: 0, daily: [], topPages: [], referrers: [] }; break;
        case "/media": body = []; break;
        case "/messages": body = { items: [], total: 0 }; break;
        case "/credentials":
          if (route.request().method() === "PATCH") {
            saved = route.request().postDataJSON();
            account = { ...account, verificationMethod: saved.verificationMethod, pinConfigured: true, totpEnabled: saved.verificationMethod === "totp" };
            body = { ...account, csrfToken: "rotated-ui-csrf" };
          } else body = account;
          break;
        case "/authenticator/qr":
          qrRequests++;
          body = { qrDataUrl, email: account.email };
          break;
        default: throw new Error("Unexpected mocked endpoint: " + endpoint);
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.goto(origin + "/admin/settings", { waitUntil: "networkidle" });
    await page.locator(".credentials-panel summary").click();
    await page.waitForFunction(() => document.querySelector('#credentials-form input[autocomplete="username"]')?.value === "ui-owner");
    assert.equal(qrRequests, 0);
    const setup = page.locator(".authenticator-setup");
    await setup.locator('input[type="password"]').fill("UI-password-only");
    await setup.getByRole("button", { name: "Show authenticator QR" }).click();
    await setup.locator("img").waitFor();
    assert.equal(qrRequests, 1);
    assert.equal(await setup.locator('input[type="password"]').count(), 0);
    await setup.getByRole("button", { name: "Hide QR" }).click();
    assert.equal(await setup.locator("img").count(), 0);
    const form = page.locator("#credentials-form");
    await form.getByRole("radio", { name: /Personal PIN/ }).check();
    await form.getByPlaceholder("Choose a six-digit PIN").fill("748291");
    await form.getByPlaceholder("Repeat your new PIN").fill("748292");
    await form.getByPlaceholder("Your current password").fill("UI-password-only");
    await form.getByPlaceholder("6-digit code").fill("123456");
    await form.getByRole("button", { name: "Save sign-in details" }).click();
    await form.getByText("PINs don’t match.").waitFor();
    assert.equal(saved, undefined);
    await form.getByPlaceholder("Repeat your new PIN").fill("748291");
    await form.getByRole("button", { name: "Save sign-in details" }).click();
    await form.getByRole("status").waitFor();
    assert.equal(saved.verificationMethod, "pin");
    assert.equal(saved.newPin, "748291");
    assert.equal(await form.getByPlaceholder("Choose a six-digit PIN").inputValue(), "");
    await form.getByRole("radio", { name: /^Authenticator/ }).check();
    await form.getByPlaceholder("Code from your authenticator").waitFor();
    await page.setViewportSize({ width: 390, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: ".local/security-settings-mobile.png", fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await form.scrollIntoViewIfNeeded();
    await page.screenshot({ path: ".local/security-settings-desktop.png" });
    assert.deepEqual(errors, []);

    const login = await browser.newPage({ reducedMotion: "reduce" });
    await login.route("**/api/admin/**", async (route) => {
      const isLogin = new URL(route.request().url()).pathname.endsWith("/login");
      await route.fulfill({ status: isLogin ? 200 : 401, contentType: "application/json", body: JSON.stringify(isLogin ? { needs2fa: true, verificationMethod: "pin" } : { error: "Please sign in." }) });
    });
    await login.goto(origin + "/login", { waitUntil: "networkidle" });
    await login.locator("#lu").fill("ui-owner");
    await login.locator("#lpw").fill("UI-password-only");
    await login.locator("#lbtn").click();
    await login.getByText("Enter your personal PIN.").waitFor();
    await login.locator("#lcode").fill("748291");
    assert.equal(await login.locator("#lcode").getAttribute("type"), "password");
    assert.equal(await login.locator(".auth-code-slots").textContent(), "••••••");
    console.log("Security UI passed: PIN selection/confirmation, secret clearing, QR reveal/hide, method switch, mobile layout, masked PIN login. No real accounts changed.");
  } finally { await browser.close(); }
})().catch(() => { console.error("Security UI check failed; inspect the local script without printing form credentials."); process.exit(1); });

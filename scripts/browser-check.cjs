/* Optional local end-to-end check. Creates its own draft/message and cleans them up.
   npm install --no-save --prefix .cache/browser-check playwright
   node scripts/browser-check.cjs
   Uses installed Chrome and the ignored .local/owner-access.json by default. */
const path = require("node:path");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const { TOTP } = require("otpauth");
let playwright;
try {
  playwright = require("playwright");
} catch {
  playwright = require(
    path.resolve(".cache/browser-check/node_modules/playwright"),
  );
}
const origin = process.env.TEST_WEB_ORIGIN || "http://localhost:3000";
const owner = JSON.parse(
  fs.readFileSync(
    process.env.TEST_OWNER_FILE || ".local/owner-access.json",
    "utf8",
  ),
);
const run = Date.now().toString(36),
  name = "Browser check " + run,
  created = new Set();
let browser,
  context,
  page,
  csrf = "";
async function json(route, options = {}) {
  const response = await context.request.fetch(origin + "/api/admin" + route, {
    ...options,
    headers: { "X-CSRF-Token": csrf, ...options.headers },
  });
  return { status: response.status(), body: await response.json() };
}
(async () => {
  browser = await playwright.chromium.launch({
    channel: process.env.BROWSER_CHANNEL || "chrome",
    headless: true,
  });
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.waitForSelector("#proj .project-spotlight");
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
  const first = page.locator("[data-project]").first();
  await first.click();
  await page.waitForURL("**/projects/*");
  assert.equal(await page.locator("#project-detail h1").count(), 1);
  await page.goto(origin + "/projects?category=javascript", {
    waitUntil: "networkidle",
  });
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-filter="javascript"]')
        ?.getAttribute("aria-pressed") === "true",
  );
  await page.goto(origin + "/#contact", { waitUntil: "networkidle" });
  await page.locator("[data-language-toggle]").click();
  assert.equal(await page.locator("html").getAttribute("lang"), "id");
  await page.locator("[data-language-toggle]").click();
  // Let the desktop rail's approved hover expansion close before clicking the form.
  await page.mouse.move(1200, 200);
  await page.waitForTimeout(400);
  await page.locator("#contact-name").fill(name);
  await page.locator("#contact-email").fill("browser-check@example.com");
  await page.locator("#contact-phone").fill("081234567890");
  await page
    .locator("#contact-message")
    .fill(
      "Browser integration verification " +
        run +
        ". This message is removed after the check.",
    );
  await page.locator("#contact-consent").check();
  await page.locator("#contact-form [type=submit]").click();
  await page.waitForFunction(
    () =>
      document.querySelector("#contact-form-status").dataset.state ===
      "success",
  );
  await page.locator(".owner-access").click();
  await page.waitForURL("**/admin");
  await page.waitForSelector("#lpw");
  assert.equal(await page.locator("#lu").inputValue(), "");
  await page.locator("#lu").fill(owner.email);
  await page.locator("#lpw").fill(owner.password);
  await page.locator("#lbtn").click();
  await page.waitForSelector("#lcode");
  await page
    .locator("#lcode")
    .fill(new TOTP({ secret: owner.totpSecret }).generate());
  await page.locator("#lbtn").click();
  await page.waitForFunction(() => document.querySelector("#login").hidden);
  csrf = (await json("/me")).body.csrfToken;
  await page.locator('#nav a[href="#messages"]').click();
  await page.getByRole("button", { name: new RegExp(name) }).click();
  assert.ok((await page.locator(".message-body").innerText()).includes(run));
  await page.locator('#nav a[href="#projects"]').click();
  const creation = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/admin/projects") &&
      r.request().method() === "POST" &&
      r.status() === 201,
  );
  await page.getByRole("button", { name: "+ New", exact: true }).click();
  const row = await (await creation).json();
  created.add(row.id);
  await page.waitForFunction(
    () => document.querySelector("#form input").value === "Untitled project",
  );
  await page
    .locator("#form label")
    .filter({ hasText: "Title" })
    .locator("input")
    .fill(name);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector("#slc").textContent === "● saved",
  );
  await page
    .locator("#form")
    .getByRole("button", { name: "published", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelector("#slc").textContent === "● saved",
  );
  await page.getByRole("button", { name: /Review & publish/ }).click();
  await page.waitForSelector("#pub[open]");
  const review = await json("/publish/preview");
  assert.ok(
    review.body.changes.some((change) =>
      change.fields.some(
        (field) => field.name === "title" && field.to === name,
      ),
    ),
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  for (const section of [
    "experience",
    "certificates",
    "stack-groups",
    "assistant-presets",
    "settings",
    "media",
  ]) {
    await page.locator('#nav a[href="#' + section + '"]').click();
    await page.waitForFunction(
      () => document.querySelectorAll(".view.on").length === 1,
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    "Browser checks passed: public routes, locale, Contact → Messages, first-party password/TOTP login, draft save/review, all admin sections.",
  );
})()
  .catch((error) => {
    // Do not print Playwright action logs: password/code input may be included.
    console.error(
      "Browser check failed: " + String(error.message).split("\n")[0],
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    if (context && csrf) {
      for (const id of created)
        await json("/projects/" + id, { method: "DELETE" }).catch(() => {});
      const inbox = await json("/messages").catch(() => null);
      for (const message of inbox?.body?.items || [])
        if (
          message.name === name &&
          message.email === "browser-check@example.com"
        )
          await json("/messages/" + message.id, { method: "DELETE" }).catch(
            () => {},
          );
      await json("/logout", { method: "POST", data: {} }).catch(() => {});
    }
    await browser?.close();
  });

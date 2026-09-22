import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const runtime = join(homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs");
const { chromium } = await import("playwright").catch(() => import(pathToFileURL(runtime).href));
const executablePath = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(p => p && existsSync(p));
const server = await createServer({ root, configFile: join(root, "vite.config.ts"), logLevel: "error", server: { host: "127.0.0.1", port: 0 } });
await server.listen();
const browser = await chromium.launch({ executablePath, headless: true });
const report = resolve(root, "../../.tmp/local-profiles-ui");
mkdirSync(report, { recursive: true });
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  // Isolated synthetic Chrome storage, including cross-tab change events.
  await context.addInitScript(() => {
    const listeners = new Set();
    const read = key => { const value = localStorage.getItem(key); return value === null ? undefined : JSON.parse(value); };
    globalThis.chrome = { storage: { local: {
      async get(keys) { const list = keys === null ? Object.keys(localStorage) : Array.isArray(keys) ? keys : [keys]; return Object.fromEntries(list.filter(key => read(key) !== undefined).map(key => [key, read(key)])); },
      async set(values) { const changes = {}; for (const [key, value] of Object.entries(values)) { changes[key] = { oldValue: read(key), newValue: value }; localStorage.setItem(key, JSON.stringify(value)); } for (const listener of listeners) listener(changes, "local"); },
      async remove(keys) { const changes = {}; for (const key of Array.isArray(keys) ? keys : [keys]) { changes[key] = { oldValue: read(key) }; localStorage.removeItem(key); } for (const listener of listeners) listener(changes, "local"); }
    }, onChanged: { addListener(fn) { listeners.add(fn); }, removeListener(fn) { listeners.delete(fn); } } } };
    addEventListener("storage", event => { if (event.key) for (const listener of listeners) listener({ [event.key]: { newValue: event.newValue ? JSON.parse(event.newValue) : undefined } }, "local"); });
  });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/resume.html`);
  await page.getByRole("button", { name: "手动添加资料", exact: true }).waitFor();
  const add = async name => {
    page.once("dialog", dialog => dialog.accept(name));
    await page.getByRole("button", { name: "手动添加资料", exact: true }).click();
    await page.getByRole("heading", { name, exact: true }).waitFor();
  };
  const nameInput = () => page.locator(".resume-editor-field").filter({ hasText: "姓名" }).locator("input:visible").first();
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem("offerflow.localApplicationProfiles.v1")));
  await add("本地资料 A");
  await nameInput().fill("候选人 A");
  await page.getByRole("button", { name: "保存这份资料", exact: true }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("offerflow.localApplicationProfiles.v1"))[0].profile.fullName === "候选人 A");
  await add("本地资料 B");
  assert.equal(await nameInput().inputValue(), "");
  await nameInput().fill("候选人 B");
  // Exercise automatic saving, not just the explicit save button.
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("offerflow.localApplicationProfiles.v1"))[1].profile.fullName === "候选人 B", { timeout: 10000 });
  assert.deepEqual((await stored()).map(row => row.profile.fullName), ["候选人 A", "候选人 B"]);
  await page.reload();
  await page.getByRole("heading", { name: "本地资料 B", exact: true }).waitFor();
  assert.equal(await nameInput().inputValue(), "候选人 B");
  await page.locator(".resume-list-item").filter({ hasText: "本地资料 A" }).click();
  await page.getByRole("heading", { name: "本地资料 A", exact: true }).waitFor();
  assert.equal(await nameInput().inputValue(), "候选人 A");
  await page.getByRole("button", { name: "设为当前", exact: true }).click();
  const otherPage = await context.newPage();
  otherPage.on("pageerror", error => errors.push(error.message));
  await otherPage.goto(page.url());
  await otherPage.getByRole("heading", { name: "本地资料 A", exact: true }).waitFor();
  await nameInput().fill("尚未保存的编辑");
  await otherPage.locator(".resume-editor-field").filter({ hasText: "姓名" }).locator("input:visible").first().fill("其他页面更新");
  await otherPage.getByRole("button", { name: "保存这份资料", exact: true }).click();
  await otherPage.waitForFunction(() => JSON.parse(localStorage.getItem("offerflow.localApplicationProfiles.v1"))[0].profile.fullName === "其他页面更新");
  await page.getByRole("button", { name: "保存这份资料", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "其他页面修改" }).waitFor();
  assert.equal(await nameInput().inputValue(), "尚未保存的编辑");
  assert.equal((await stored())[0].profile.fullName, "其他页面更新");
  await otherPage.close();
  await page.getByRole("button", { name: "展开简历库", exact: true }).click();
  await page.locator(".resume-editor-content").evaluate(node => { node.scrollTop = 0; });
  await page.getByRole("heading", { name: "本地资料 A", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(report, "local-profiles.png"), fullPage: true, animations: "disabled" });
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "删除简历", exact: true }).click();
  await page.getByRole("heading", { name: "本地资料 B", exact: true }).waitFor();
  assert.equal((await stored()).length, 1);
  assert.equal(await nameInput().inputValue(), "候选人 B");
  assert.deepEqual(errors, []);
  console.log("PASS: manual add, blank isolation, edit, explicit/automatic save, reload, selection, concurrent-edit protection, delete; no page errors.");
} finally {
  await browser.close();
  await server.close();
}

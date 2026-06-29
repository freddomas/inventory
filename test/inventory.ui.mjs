import { expect, test } from "@playwright/test";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";

let baseUrl;
let dataDir;
let serverProcess;

async function waitForHealth(url, attempts = 40) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(new URL("/api/health", url));
      if (response.ok) return;
    } catch {
      // keep retrying while the server starts
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Server did not become healthy");
}

async function login(page, username, password = "demo2026!") {
  await page.goto(baseUrl);
  await page.waitForLoadState("networkidle");
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(password);
  const [loginResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/api/login") && response.request().method() === "POST"),
    page.getByRole("button", { name: "Se connecter" }).click(),
  ]);
  expect(loginResponse.ok()).toBeTruthy();
  await expect(page.locator(".app-shell")).toBeVisible({ timeout: 10_000 });
}

function unexpectedConsoleErrors(errors) {
  return errors.filter((text) => !text.includes("401 (Unauthorized)"));
}

test.beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "inventory-ui-"));
  const port = 4194;
  baseUrl = `http://127.0.0.1:${port}`;
  serverProcess = spawn("node", ["server.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, DATA_DIR: dataDir, HOST: "127.0.0.1", PORT: String(port), NODE_ENV: "test" },
    stdio: "ignore",
    windowsHide: true,
  });
  serverProcess.unref();
  serverProcess.once("exit", (code) => {
    if (code !== null && code !== 0) console.error(`Server exited with code ${code}`);
  });
  await waitForHealth(baseUrl);
});

test.afterAll(async () => {
  if (serverProcess && !serverProcess.killed) {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(serverProcess.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      serverProcess.kill("SIGTERM");
      await Promise.race([once(serverProcess, "exit"), new Promise((resolve) => setTimeout(resolve, 2000))]);
    }
  }
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
});

test.describe.configure({ mode: "serial" });

test("shop admin can create a shift slot and assign it without drag and drop", async ({ page }) => {
  const consoleErrors = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await login(page, "admin.bv");
  await page.getByRole("button", { name: "Planning" }).first().click();
  await page.locator("#shiftSlotForm input[name='name']").fill("Ouverture");
  await page.locator("#shiftSlotForm input[name='start']").fill("08:00");
  await page.locator("#shiftSlotForm input[name='end']").fill("12:00");
  await page.locator("#shiftSlotForm button[type='submit']").click();
  await expect(page.locator(".shift-slot-list")).toContainText("Ouverture");
  await page.locator("#planningAssignForm button[type='submit']").click();
  await expect(page.locator(".planned-user")).toBeVisible();
  expect(unexpectedConsoleErrors(consoleErrors)).toEqual([]);
});

test("sale details are visible from validations after creating an under-price sale", async ({ page }) => {
  await login(page, "admin.bv");
  await page.getByRole("button", { name: "Ventes" }).first().click();
  await page.locator(".product-result").first().click();
  await page.locator(".cart-row input[data-field='soldPrice']").first().fill("0");
  await page.locator("#saleForm button[type='submit']").click();
  await expect(page.getByText("Vente enregistrée.")).toBeVisible();
  await page.getByRole("button", { name: "Validations" }).first().click();
  await page.locator("button[data-action='viewSale']").first().click();
  await expect(page.locator(".sale-detail-panel")).toContainText("Détail vente");
});

test("settings page does not emit CSP frame errors", async ({ page }) => {
  const consoleErrors = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await login(page, "admin.bv");
  await page.getByRole("button", { name: "Paramètres" }).first().click();
  await expect(page.getByRole("link", { name: "Ouvrir Google Maps" })).toHaveAttribute("rel", /noopener/);
  expect(consoleErrors.filter((text) => text.includes("Content Security Policy") || text.includes("Refused to frame"))).toEqual([]);
});

test("agent mobile view exposes only operational navigation", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile-only assertion");
  await login(page, "agent.bv");
  await expect(page.locator(".mobile-nav")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ventes" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Stock" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Clôturer" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Dashboard" })).toHaveCount(0);
});

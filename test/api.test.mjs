import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";

let baseUrl;
let dataDir;
let server;

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.cookie) headers.Cookie = options.cookie;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }
  return { response, payload, text, cookie: response.headers.get("set-cookie")?.split(";")[0] || "" };
}

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "inventory-test-"));
  process.env.DATA_DIR = dataDir;
  process.env.HOST = "127.0.0.1";
  process.env.PORT = "0";
  const mod = await import(`../src/server/index.mjs?test=${Date.now()}`);
  server = mod.startServer({ host: "127.0.0.1", port: 0 });
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
});

test("serves health endpoint and static application shell", async () => {
  const health = await request("/api/health");
  assert.equal(health.response.status, 200);
  assert.equal(health.payload.status, "ok");

  const home = await request("/");
  assert.equal(home.response.status, 200);
  assert.match(home.text, /<div id="app"><\/div>/);

  const app = await request("/app.js");
  assert.equal(app.response.status, 200);
  assert.match(app.text, /Inventory Realm/);
});

test("requires authentication before returning business data", async () => {
  const unauthenticated = await request("/api/bootstrap");
  assert.equal(unauthenticated.response.status, 401);
  assert.equal(unauthenticated.payload.error, "auth_required");
});

test("enforces login validation and shop isolation", async () => {
  const shortPassword = await request("/api/login", { method: "POST", body: { username: "admin.bv", password: "short" } });
  assert.equal(shortPassword.response.status, 400);
  assert.equal(shortPassword.payload.error, "password_min_8");

  const login = await request("/api/login", { method: "POST", body: { username: "admin.bv", password: "demo2026!" } });
  assert.equal(login.response.status, 200);
  assert.ok(login.cookie.startsWith("sid="));

  const bootstrap = await request("/api/bootstrap", { cookie: login.cookie });
  assert.equal(bootstrap.response.status, 200);
  assert.equal(bootstrap.payload.me.role, "shop_admin");
  assert.equal(bootstrap.payload.shop.id, "shop_bellevie");
  assert.ok(bootstrap.payload.variants.every((variant) => variant.shopId === "shop_bellevie"));

  const crossShopSale = await request("/api/sales", {
    method: "POST",
    cookie: login.cookie,
    body: { clientName: "Client test", lines: [{ variantId: "ls_var_robe_midi", quantity: 1, soldPrice: 10 }] },
  });
  assert.equal(crossShopSale.response.status, 403);
  assert.equal(crossShopSale.payload.error, "cross_realm_denied");
});

test("limits bootstrap payloads by role need-to-know", async () => {
  const agentLogin = await request("/api/login", { method: "POST", body: { username: "agent.bv", password: "demo2026!" } });
  assert.equal(agentLogin.response.status, 200);
  const agentBootstrap = await request("/api/bootstrap", { cookie: agentLogin.cookie });
  assert.equal(agentBootstrap.response.status, 200);
  assert.equal(agentBootstrap.payload.me.role, "agent");
  assert.deepEqual(agentBootstrap.payload.stockEntries, []);
  assert.equal(agentBootstrap.payload.logs, undefined);
  assert.equal(agentBootstrap.payload.movements, undefined);
  assert.ok(agentBootstrap.payload.users.every((user) => user.id === agentBootstrap.payload.me.id));
  assert.ok(agentBootstrap.payload.sales.every((sale) => sale.agentId === agentBootstrap.payload.me.id));

  const managerLogin = await request("/api/login", { method: "POST", body: { username: "manager.bv", password: "demo2026!" } });
  const managerBootstrap = await request("/api/bootstrap", { cookie: managerLogin.cookie });
  assert.equal(managerBootstrap.response.status, 200);
  assert.equal(managerBootstrap.payload.logs, undefined);
  assert.equal(managerBootstrap.payload.movements, undefined);
  assert.ok(Array.isArray(managerBootstrap.payload.stockEntries));
  assert.ok(Array.isArray(managerBootstrap.payload.planning));
});

test("enforces role permissions and completes normal sales", async () => {
  const managerLogin = await request("/api/login", { method: "POST", body: { username: "manager.bv", password: "demo2026!" } });
  assert.equal(managerLogin.response.status, 200);

  const forbiddenSale = await request("/api/sales", {
    method: "POST",
    cookie: managerLogin.cookie,
    body: { clientName: "Client test", lines: [{ variantId: "bv_var_lotion_karite", quantity: 1, soldPrice: 24 }] },
  });
  assert.equal(forbiddenSale.response.status, 403);

  const agentLogin = await request("/api/login", { method: "POST", body: { username: "agent.bv", password: "demo2026!" } });
  assert.equal(agentLogin.response.status, 200);

  const beforeSale = await request("/api/bootstrap", { cookie: agentLogin.cookie });
  const variantBefore = beforeSale.payload.variants.find((variant) => variant.id === "bv_var_lotion_karite");
  assert.ok(variantBefore.stock > 0);

  const sale = await request("/api/sales", {
    method: "POST",
    cookie: agentLogin.cookie,
    body: { clientName: "Client test", contact: "", lines: [{ variantId: variantBefore.id, quantity: 1, soldPrice: variantBefore.referencePrice }] },
  });
  assert.equal(sale.response.status, 201);
  const variantAfter = sale.payload.variants.find((variant) => variant.id === variantBefore.id);
  assert.equal(variantAfter.stock, variantBefore.stock - 1);
});

test("rejects invalid business inputs", async () => {
  const adminLogin = await request("/api/login", { method: "POST", body: { username: "admin.bv", password: "demo2026!" } });
  assert.equal(adminLogin.response.status, 200);

  const invalidPromo = await request("/api/promotions", {
    method: "POST",
    cookie: adminLogin.cookie,
    body: { label: "Bad", targetScope: "variant", targetId: "ls_var_robe_midi", discountPercent: 150, startDate: "2026-06-29", endDate: "2026-06-30" },
  });
  assert.equal(invalidPromo.response.status, 400);
  assert.equal(invalidPromo.payload.error, "invalid_promotion_target");

  const invalidVariant = await request("/api/variants", {
    method: "POST",
    cookie: adminLogin.cookie,
    body: { typeId: "bv_type_lotion", name: "Bad price", referencePrice: -1 },
  });
  assert.equal(invalidVariant.response.status, 400);

  const agentLogin = await request("/api/login", { method: "POST", body: { username: "agent.bv", password: "demo2026!" } });
  const invalidSale = await request("/api/sales", {
    method: "POST",
    cookie: agentLogin.cookie,
    body: { clientName: "Client test", lines: [{ variantId: "bv_var_lotion_karite", quantity: 1, soldPrice: "not-a-number" }] },
  });
  assert.equal(invalidSale.response.status, 400);
  assert.equal(invalidSale.payload.error, "invalid_price");
});

test("rejects super user creation against an unknown shop", async () => {
  const superLogin = await request("/api/login", { method: "POST", body: { username: "super", password: "demo2026!" } });
  assert.equal(superLogin.response.status, 200);
  const response = await request("/api/users", {
    method: "POST",
    cookie: superLogin.cookie,
    body: { shopId: "shop_missing", role: "agent", name: "Ghost", username: "ghost", password: "demo2026!" },
  });
  assert.equal(response.response.status, 404);
  assert.equal(response.payload.error, "shop_not_found");
});

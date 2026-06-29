import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

async function request(baseUrl, path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.cookie) headers.Cookie = options.cookie;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  return {
    response,
    payload: text ? JSON.parse(text) : {},
    cookie: response.headers.get("set-cookie")?.split(";")[0] || "",
  };
}

async function startServerlessModule(label) {
  const mod = await import(`../src/server/index.mjs?serverless=${label}-${Date.now()}`);
  const server = createServer((req, res) => mod.handleApiRequest(req, res));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

function closeServer(server) {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

test("Vercel-style stateless session survives a fresh module instance", async () => {
  const originalEnv = {
    DATA_DIR: process.env.DATA_DIR,
    HOST: process.env.HOST,
    PORT: process.env.PORT,
    NODE_ENV: process.env.NODE_ENV,
    VERCEL: process.env.VERCEL,
    VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA,
    ALLOW_DEMO_SEED: process.env.ALLOW_DEMO_SEED,
    RESET_CORRUPT_STORE: process.env.RESET_CORRUPT_STORE,
    SESSION_MODE: process.env.SESSION_MODE,
    SESSION_SECRET: process.env.SESSION_SECRET,
  };
  const dataDir = await mkdtemp(join(tmpdir(), "inventory-serverless-"));
  process.env.DATA_DIR = dataDir;
  process.env.HOST = "127.0.0.1";
  process.env.PORT = "0";
  process.env.NODE_ENV = "production";
  process.env.VERCEL = "1";
  process.env.VERCEL_GIT_COMMIT_SHA = "serverless-test-sha";
  delete process.env.ALLOW_DEMO_SEED;
  delete process.env.RESET_CORRUPT_STORE;
  delete process.env.SESSION_MODE;
  delete process.env.SESSION_SECRET;

  let first;
  let second;
  try {
    first = await startServerlessModule("login");
    const login = await request(first.baseUrl, "/api/login", {
      method: "POST",
      body: { username: "super", password: "demo2026!" },
    });
    assert.equal(login.response.status, 200);
    assert.ok(login.cookie.startsWith("sid="));
    await closeServer(first.server);
    first = null;

    second = await startServerlessModule("bootstrap");
    const bootstrap = await request(second.baseUrl, "/api/bootstrap", { cookie: login.cookie });
    assert.equal(bootstrap.response.status, 200);
    assert.equal(bootstrap.payload.me.role, "super_user");
  } finally {
    if (first) await closeServer(first.server);
    if (second) await closeServer(second.server);
    await rm(dataDir, { recursive: true, force: true });
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

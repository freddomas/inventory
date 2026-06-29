import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function assertResponse(url, expectedStatus) {
  const response = await fetch(url);
  if (response.status !== expectedStatus) {
    throw new Error(`${url} returned ${response.status}, expected ${expectedStatus}`);
  }
  return response;
}

async function runAgainst(baseUrl) {
  const health = await assertResponse(new URL("/api/health", baseUrl), 200);
  const healthPayload = await health.json();
  if (healthPayload.status !== "ok") throw new Error("Health endpoint did not return status=ok");

  const home = await assertResponse(new URL("/", baseUrl), 200);
  const homeText = await home.text();
  if (!homeText.includes('<div id="app"></div>')) throw new Error("Home page does not contain the app root");

  await assertResponse(new URL("/app.js", baseUrl), 200);
  await assertResponse(new URL("/api/bootstrap", baseUrl), 401);
}

const externalBaseUrl = process.env.SMOKE_BASE_URL;
if (externalBaseUrl) {
  await runAgainst(externalBaseUrl);
} else {
  const dataDir = await mkdtemp(join(tmpdir(), "inventory-smoke-"));
  process.env.DATA_DIR = dataDir;
  process.env.HOST = "127.0.0.1";
  process.env.PORT = "0";
  const { startServer } = await import(`../src/server/index.mjs?smoke=${Date.now()}`);
  const server = startServer({ host: "127.0.0.1", port: 0 });
  await once(server, "listening");
  const { port } = server.address();
  try {
    await runAgainst(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await rm(dataDir, { recursive: true, force: true });
  }
}

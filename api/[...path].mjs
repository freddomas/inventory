process.env.DATA_DIR ||= "/tmp/inventory-data";
process.env.ALLOW_DEMO_SEED ||= "true";
process.env.RESET_CORRUPT_STORE ||= "true";
process.env.BUSINESS_TIME_ZONE ||= "Africa/Kinshasa";
process.env.SESSION_MODE ||= "stateless";
process.env.SESSION_SECRET ||= process.env.VERCEL_GIT_COMMIT_SHA || "inventory-demo-local-session-secret";

const { handleApiRequest } = await import("../src/server/index.mjs");

export default async function handler(req, res) {
  return handleApiRequest(req, res);
}

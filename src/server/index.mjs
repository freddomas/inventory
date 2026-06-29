import express from "express";
import helmet from "helmet";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const publicDir = join(root, "public");
const isVercel = Boolean(process.env.VERCEL);
const dataDir = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : isVercel ? "/tmp/inventory-data" : join(root, "data");
const dbPath = join(dataDir, "store.json");
const port = resolvePort(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const isProduction = process.env.NODE_ENV === "production";
const allowDemoSeed = process.env.ALLOW_DEMO_SEED === "true" || !isProduction || isVercel;
const resetCorruptStore = process.env.RESET_CORRUPT_STORE === "true" || !isProduction || isVercel;
const sessionMaxAgeMs = Number(process.env.SESSION_MAX_AGE_MS || 1000 * 60 * 60 * 8);
const sessionMode = process.env.SESSION_MODE || (isVercel ? "stateless" : "memory");
const sessionSecret = process.env.SESSION_SECRET || (isVercel ? process.env.VERCEL_GIT_COMMIT_SHA || "inventory-demo-local-session-secret" : isProduction ? "" : "inventory-dev-session-secret");
const maxLogs = Number(process.env.MAX_LOGS || 1000);
const businessTimeZone = process.env.BUSINESS_TIME_ZONE || "Africa/Kinshasa";
const sessions = new Map();

if (sessionMode === "stateless" && !sessionSecret) {
  throw new Error("SESSION_SECRET is required when SESSION_MODE=stateless.");
}

function resolvePort(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) throw new Error(`Invalid PORT: ${value}`);
  return parsed;
}

function uid(prefix) {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

function now() {
  return new Date().toISOString();
}

function today(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: businessTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, encoded) {
  const [salt, stored] = String(encoded || "").split(":");
  if (!salt || !stored) return false;
  const hash = pbkdf2Sync(password, salt, 120000, 32, "sha256");
  const storedBuffer = Buffer.from(stored, "hex");
  return storedBuffer.length === hash.length && timingSafeEqual(hash, storedBuffer);
}

function loadDb() {
  mkdirSync(dataDir, { recursive: true });
  if (!existsSync(dbPath)) {
    if (!allowDemoSeed) throw new Error(`Missing store at ${dbPath}. Set ALLOW_DEMO_SEED=true only for demo deployments.`);
    const seeded = seedDb();
    saveDb(seeded);
    return seeded;
  }
  try {
    const loaded = migrateDb(JSON.parse(readFileSync(dbPath, "utf8")));
    saveDb(loaded);
    return loaded;
  } catch (error) {
    const backupPath = `${dbPath}.corrupt.${Date.now()}`;
    renameSync(dbPath, backupPath);
    console.error(`Inventory store was unreadable and has been preserved at ${backupPath}`, error);
    if (!resetCorruptStore) throw new Error(`Store is corrupt. Preserved at ${backupPath}. Set RESET_CORRUPT_STORE=true only if reseeding demo data is acceptable.`);
    const seeded = seedDb();
    saveDb(seeded);
    return seeded;
  }
}

function saveDb(db) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const tempPath = `${dbPath}.tmp.${process.pid}`;
  writeFileSync(tempPath, JSON.stringify(db, null, 2));
  renameSync(tempPath, dbPath);
}

let db = loadDb();

function seedDb() {
  const passwordHash = hashPassword("demo2026!");
  const shops = [
    {
      id: "shop_bellevie",
      name: "BelleVie Beauty",
      address: "Avenue de la Justice, Gombe, Kinshasa",
      logoText: "BV",
      logoData: "",
      status: "active",
      gpsLat: "-4.3151",
      gpsLng: "15.2897",
      hours: defaultHours(),
      createdAt: now(),
    },
    {
      id: "shop_luminance",
      name: "Luminance Studio",
      address: "Boulevard du 30 Juin, Kinshasa",
      logoText: "LS",
      logoData: "",
      status: "active",
      gpsLat: "-4.3224",
      gpsLng: "15.3070",
      hours: defaultHours(),
      createdAt: now(),
    },
  ];
  const users = [
    makeUser("usr_super", null, "super_user", "Super User", "super", passwordHash),
    makeUser("usr_bv_admin", "shop_bellevie", "shop_admin", "Nadia Responsable", "admin.bv", passwordHash),
    makeUser("usr_bv_manager", "shop_bellevie", "manager", "Grace Manager", "manager.bv", passwordHash),
    makeUser("usr_bv_agent", "shop_bellevie", "agent", "Amina Agent", "agent.bv", passwordHash),
    makeUser("usr_ls_admin", "shop_luminance", "shop_admin", "Sarah Responsable", "admin.ls", passwordHash),
    makeUser("usr_ls_manager", "shop_luminance", "manager", "Mireille Manager", "manager.ls", passwordHash),
    makeUser("usr_ls_agent", "shop_luminance", "agent", "Joelle Agent", "agent.ls", passwordHash),
  ];
  const a = makeCatalog("shop_bellevie", "bv", 1);
  const b = makeCatalog("shop_luminance", "ls", 2);
  const variants = [...a.variants, ...b.variants];
  const stockEntries = [];
  const movements = [];
  variants.forEach((variant) => {
    stockEntries.push({
      id: uid("entry"),
      shopId: variant.shopId,
      variantId: variant.id,
      quantity: variant.seedQty,
      status: "validated",
      declaredBy: variant.shopId === "shop_bellevie" ? "usr_bv_manager" : "usr_ls_manager",
      decidedBy: variant.shopId === "shop_bellevie" ? "usr_bv_admin" : "usr_ls_admin",
      declaredAt: now(),
      decidedAt: now(),
      managerSeenAt: null,
    });
    variant.stock = variant.seedQty;
    movements.push({
      id: uid("move"),
      shopId: variant.shopId,
      variantId: variant.id,
      typeId: variant.typeId,
      quantity: variant.seedQty,
      reason: "stock_validated",
      createdAt: now(),
    });
    delete variant.seedQty;
  });
  stockEntries.unshift({
    id: "entry_pending_bv_perfume",
    shopId: "shop_bellevie",
    variantId: "bv_var_parfum_50",
    quantity: 7,
    status: "pending_responsable_validation",
    declaredBy: "usr_bv_manager",
    decidedBy: null,
    declaredAt: now(),
    decidedAt: null,
    managerSeenAt: null,
  });
  const sales = [
    seedSale("shop_bellevie", "usr_bv_agent", [
      line("bv_var_lotion_karite", 2, 24, 23),
      line("bv_var_foundation_m", 1, 33, 36),
    ]),
    seedSale("shop_luminance", "usr_ls_agent", [line("ls_var_robe_midi", 1, 47, 46)]),
  ];
  sales.forEach((sale) => {
    sale.lines.forEach((saleLine) => {
      const variant = variants.find((item) => item.id === saleLine.variantId);
      if (!variant) return;
      variant.stock -= saleLine.quantity;
      movements.push({
        id: uid("move"),
        shopId: sale.shopId,
        variantId: variant.id,
        typeId: variant.typeId,
        quantity: -saleLine.quantity,
        reason: "sale_completed",
        createdAt: sale.createdAt,
      });
    });
  });
  return {
    version: 2,
    shops,
    users,
    categories: [...a.categories, ...b.categories],
    subcategories: [...a.subcategories, ...b.subcategories],
    types: [...a.types, ...b.types],
    variants,
    stockEntries,
    movements,
    promotions: [
      {
        id: "promo_bv_foundation",
        shopId: "shop_bellevie",
        label: "Fond de teint vedette",
        targetScope: "type",
        targetId: "bv_type_foundation",
        discountPercent: 18,
        startDate: today(),
        endDate: addDays(8),
        status: "active",
        createdBy: "usr_bv_admin",
        createdAt: now(),
      },
    ],
    sales,
    closures: [],
    alerts: [],
    planning: [],
    shiftSlots: [],
    settings: { platformName: "Inventory Realm", supportEmail: "support@inventory.local" },
    logs: [
      logEvent(null, "system", "system", "SYSTEM_BOOTSTRAPPED", "system", "seed", "success", {
        shops: 2,
      }),
    ],
  };
}

function migrateDb(nextDb) {
  nextDb.shiftSlots ||= [];
  nextDb.planning ||= [];
  for (const shop of nextDb.shops || []) {
    const shopSlots = nextDb.shiftSlots.filter((slot) => slot.shopId === shop.id);
    if (!shopSlots.length) {
      const legacyNames = [...new Set(nextDb.planning.filter((shift) => shift.shopId === shop.id && shift.slot).map((shift) => shift.slot))];
      legacyNames.forEach((name, index) => {
        const sample = nextDb.planning.find((shift) => shift.shopId === shop.id && shift.slot === name);
        nextDb.shiftSlots.push({
          id: uid("slot"),
          shopId: shop.id,
          name,
          start: sample?.start || "",
          end: sample?.end || "",
          active: true,
          sortOrder: index,
          createdAt: now(),
        });
      });
    }
    for (const shift of nextDb.planning.filter((item) => item.shopId === shop.id && !item.slotId)) {
      const slot = nextDb.shiftSlots.find((item) => item.shopId === shop.id && item.name === shift.slot);
      if (slot) shift.slotId = slot.id;
    }
  }
  return nextDb;
}

function defaultHours() {
  return {
    monday: { open: "08:00", close: "18:00", closed: false },
    tuesday: { open: "08:00", close: "18:00", closed: false },
    wednesday: { open: "08:00", close: "18:00", closed: false },
    thursday: { open: "08:00", close: "18:00", closed: false },
    friday: { open: "08:00", close: "18:00", closed: false },
    saturday: { open: "09:00", close: "16:00", closed: false },
    sunday: { open: "00:00", close: "00:00", closed: true },
  };
}

function makeUser(id, shopId, role, name, username, passwordHash) {
  return { id, shopId, role, name, username, passwordHash, active: true, createdAt: now() };
}

function addDays(days) {
  const [year, month, day] = today().split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function seedSale(shopId, agentId, lines) {
  return {
    id: uid("sale"),
    shopId,
    agentId,
    clientName: "Client comptoir",
    contact: "",
    status: "completed",
    notificationStatus: "not_configured",
    createdAt: addDays(-1) + "T09:40:00.000Z",
    decidedBy: null,
    decidedAt: null,
    comment: "",
    lines,
  };
}

function line(variantId, quantity, applicablePrice, soldPrice) {
  return { variantId, quantity, referencePrice: applicablePrice, promotionId: null, applicablePrice, soldPrice };
}

function makeCatalog(shopId, prefix, offset) {
  const categoryRows = [
    ["face", "Soins visage"],
    ["body", "Soins corps"],
    ["hair", "Soins cheveux"],
    ["fragrance", "Parfumerie"],
    ["makeup", "Maquillage"],
    ["nails", "Onglerie"],
    ["wellness", "Hygiène & bien-être"],
    ["beauty_access", "Accessoires beauté"],
    ["clothing", "Habillement femme"],
    ["fashion_access", "Accessoires mode"],
  ];
  const subRows = [
    ["cream", "Crèmes visage", "face"],
    ["serum", "Sérums & traitements", "face"],
    ["lotion", "Lotions corps", "body"],
    ["scrub", "Gommages & exfoliants", "body"],
    ["shampoo", "Shampoings", "hair"],
    ["hairmask", "Masques & soins cheveux", "hair"],
    ["perfume", "Parfums femme", "fragrance"],
    ["foundation", "Fonds de teint & poudres", "makeup"],
    ["dress", "Robes & ensembles", "clothing"],
    ["watch", "Sacs, bijoux & montres", "fashion_access"],
  ];
  const typeRows = [
    ["cream", "Crème hydratante", "cream", 30],
    ["serum", "Sérum visage", "serum", 18],
    ["lotion", "Lotion corporelle", "lotion", 100],
    ["scrub", "Gommage", "scrub", 20],
    ["shampoo", "Shampoing", "shampoo", 25],
    ["hairmask", "Masque cheveux", "hairmask", 16],
    ["perfume", "Parfum", "perfume", 5],
    ["foundation", "Fond de teint", "foundation", 22],
    ["dress", "Robe", "dress", 12],
    ["watch", "Montre", "watch", 5],
  ];
  const variantRows = [
    ["cream_day", "Crème jour peau mixte", "cream", 18, 28],
    ["serum_vitc", "Sérum vitamine C 30ml", "serum", 10, 34],
    ["lotion_karite", "Lotion karité 500ml", "lotion", 64, 24],
    ["scrub_cafe", "Gommage café 250g", "scrub", 15, 18],
    ["shampoo_hydra", "Shampoing hydratant 400ml", "shampoo", 19, 16],
    ["hairmask_keratin", "Masque kératine 300ml", "hairmask", 12, 21],
    ["parfum_50", "Parfum floral 50ml", "perfume", 5, 42],
    ["foundation_m", "Fond de teint teinte moyenne", "foundation", 11, 32],
    ["robe_midi", "Robe midi satin M", "dress", 8, 45],
    ["watch_gold", "Montre dorée modèle A", "watch", 5, 38],
  ];
  const categories = categoryRows.map(([key, name]) => ({ id: `${prefix}_cat_${key}`, shopId, name, active: true }));
  const subcategories = subRows.map(([key, name, cat]) => ({
    id: `${prefix}_sub_${key}`,
    shopId,
    categoryId: `${prefix}_cat_${cat}`,
    name,
    active: true,
  }));
  const types = typeRows.map(([key, name, sub, referenceQty]) => ({
    id: `${prefix}_type_${key}`,
    shopId,
    subcategoryId: `${prefix}_sub_${sub}`,
    name,
    referenceQty,
    active: true,
  }));
  const variants = variantRows.map(([key, name, type, seedQty, price], index) => ({
    id: `${prefix}_var_${key}`,
    shopId,
    typeId: `${prefix}_type_${type}`,
    sku: `${prefix.toUpperCase()}-${String(index + 1).padStart(3, "0")}`,
    name,
    referencePrice: price + offset,
    stock: 0,
    seedQty,
    active: true,
  }));
  return { categories, subcategories, types, variants };
}

function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

function logEvent(shopId, actorId, role, eventCode, entityType, entityId, status = "success", delta = {}) {
  return { id: uid("log"), shopId, actorId, role, eventCode, entityType, entityId, status, delta, createdAt: now() };
}

function addLog(user, eventCode, entityType, entityId, status = "success", delta = {}, shopId = user?.shopId ?? null) {
  db.logs.unshift(logEvent(shopId, user?.id || null, user?.role || "anonymous", eventCode, entityType, entityId, status, delta));
  if (db.logs.length > maxLogs) db.logs.length = maxLogs;
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter((parts) => parts.length === 2),
  );
}

function signSessionPayload(payload) {
  return createHmac("sha256", sessionSecret).update(payload).digest("base64url");
}

function createSessionToken(userId) {
  const payload = Buffer.from(JSON.stringify({ userId, createdAtMs: Date.now() })).toString("base64url");
  return `${payload}.${signSessionPayload(payload)}`;
}

function readSessionToken(token) {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature) return null;
  const expected = signSessionPayload(payload);
  const received = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (received.length !== expectedBuffer.length || !timingSafeEqual(received, expectedBuffer)) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function currentUser(req) {
  const sid = parseCookies(req).sid;
  if (sessionMode === "stateless") {
    const session = readSessionToken(sid);
    if (!session) return null;
    if (Date.now() - Number(session.createdAtMs || 0) > sessionMaxAgeMs) return null;
    return db.users.find((item) => item.id === session.userId && item.active) || null;
  }
  const session = sid ? sessions.get(sid) : null;
  if (!session) return null;
  if (Date.now() - Number(session.createdAtMs || 0) > sessionMaxAgeMs) {
    sessions.delete(sid);
    return null;
  }
  return db.users.find((item) => item.id === session.userId && item.active) || null;
}

function pruneSessions() {
  if (sessionMode === "stateless") return;
  const cutoff = Date.now() - sessionMaxAgeMs;
  for (const [sid, session] of sessions.entries()) {
    if (Number(session.createdAtMs || 0) < cutoff) sessions.delete(sid);
  }
}

function sessionCookie(sid) {
  const maxAge = Math.floor(sessionMaxAgeMs / 1000);
  const secure = isProduction ? "; Secure" : "";
  return `sid=${sid}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}; Path=/${secure}`;
}

function clearSessionCookie() {
  const secure = isProduction ? "; Secure" : "";
  return `sid=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/${secure}`;
}

function json(res, status, payload, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
  res.end(JSON.stringify(payload));
}

async function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function requireAuth(req, res) {
  const user = currentUser(req);
  if (!user) {
    json(res, 401, { error: "auth_required" });
    return null;
  }
  return user;
}

function hasRole(user, roles) {
  return roles.includes(user.role);
}

function ensureRole(user, res, roles) {
  if (!hasRole(user, roles)) {
    addLog(user, "ACCESS_DENIED", "route", roles.join(","), "failed");
    saveDb(db);
    json(res, 403, { error: "forbidden" });
    return false;
  }
  return true;
}

function ensureShop(user, shopId, res) {
  if (user.role === "super_user") return true;
  if (user.shopId === shopId) return true;
  addLog(user, "CROSS_REALM_DENIED", "shop", shopId, "failed");
  saveDb(db);
  json(res, 403, { error: "cross_realm_denied" });
  return false;
}

function scoped(shopId, collection) {
  return db[collection].filter((item) => item.shopId === shopId);
}

function shopExists(shopId) {
  return db.shops.some((shop) => shop.id === shopId);
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function promotionTarget(scope, id, shopId) {
  const collections = {
    category: "categories",
    subcategory: "subcategories",
    type: "types",
    variant: "variants",
  };
  const collection = collections[scope];
  if (!collection) return null;
  return db[collection].find((item) => item.id === id && item.shopId === shopId) || null;
}

function canUseOrigin(req) {
  const method = String(req.method || "GET").toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return true;
  const origin = req.headers.origin;
  if (!origin) return true;
  const hostHeader = req.headers["x-forwarded-host"] || req.headers.host;
  if (!hostHeader) return false;
  try {
    const originUrl = new URL(origin);
    return originUrl.host === hostHeader;
  } catch {
    return false;
  }
}

function bootstrapFor(user) {
  if (user.role === "super_user") {
    return {
      me: publicUser(user),
      shops: db.shops,
      users: db.users.map(publicUser),
      logs: db.logs.slice(0, 300),
      settings: db.settings,
    };
  }
  const shopId = user.shopId;
  refreshAlerts(shopId);
  const base = {
    me: publicUser(user),
    shop: db.shops.find((shop) => shop.id === shopId),
    categories: scoped(shopId, "categories"),
    subcategories: scoped(shopId, "subcategories"),
    types: scoped(shopId, "types"),
    variants: scoped(shopId, "variants"),
    promotions: scoped(shopId, "promotions"),
    closures: scoped(shopId, "closures"),
    alerts: scoped(shopId, "alerts"),
    stockStatuses: stockStatusesForShop(shopId),
    shiftSlots: scoped(shopId, "shiftSlots").filter((slot) => slot.active !== false).sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0)),
  };
  if (user.role === "agent") {
    return {
      ...base,
      users: [publicUser(user)],
      sales: scoped(shopId, "sales").filter((sale) => sale.agentId === user.id),
      stockEntries: [],
      planning: scoped(shopId, "planning").filter((shift) => shift.userId === user.id),
    };
  }
  if (user.role === "manager") {
    return {
      ...base,
      users: scoped(shopId, "users").map(publicUser),
      stockEntries: scoped(shopId, "stockEntries"),
      sales: scoped(shopId, "sales"),
      planning: scoped(shopId, "planning"),
    };
  }
  return {
    ...base,
    users: scoped(shopId, "users").map(publicUser),
    stockEntries: scoped(shopId, "stockEntries"),
    movements: scoped(shopId, "movements"),
    sales: scoped(shopId, "sales"),
    planning: scoped(shopId, "planning"),
    logs: scoped(shopId, "logs").slice(0, 300),
  };
}

function typeStock(typeId) {
  return db.variants.filter((variant) => variant.typeId === typeId).reduce((sum, variant) => sum + Number(variant.stock || 0), 0);
}

function threshold(type) {
  return Math.max(1, Math.ceil(Number(type.referenceQty || 0) * 0.15));
}

function stockStatusesForShop(shopId) {
  return Object.fromEntries(scoped(shopId, "types").map((type) => {
    const available = typeStock(type.id);
    const min = threshold(type);
    const status = available <= 0 ? "out" : available <= min ? "low" : "available";
    return [type.id, { available, threshold: min, status }];
  }));
}

function refreshAlerts(shopId) {
  scoped(shopId, "types").forEach((type) => {
    const available = typeStock(type.id);
    const min = threshold(type);
    let alert = db.alerts.find((item) => item.shopId === shopId && item.typeId === type.id && ["active", "acknowledged", "cleared"].includes(item.status));
    if (available <= min) {
      if (!alert) {
        db.alerts.unshift({ id: uid("alert"), shopId, typeId: type.id, status: "active", available, threshold: min, createdAt: now(), updatedAt: now() });
      } else {
        alert.available = available;
        alert.threshold = min;
        alert.updatedAt = now();
      }
    } else if (alert && alert.status !== "cleared") {
      alert.status = "resolved";
      alert.available = available;
      alert.updatedAt = now();
    }
  });
}

function activePromo(variant, date = today()) {
  const type = db.types.find((item) => item.id === variant.typeId);
  const sub = type ? db.subcategories.find((item) => item.id === type.subcategoryId) : null;
  const cat = sub ? db.categories.find((item) => item.id === sub.categoryId) : null;
  const rank = { category: 1, subcategory: 2, type: 3, variant: 4 };
  return db.promotions
    .filter((promo) => promo.shopId === variant.shopId && promo.status === "active" && promo.startDate <= date && promo.endDate >= date)
    .filter((promo) => {
      if (promo.targetScope === "variant") return promo.targetId === variant.id;
      if (promo.targetScope === "type") return promo.targetId === type?.id;
      if (promo.targetScope === "subcategory") return promo.targetId === sub?.id;
      if (promo.targetScope === "category") return promo.targetId === cat?.id;
      return false;
    })
    .sort((a, b) => rank[b.targetScope] - rank[a.targetScope])[0];
}

function priceFor(variant) {
  const promo = activePromo(variant);
  const referencePrice = Number(variant.referencePrice || 0);
  if (!promo) return { referencePrice, promotionId: null, applicablePrice: referencePrice };
  return {
    referencePrice,
    promotionId: promo.id,
    applicablePrice: Number((referencePrice * (1 - Number(promo.discountPercent) / 100)).toFixed(2)),
  };
}

function saleTotals(sale) {
  return sale.lines.reduce(
    (acc, line) => {
      acc.expected += Number(line.applicablePrice) * Number(line.quantity);
      acc.sold += Number(line.soldPrice) * Number(line.quantity);
      acc.quantity += Number(line.quantity);
      return acc;
    },
    { expected: 0, sold: 0, quantity: 0 },
  );
}

async function routeApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") {
    return json(res, 200, { status: "ok", uptime: Math.round(process.uptime()), timestamp: now() });
  }
  if (!canUseOrigin(req)) return json(res, 403, { error: "origin_forbidden" });
  if (req.method === "POST" && url.pathname === "/api/login") {
    pruneSessions();
    const input = await body(req);
    if (String(input.password || "").length < 8) return json(res, 400, { error: "password_min_8" });
    const user = db.users.find((item) => item.username === input.username && item.active);
    if (!user || !verifyPassword(input.password, user.passwordHash)) {
      db.logs.unshift(logEvent(null, null, "anonymous", "LOGIN_FAILED", "user", "masked", "failed", { usernameHash: String(input.username || "").length }));
      saveDb(db);
      return json(res, 401, { error: "invalid_credentials" });
    }
    const sid = sessionMode === "stateless" ? createSessionToken(user.id) : uid("sid");
    if (sessionMode !== "stateless") sessions.set(sid, { userId: user.id, createdAt: now(), createdAtMs: Date.now() });
    addLog(user, "LOGIN_SUCCESS", "user", user.id);
    saveDb(db);
    return json(res, 200, { me: publicUser(user) }, { "Set-Cookie": sessionCookie(sid) });
  }
  if (req.method === "POST" && url.pathname === "/api/logout") {
    const user = currentUser(req);
    const sid = parseCookies(req).sid;
    if (sid && sessionMode !== "stateless") sessions.delete(sid);
    if (user) addLog(user, "LOGOUT", "user", user.id);
    saveDb(db);
    return json(res, 200, { ok: true }, { "Set-Cookie": clearSessionCookie() });
  }
  const user = requireAuth(req, res);
  if (!user) return;
  if (req.method === "GET" && url.pathname === "/api/bootstrap") return json(res, 200, bootstrapFor(user));
  if (req.method === "GET" && url.pathname === "/api/me") return json(res, 200, { me: publicUser(user) });

  if (req.method === "POST" && url.pathname === "/api/shops") {
    if (!ensureRole(user, res, ["super_user"])) return;
    const input = await body(req);
    if (!input.name || !input.adminUsername || String(input.adminPassword || "").length < 8) return json(res, 400, { error: "invalid_shop_or_admin" });
    if (db.users.some((item) => item.username === input.adminUsername)) return json(res, 409, { error: "username_exists" });
    const shopId = uid("shop");
    const shop = {
      id: shopId,
      name: input.name,
      address: input.address || "",
      logoText: String(input.logoText || input.name.slice(0, 2)).slice(0, 3).toUpperCase(),
      logoData: input.logoData || "",
      status: "active",
      gpsLat: input.gpsLat || "",
      gpsLng: input.gpsLng || "",
      hours: input.hours || defaultHours(),
      createdAt: now(),
    };
    db.shops.push(shop);
    cloneCatalog(shopId);
    const admin = makeUser(uid("usr"), shopId, "shop_admin", input.adminName || "Responsable", input.adminUsername, hashPassword(input.adminPassword));
    db.users.push(admin);
    addLog(user, "SHOP_CREATED", "shop", shopId, "success", { name: shop.name }, shopId);
    addLog(user, "USER_CREATED", "user", admin.id, "success", { role: "shop_admin" }, shopId);
    saveDb(db);
    return json(res, 201, bootstrapFor(user));
  }

  const shopPatch = url.pathname.match(/^\/api\/shops\/([^/]+)$/);
  if (req.method === "PATCH" && shopPatch) {
    const shopId = shopPatch[1];
    if (!ensureShop(user, shopId, res)) return;
    if (!hasRole(user, ["super_user", "shop_admin"])) return json(res, 403, { error: "forbidden" });
    const shop = db.shops.find((item) => item.id === shopId);
    if (!shop) return json(res, 404, { error: "not_found" });
    const input = await body(req);
    ["name", "address", "logoText", "logoData", "gpsLat", "gpsLng", "hours"].forEach((key) => {
      if (input[key] !== undefined) shop[key] = input[key];
    });
    addLog(user, "SHOP_UPDATED", "shop", shopId, "success", { fields: Object.keys(input) }, shopId);
    saveDb(db);
    return json(res, 200, bootstrapFor(user));
  }

  if (req.method === "POST" && url.pathname === "/api/users") {
    const input = await body(req);
    const shopId = user.role === "super_user" ? input.shopId : user.shopId;
    if (!ensureShop(user, shopId, res)) return;
    if (!hasRole(user, ["super_user", "shop_admin"])) return json(res, 403, { error: "forbidden" });
    if (!shopId || !shopExists(shopId)) return json(res, 404, { error: "shop_not_found" });
    if (!String(input.name || "").trim() || !String(input.username || "").trim()) return json(res, 400, { error: "user_fields_required" });
    if (!["shop_admin", "manager", "agent"].includes(input.role)) return json(res, 400, { error: "invalid_role" });
    if (db.users.some((item) => item.username === input.username)) return json(res, 409, { error: "username_exists" });
    if (String(input.password || "").length < 8) return json(res, 400, { error: "password_min_8" });
    const created = makeUser(uid("usr"), shopId, input.role, input.name, input.username, hashPassword(input.password));
    db.users.push(created);
    addLog(user, "USER_CREATED", "user", created.id, "success", { role: input.role }, shopId);
    saveDb(db);
    return json(res, 201, bootstrapFor(user));
  }

  if (req.method === "POST" && url.pathname === "/api/shift-slots") {
    if (!ensureRole(user, res, ["shop_admin"])) return;
    const input = await body(req);
    const name = String(input.name || "").trim();
    const start = String(input.start || "").trim();
    const end = String(input.end || "").trim();
    if (!name || !start || !end) return json(res, 400, { error: "slot_fields_required" });
    if (start >= end) return json(res, 400, { error: "slot_time_invalid" });
    const duplicate = db.shiftSlots.some((slot) => slot.shopId === user.shopId && slot.active !== false && slot.name.toLowerCase() === name.toLowerCase());
    if (duplicate) return json(res, 409, { error: "slot_exists" });
    const slot = { id: uid("slot"), shopId: user.shopId, name, start, end, active: true, sortOrder: scoped(user.shopId, "shiftSlots").length, createdBy: user.id, createdAt: now() };
    db.shiftSlots.push(slot);
    addLog(user, "SHIFT_SLOT_CREATED", "shift_slot", slot.id, "success", { name, start, end });
    saveDb(db);
    return json(res, 201, bootstrapFor(user));
  }

  if (req.method === "POST" && url.pathname === "/api/planning") {
    if (!ensureRole(user, res, ["shop_admin"])) return;
    const input = await body(req);
    if (!isValidDate(input.date)) return json(res, 400, { error: "invalid_date" });
    const target = db.users.find((item) => item.id === input.userId && item.shopId === user.shopId);
    if (!target) return json(res, 404, { error: "user_not_found" });
    const slot = db.shiftSlots.find((item) => item.id === input.slotId && item.shopId === user.shopId && item.active !== false);
    if (!slot) return json(res, 404, { error: "slot_not_found" });
    let shift = db.planning.find((item) => item.shopId === user.shopId && item.userId === input.userId && item.date === input.date && item.slotId === slot.id);
    if (!shift) {
      shift = { id: uid("shift"), shopId: user.shopId, userId: input.userId, date: input.date, slotId: slot.id, slot: slot.name, createdAt: now() };
      db.planning.push(shift);
    }
    shift.slot = slot.name;
    shift.start = slot.start;
    shift.end = slot.end;
    addLog(user, "SHIFT_SCHEDULED", "shift", shift.id, "success", { userId: input.userId, date: input.date, slotId: slot.id });
    saveDb(db);
    return json(res, 200, bootstrapFor(user));
  }

  if (req.method === "POST" && url.pathname === "/api/stock-entries") {
    if (!ensureRole(user, res, ["shop_admin", "manager"])) return;
    const input = await body(req);
    const variant = db.variants.find((item) => item.id === input.variantId);
    if (!variant || !ensureShop(user, variant.shopId, res)) return;
    const quantity = positiveInteger(input.quantity);
    if (!quantity) return json(res, 400, { error: "invalid_quantity" });
    const entry = {
      id: uid("entry"),
      shopId: user.shopId,
      variantId: variant.id,
      quantity,
      status: "pending_responsable_validation",
      declaredBy: user.id,
      decidedBy: null,
      declaredAt: now(),
      decidedAt: null,
      managerSeenAt: user.role === "manager" ? now() : null,
      comment: input.comment || "",
    };
    db.stockEntries.unshift(entry);
    addLog(user, "STOCK_DECLARED", "stock_entry", entry.id, "success", { variantId: variant.id, quantity });
    saveDb(db);
    return json(res, 201, bootstrapFor(user));
  }

  const stockDecision = url.pathname.match(/^\/api\/stock-entries\/([^/]+)\/decision$/);
  if (req.method === "POST" && stockDecision) {
    if (!ensureRole(user, res, ["shop_admin"])) return;
    const entry = db.stockEntries.find((item) => item.id === stockDecision[1]);
    if (!entry || !ensureShop(user, entry.shopId, res)) return;
    const input = await body(req);
    if (!["validated", "rejected"].includes(input.decision)) return json(res, 400, { error: "invalid_decision" });
    if (entry.status !== "pending_responsable_validation") return json(res, 409, { error: "already_decided" });
    entry.status = input.decision;
    entry.decidedBy = user.id;
    entry.decidedAt = now();
    const variant = db.variants.find((item) => item.id === entry.variantId);
    if (input.decision === "validated" && variant) {
      variant.stock += Number(entry.quantity);
      const type = db.types.find((item) => item.id === variant.typeId);
      if (type) type.referenceQty = Math.max(Number(type.referenceQty), typeStock(type.id));
      db.movements.push({ id: uid("move"), shopId: entry.shopId, variantId: variant.id, typeId: variant.typeId, quantity: entry.quantity, reason: "stock_validated", createdAt: now() });
      refreshAlerts(entry.shopId);
    }
    addLog(user, input.decision === "validated" ? "STOCK_VALIDATED" : "STOCK_REJECTED", "stock_entry", entry.id, "success", { quantity: entry.quantity });
    saveDb(db);
    return json(res, 200, bootstrapFor(user));
  }

  const stockView = url.pathname.match(/^\/api\/stock-entries\/([^/]+)\/view$/);
  if (req.method === "POST" && stockView) {
    if (!ensureRole(user, res, ["manager", "shop_admin"])) return;
    const entry = db.stockEntries.find((item) => item.id === stockView[1]);
    if (!entry || !ensureShop(user, entry.shopId, res)) return;
    entry.managerSeenAt = now();
    addLog(user, "STOCK_ENTRY_VIEWED", "stock_entry", entry.id, "success");
    saveDb(db);
    return json(res, 200, bootstrapFor(user));
  }

  if (req.method === "POST" && url.pathname === "/api/types") {
    if (!ensureRole(user, res, ["shop_admin"])) return;
    const input = await body(req);
    const sub = db.subcategories.find((item) => item.id === input.subcategoryId);
    if (!sub || !ensureShop(user, sub.shopId, res)) return;
    const referenceQty = positiveInteger(input.referenceQty);
    if (!String(input.name || "").trim() || !referenceQty) return json(res, 400, { error: "invalid_type" });
    const type = { id: uid("type"), shopId: user.shopId, subcategoryId: sub.id, name: String(input.name).trim(), referenceQty, active: true };
    db.types.push(type);
    addLog(user, "PRODUCT_TYPE_CREATED", "type", type.id, "success", { subcategoryId: sub.id });
    saveDb(db);
    return json(res, 201, bootstrapFor(user));
  }

  if (req.method === "POST" && url.pathname === "/api/variants") {
    if (!ensureRole(user, res, ["shop_admin"])) return;
    const input = await body(req);
    const type = db.types.find((item) => item.id === input.typeId);
    if (!type || !ensureShop(user, type.shopId, res)) return;
    const referencePrice = finiteNumber(input.referencePrice);
    if (!String(input.name || "").trim() || referencePrice === null || referencePrice < 0) return json(res, 400, { error: "invalid_variant" });
    const variant = { id: uid("var"), shopId: user.shopId, typeId: type.id, sku: input.sku || uid("SKU").toUpperCase(), name: String(input.name).trim(), referencePrice, stock: 0, active: true };
    db.variants.push(variant);
    addLog(user, "VARIANT_CREATED", "variant", variant.id, "success", { typeId: type.id });
    saveDb(db);
    return json(res, 201, bootstrapFor(user));
  }

  if (req.method === "POST" && url.pathname === "/api/promotions") {
    if (!ensureRole(user, res, ["shop_admin"])) return;
    const input = await body(req);
    const discountPercent = finiteNumber(input.discountPercent);
    const target = promotionTarget(input.targetScope, input.targetId, user.shopId);
    if (!String(input.label || "").trim()) return json(res, 400, { error: "invalid_promotion" });
    if (!target) return json(res, 400, { error: "invalid_promotion_target" });
    if (discountPercent === null || discountPercent < 1 || discountPercent > 90) return json(res, 400, { error: "invalid_discount" });
    if (!isValidDate(input.startDate) || !isValidDate(input.endDate) || input.startDate > input.endDate) return json(res, 400, { error: "invalid_promotion_dates" });
    const promo = { id: uid("promo"), shopId: user.shopId, label: String(input.label).trim(), targetScope: input.targetScope, targetId: input.targetId, discountPercent, startDate: input.startDate, endDate: input.endDate, status: "active", createdBy: user.id, createdAt: now() };
    db.promotions.unshift(promo);
    addLog(user, "PROMOTION_CREATED", "promotion", promo.id, "success", { targetScope: promo.targetScope, targetId: promo.targetId });
    saveDb(db);
    return json(res, 201, bootstrapFor(user));
  }

  if (req.method === "POST" && url.pathname === "/api/sales") {
    if (!ensureRole(user, res, ["agent", "shop_admin"])) return;
    const input = await body(req);
    if (!Array.isArray(input.lines) || !input.lines.length) return json(res, 400, { error: "empty_cart" });
    const lines = [];
    for (const raw of input.lines) {
      const variant = db.variants.find((item) => item.id === raw.variantId);
      if (!variant || !ensureShop(user, variant.shopId, res)) return;
      const quantity = positiveInteger(raw.quantity);
      if (!quantity || quantity > variant.stock) return json(res, 400, { error: "stock_insufficient", variantId: variant.id });
      const price = priceFor(variant);
      const soldPrice = finiteNumber(raw.soldPrice);
      if (soldPrice === null || soldPrice < 0) return json(res, 400, { error: "invalid_price", variantId: variant.id });
      lines.push({ variantId: variant.id, quantity, referencePrice: price.referencePrice, promotionId: price.promotionId, applicablePrice: price.applicablePrice, soldPrice });
    }
    const underPrice = lines.some((saleLine) => Number(saleLine.soldPrice) < Number(saleLine.applicablePrice));
    const sale = { id: uid("sale"), shopId: user.shopId, agentId: user.id, clientName: input.clientName || "", contact: input.contact || "", status: underPrice ? "pending_admin_approval" : "completed", notificationStatus: "not_configured", createdAt: now(), decidedBy: null, decidedAt: null, comment: "", lines };
    db.sales.unshift(sale);
    if (!underPrice) completeSaleStock(sale);
    addLog(user, underPrice ? "SALE_PENDING_APPROVAL" : "SALE_COMPLETED", "sale", sale.id, "success", { lines: lines.length, total: saleTotals(sale).sold });
    addLog(user, "NOTIFICATION_NOT_CONFIGURED", "sale", sale.id, "success", { blocking: false });
    refreshAlerts(user.shopId);
    saveDb(db);
    return json(res, 201, bootstrapFor(user));
  }

  const saleDecision = url.pathname.match(/^\/api\/sales\/([^/]+)\/decision$/);
  if (req.method === "POST" && saleDecision) {
    if (!ensureRole(user, res, ["shop_admin"])) return;
    const sale = db.sales.find((item) => item.id === saleDecision[1]);
    if (!sale || !ensureShop(user, sale.shopId, res)) return;
    const input = await body(req);
    if (sale.status !== "pending_admin_approval") return json(res, 409, { error: "not_pending" });
    if (input.decision === "rejected") {
      sale.status = "rejected";
    } else if (input.decision === "approved") {
      for (const saleLine of sale.lines) {
        const variant = db.variants.find((item) => item.id === saleLine.variantId);
        if (!variant || variant.stock < saleLine.quantity) return json(res, 400, { error: "stock_insufficient" });
      }
      sale.status = "completed";
      completeSaleStock(sale);
    } else {
      return json(res, 400, { error: "invalid_decision" });
    }
    sale.decidedBy = user.id;
    sale.decidedAt = now();
    addLog(user, sale.status === "completed" ? "SALE_APPROVED" : "SALE_REJECTED", "sale", sale.id, "success", { total: saleTotals(sale).sold });
    refreshAlerts(user.shopId);
    saveDb(db);
    return json(res, 200, bootstrapFor(user));
  }

  if (req.method === "POST" && url.pathname === "/api/closures") {
    if (!ensureRole(user, res, ["agent", "shop_admin"])) return;
    const input = await body(req);
    const date = input.date || today();
    if (!isValidDate(date)) return json(res, 400, { error: "invalid_date" });
    if (date > today()) return json(res, 400, { error: "future_closure_forbidden" });
    if (db.closures.some((item) => item.shopId === user.shopId && item.businessDate === date)) return json(res, 409, { error: "already_closed" });
    const pending = scoped(user.shopId, "sales").filter((sale) => sale.createdAt.slice(0, 10) === date && sale.status === "pending_admin_approval");
    if (pending.length) {
      addLog(user, "CLOSURE_BLOCKED", "closure", date, "failed", { pendingSales: pending.length });
      saveDb(db);
      return json(res, 409, { error: "pending_sales", count: pending.length });
    }
    const sales = scoped(user.shopId, "sales").filter((sale) => sale.createdAt.slice(0, 10) === date && sale.status === "completed");
    const summary = sales.reduce((acc, sale) => {
      const totals = saleTotals(sale);
      acc.revenue += totals.sold;
      acc.expected += totals.expected;
      acc.sales += 1;
      acc.items += totals.quantity;
      return acc;
    }, { revenue: 0, expected: 0, sales: 0, items: 0 });
    const closure = { id: uid("closure"), shopId: user.shopId, businessDate: date, status: "closed", closedBy: user.id, closedAt: now(), comment: input.comment || "", summary };
    db.closures.unshift(closure);
    addLog(user, "DAILY_CLOSURE_COMPLETED", "closure", closure.id, "success", { date, summary });
    saveDb(db);
    return json(res, 201, bootstrapFor(user));
  }

  return json(res, 404, { error: "not_found" });
}

function completeSaleStock(sale) {
  sale.lines.forEach((saleLine) => {
    const variant = db.variants.find((item) => item.id === saleLine.variantId);
    if (!variant) return;
    variant.stock -= Number(saleLine.quantity);
    db.movements.push({ id: uid("move"), shopId: sale.shopId, variantId: variant.id, typeId: variant.typeId, quantity: -Number(saleLine.quantity), reason: "sale_completed", createdAt: now() });
  });
}

function cloneCatalog(shopId) {
  const prefix = shopId.replace(/[^a-z0-9]/gi, "").slice(-6).toLowerCase();
  const catalog = makeCatalog(shopId, prefix, 0);
  catalog.variants.forEach((variant) => {
    variant.stock = 0;
    delete variant.seedQty;
  });
  db.categories.push(...catalog.categories);
  db.subcategories.push(...catalog.subcategories);
  db.types.push(...catalog.types);
  db.variants.push(...catalog.variants);
}

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          connectSrc: ["'self'"],
          imgSrc: ["'self'", "data:"],
          objectSrc: ["'none'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
        },
      },
    }),
  );
  app.use(express.json({ limit: process.env.JSON_LIMIT || "5mb" }));

  app.use("/api", async (req, res) => {
    try {
      const origin = `${req.protocol || "http"}://${req.headers.host || `${host}:${port}`}`;
      await routeApi(req, res, new URL(req.originalUrl || req.url || "/", origin));
    } catch (error) {
      console.error(error);
      if (!res.headersSent) json(res, 500, { error: "server_error" });
    }
  });

  app.use(express.static(publicDir, { index: "index.html", maxAge: process.env.NODE_ENV === "production" ? "1h" : 0 }));
  app.get(/.*/, (req, res) => res.sendFile(join(publicDir, "index.html")));

  app.use((error, req, res, next) => {
    console.error(error);
    if (res.headersSent) return next(error);
    return json(res, error.status || 500, { error: error.type === "entity.too.large" ? "payload_too_large" : "server_error" });
  });

  return app;
}

export async function handleApiRequest(req, res) {
  try {
    const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
    const protocol = forwardedProto || (req.socket?.encrypted ? "https" : "http");
    const forwardedHost = String(req.headers["x-forwarded-host"] || "").split(",")[0].trim();
    const requestHost = forwardedHost || req.headers.host || `${host}:${port}`;
    await routeApi(req, res, new URL(req.url || "/", `${protocol}://${requestHost}`));
  } catch (error) {
    console.error(error);
    if (!res.headersSent) json(res, 500, { error: "server_error" });
  }
}

export function startServer(options = {}) {
  const listenPort = Number(options.port || port);
  const listenHost = options.host || host;
  const app = createApp();
  const server = app.listen(listenPort, listenHost, () => {
    const address = server.address();
    const actualPort = typeof address === "object" && address ? address.port : listenPort;
    console.log(`Inventory Realm available on http://${listenHost}:${actualPort}`);
  });
  return server;
}

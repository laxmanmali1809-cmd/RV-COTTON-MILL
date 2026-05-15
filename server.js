const http = require("node:http");
const fs = require("node:fs/promises");
const fssync = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const UPLOAD_DIR = path.join(ROOT, "uploads");
const DB_FILE = path.join(DATA_DIR, "db.json");
const PORT = Number(process.env.PORT || 3000);

const SHEET_ID = process.env.GOOGLE_SHEET_ID || "1B5EkMFuu70iDiVcze_0y2DrqEER2Zpx4xlKuT0j57dA";
const DEFAULT_SHEET_URL =
  process.env.GOOGLE_SHEET_CSV_URL ||
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${process.env.GOOGLE_SHEET_GID || "0"}`;

const sessions = new Map();
const eventClients = new Set();
const STAFF_ROLES = new Set(["admin", "owner", "developer", "coworker"]);
const POWER_ROLES = new Set(["admin", "owner", "developer"]);

let db;
let saving = Promise.resolve();

function now() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomBytes(9).toString("hex")}`;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return `${salt}:${crypto.createHash("sha256").update(`${salt}:${password}`).digest("hex")}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, expected] = stored.split(":");
  const actual = crypto.createHash("sha256").update(`${salt}:${password}`).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(actual, "hex");
  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

function seedUser({ username, password, role, name, clientCode = "" }) {
  return {
    id: makeId("user"),
    username,
    passwordHash: hashPassword(password),
    role,
    name,
    clientCode,
    active: true,
    createdAt: now(),
    updatedAt: now()
  };
}

function createSeedDb() {
  return {
    users: [
      seedUser({ username: "owner", password: "Owner@123", role: "owner", name: "RV Cotton Mill Owner" }),
      seedUser({ username: "admin", password: "Admin@123", role: "admin", name: "Admin Office" }),
      seedUser({ username: "developer", password: "Developer@123", role: "developer", name: "Developer" }),
      seedUser({ username: "dispatch", password: "Dispatch@123", role: "coworker", name: "Dispatch Team" }),
      seedUser({
        username: "client-a",
        password: "Client@123",
        role: "client",
        name: "Radhika Fashion House",
        clientCode: "RVC-RFH-001"
      }),
      seedUser({
        username: "client-b",
        password: "Client@123",
        role: "client",
        name: "Surat Textile Hub",
        clientCode: "RVC-STH-002"
      })
    ],
    orders: [
      {
        id: makeId("po"),
        poNo: "PO-2401",
        orderDate: "2026-05-01",
        clientCode: "RVC-RFH-001",
        clientName: "Radhika Fashion House",
        code: "RFH-CAM-47",
        fabric: "Cambric Cotton",
        quantity: 4200,
        itemImage: "/assets/fabric-sample.svg",
        status: "Undispatched",
        dispatchDate: "",
        deliveryCode: "",
        attachments: [],
        source: "seed",
        updatedAt: now()
      },
      {
        id: makeId("po"),
        poNo: "PO-2402",
        orderDate: "2026-05-03",
        clientCode: "RVC-STH-002",
        clientName: "Surat Textile Hub",
        code: "STH-POP-19",
        fabric: "Poplin Cotton",
        quantity: 2800,
        itemImage: "/assets/fabric-sample.svg",
        status: "Dispatched",
        dispatchDate: "2026-05-12",
        deliveryCode: "DEL-STH-5572",
        attachments: [],
        source: "seed",
        updatedAt: now()
      },
      {
        id: makeId("po"),
        poNo: "PO-2403",
        orderDate: "2026-05-05",
        clientCode: "RVC-RFH-001",
        clientName: "Radhika Fashion House",
        code: "RFH-VOI-12",
        fabric: "Cotton Voile",
        quantity: 1600,
        itemImage: "/assets/fabric-sample.svg",
        status: "Undispatched",
        dispatchDate: "",
        deliveryCode: "",
        attachments: [],
        source: "seed",
        updatedAt: now()
      }
    ],
    queries: [
      {
        id: makeId("query"),
        clientCode: "RVC-RFH-001",
        clientName: "Radhika Fashion House",
        subject: "Dispatch estimate for PO-2401",
        message: "Please share the expected dispatch date.",
        status: "Open",
        replies: [],
        createdAt: now(),
        updatedAt: now()
      }
    ],
    settings: {
      companyName: "RV Cotton Mill",
      city: "Surat",
      sector: "Textile market sector",
      sheetCsvUrl: DEFAULT_SHEET_URL,
      sheetSyncSeconds: 60,
      sheet: {
        lastSyncAt: "",
        status: "Not synced yet",
        message: "Use Sync Sheet after making the Google Sheet public to anyone with the link.",
        imported: 0,
        updated: 0
      }
    }
  };
}

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(DB_FILE, "utf8");
    db = JSON.parse(raw);
    db.settings ||= {};
    db.settings.sheetCsvUrl ||= DEFAULT_SHEET_URL;
    db.settings.sheetSyncSeconds ||= 60;
    db.settings.sheet ||= { status: "Not synced yet", message: "" };
    db.queries ||= [];
    db.users ||= [];
    db.orders ||= [];
  } catch {
    db = createSeedDb();
    await saveDb();
  }
}

async function saveDb() {
  saving = saving.then(() => fs.writeFile(DB_FILE, JSON.stringify(db, null, 2)));
  return saving;
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        if (index === -1) return [part, ""];
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    name: user.name,
    clientCode: user.clientCode || "",
    active: Boolean(user.active)
  };
}

function getUser(req) {
  const sid = parseCookies(req.headers.cookie).sid;
  if (!sid) return null;
  const session = sessions.get(sid);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(sid);
    return null;
  }
  session.expiresAt = Date.now() + 1000 * 60 * 60 * 8;
  return db.users.find((user) => user.id === session.userId && user.active) || null;
}

function canManageOrders(user) {
  return user && STAFF_ROLES.has(user.role);
}

function canManageUsers(user) {
  return user && POWER_ROLES.has(user.role);
}

function canSeeAll(user) {
  return user && STAFF_ROLES.has(user.role);
}

function visibleOrders(user) {
  if (!user) return [];
  if (canSeeAll(user)) return db.orders;
  return db.orders.filter((order) => order.clientCode === user.clientCode || order.code === user.clientCode);
}

function visibleQueries(user) {
  if (!user) return [];
  if (canSeeAll(user)) return db.queries;
  return db.queries.filter((query) => query.clientCode === user.clientCode);
}

function sendJson(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers
  });
  res.end(body);
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

async function readBody(req, maxBytes = 1024 * 1024) {
  let total = 0;
  const chunks = [];
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      throw new Error("Request is too large.");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readJson(req, maxBytes) {
  const body = await readBody(req, maxBytes);
  if (!body) return {};
  return JSON.parse(body);
}

function requireUser(req, res) {
  const user = getUser(req);
  if (!user) {
    sendError(res, 401, "Login required.");
    return null;
  }
  return user;
}

function normalizeStatus(value) {
  const text = String(value || "").trim().toLowerCase();
  if (text === "true" || text === "1") return "Dispatched";
  if (text === "false" || text === "0") return "Undispatched";
  if (text.includes("dispatch") && !text.includes("undispatch")) return "Dispatched";
  if (text === "yes" || text === "done" || text === "complete") return "Dispatched";
  return "Undispatched";
}

function normalizeDate(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const parsed = Date.parse(text);
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  return text.slice(0, 10);
}

function normalizeQuantity(value) {
  if (typeof value === "number") return value;
  const text = String(value || "").trim();
  if (!text) return "";
  const match = text.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return text;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : text;
}

function normalizeOrderInput(input, existing = {}) {
  const clientCode = String(input.clientCode ?? input.code ?? existing.clientCode ?? "").trim();
  const status = normalizeStatus(input.status ?? existing.status);
  return {
    poNo: String(input.poNo ?? existing.poNo ?? "").trim(),
    orderDate: normalizeDate(input.orderDate ?? existing.orderDate ?? ""),
    clientCode,
    clientName: String(input.clientName ?? existing.clientName ?? clientCode).trim(),
    code: String(input.code ?? existing.code ?? clientCode).trim(),
    fabric: String(input.fabric ?? existing.fabric ?? "").trim(),
    quantity: normalizeQuantity(input.quantity ?? existing.quantity ?? ""),
    itemImage: String(input.itemImage ?? existing.itemImage ?? "").trim(),
    status,
    dispatchDate: status === "Dispatched"
      ? normalizeDate(input.dispatchDate ?? existing.dispatchDate ?? "")
      : "",
    deliveryCode: status === "Dispatched"
      ? String(input.deliveryCode ?? existing.deliveryCode ?? "").trim()
      : ""
  };
}

function orderResponse(order) {
  return {
    ...order,
    attachments: Array.isArray(order.attachments) ? order.attachments : []
  };
}

function sanitizeFilename(filename) {
  const base = path.basename(String(filename || "file"));
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "file";
}

function saveAttachment(order, file) {
  const match = String(file.dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Attachment data is not valid.");
  const mime = match[1].toLowerCase();
  if (!mime.startsWith("image/") && mime !== "application/pdf") {
    throw new Error("Only images and PDF files are accepted.");
  }
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length > 12 * 1024 * 1024) {
    throw new Error("Each attachment must be 12 MB or smaller.");
  }
  const attachmentId = makeId("file");
  const filename = `${attachmentId}-${sanitizeFilename(file.name || (mime === "application/pdf" ? "document.pdf" : "image.png"))}`;
  const orderDir = path.join(UPLOAD_DIR, order.id);
  const diskPath = path.join(orderDir, filename);
  const url = `/uploads/${order.id}/${filename}`;
  return fs.mkdir(orderDir, { recursive: true }).then(() => fs.writeFile(diskPath, buffer)).then(() => {
    const attachment = {
      id: attachmentId,
      name: sanitizeFilename(file.name || filename),
      type: mime,
      size: buffer.length,
      url,
      uploadedAt: now()
    };
    order.attachments ||= [];
    order.attachments.push(attachment);
    if (mime.startsWith("image/")) order.itemImage = order.itemImage || url;
    order.updatedAt = now();
    return attachment;
  });
}

function deleteAttachment(order, attachmentId) {
  const attachment = (order.attachments || []).find((item) => item.id === attachmentId);
  if (!attachment) return false;
  order.attachments = order.attachments.filter((item) => item.id !== attachmentId);
  order.updatedAt = now();
  const absolute = path.join(ROOT, attachment.url.replace(/^\/+/, ""));
  if (absolute.startsWith(UPLOAD_DIR)) {
    fs.unlink(absolute).catch(() => {});
  }
  if (order.itemImage === attachment.url) {
    const nextImage = order.attachments.find((item) => item.type && item.type.startsWith("image/"));
    order.itemImage = nextImage ? nextImage.url : "";
  }
  return true;
}

function broadcast(event, payload) {
  const message = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of eventClients) {
    client.write(message);
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows.filter((item) => item.some((value) => String(value).trim()));
}

function normalizeHeader(header) {
  return String(header || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function recordGetter(headers, values) {
  const normalized = headers.map(normalizeHeader);
  return (...names) => {
    for (const name of names) {
      const index = normalized.indexOf(normalizeHeader(name));
      if (index >= 0) return values[index] ?? "";
    }
    return "";
  };
}

async function syncSheet() {
  const started = now();
  const sheetUrl = db.settings.sheetCsvUrl || DEFAULT_SHEET_URL;
  try {
    const response = await fetch(sheetUrl, { headers: { "cache-control": "no-cache" } });
    if (!response.ok) throw new Error(`Sheet returned HTTP ${response.status}.`);
    const text = await response.text();
    if (/<!doctype html|<html/i.test(text.slice(0, 500))) {
      throw new Error("Google returned a web page. Publish/share the sheet as CSV first.");
    }
    const rows = parseCsv(text);
    if (rows.length < 2) throw new Error("No order rows were found in the CSV.");
    const headers = rows[0];
    let imported = 0;
    let updated = 0;
    for (const values of rows.slice(1)) {
      const get = recordGetter(headers, values);
      const code = get("code", "client code", "clientcode", "customer code");
      const input = {
        poNo: get("po no", "po no.", "po", "pono", "purchase order", "purchaseorder"),
        orderDate: get("order date", "orderdate", "date"),
        clientCode: get("client code", "clientcode", "customer code", "customercode") || code,
        clientName: get("client", "client name", "clientname", "customer", "customer name"),
        code,
        fabric: get("fabric", "fabric name", "fabricname", "item details", "itemdetails", "item", "details"),
        quantity: get("quantity", "qty"),
        itemImage: get("image of item", "image", "image url", "imageurl", "item image"),
        status: get("order status", "status", "dispatch status", "dispatched"),
        dispatchDate: get("dispatch date", "dispatchdate"),
        deliveryCode: get("delivery code", "deliverycode", "tracking code", "trackingcode")
      };
      const normalized = normalizeOrderInput(input);
      if (!normalized.poNo || !normalized.clientCode) continue;
      const existing = db.orders.find(
        (order) =>
          String(order.poNo).toLowerCase() === normalized.poNo.toLowerCase() &&
          String(order.clientCode).toLowerCase() === normalized.clientCode.toLowerCase()
      );
      if (existing) {
        Object.assign(existing, normalized, {
          source: "sheet",
          attachments: existing.attachments || [],
          updatedAt: now()
        });
        updated += 1;
      } else {
        db.orders.push({
          id: makeId("po"),
          ...normalized,
          attachments: [],
          source: "sheet",
          updatedAt: now()
        });
        imported += 1;
      }
    }
    db.settings.sheet = {
      lastSyncAt: started,
      status: "Synced",
      message: "Google Sheet CSV imported successfully.",
      imported,
      updated
    };
    await saveDb();
    broadcast("orders", { reason: "sheet-sync", imported, updated, at: now() });
    return db.settings.sheet;
  } catch (error) {
    db.settings.sheet = {
      lastSyncAt: started,
      status: "Sync failed",
      message: error.message,
      imported: 0,
      updated: 0
    };
    await saveDb();
    return db.settings.sheet;
  }
}

function buildDashboard(user) {
  const orders = visibleOrders(user);
  const total = orders.length;
  const dispatched = orders.filter((order) => order.status === "Dispatched").length;
  const pending = total - dispatched;
  const quantity = orders.reduce((sum, order) => sum + (Number(order.quantity) || 0), 0);
  const clientMap = new Map();
  const fabricMap = new Map();
  for (const order of orders) {
    const client = order.clientName || order.clientCode || "Client";
    clientMap.set(client, (clientMap.get(client) || 0) + (Number(order.quantity) || 0));
    const fabric = order.fabric || "Fabric";
    fabricMap.set(fabric, (fabricMap.get(fabric) || 0) + (Number(order.quantity) || 0));
  }
  return {
    summary: {
      total,
      dispatched,
      pending,
      quantity,
      clients: new Set(orders.map((order) => order.clientCode)).size,
      openQueries: visibleQueries(user).filter((query) => query.status !== "Closed").length
    },
    status: [
      { label: "Dispatched", value: dispatched },
      { label: "Undispatched", value: pending }
    ],
    byClient: Array.from(clientMap, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    byFabric: Array.from(fabricMap, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    flow: [
      { label: "Orders", value: total },
      { label: "Undispatched", value: pending },
      { label: "Dispatched", value: dispatched },
      { label: "Delivery Codes", value: orders.filter((order) => order.deliveryCode).length }
    ]
  };
}

function createChatReply(message, user) {
  const text = String(message || "").toLowerCase();
  const orders = user ? visibleOrders(user) : [];
  const poMatch = text.match(/po[-\s]?[a-z0-9-]+/i);
  if (poMatch) {
    const key = poMatch[0].replace(/\s/g, "").toLowerCase();
    const order = orders.find((item) => String(item.poNo).replace(/\s/g, "").toLowerCase() === key);
    if (order) {
      const dispatch = order.status === "Dispatched"
        ? `It was dispatched on ${order.dispatchDate || "the saved dispatch date"} with delivery code ${order.deliveryCode || "not entered yet"}.`
        : "It is currently undispatched.";
      return `PO ${order.poNo} for ${order.fabric || "fabric"} is ${order.status}. ${dispatch}`;
    }
    return "I could not find that PO in your allowed order list. Please check the PO number or raise a query from the Query section.";
  }
  if (text.includes("price") || text.includes("quote") || text.includes("rate")) {
    return "For a quotation, share fabric type, quantity, delivery city, and target date. The office team can reply from the query inbox.";
  }
  if (text.includes("dispatch") || text.includes("delivery") || text.includes("status")) {
    const pending = orders.filter((order) => order.status !== "Dispatched").length;
    const dispatched = orders.filter((order) => order.status === "Dispatched").length;
    return user
      ? `Your visible orders show ${dispatched} dispatched and ${pending} undispatched PO entries. Search by PO number for exact details.`
      : "Login to see live dispatch status for your own PO entries.";
  }
  if (text.includes("contact") || text.includes("phone") || text.includes("email")) {
    return "RV Cotton Mill is based in Surat textile market. Use the Contact section to send your inquiry, or login and create a tracked query.";
  }
  return "I can help with PO status, dispatch details, delivery codes, quotations, and textile order queries. Mention a PO number for a direct status answer.";
}

async function handleApi(req, res, pathname) {
  if (req.method === "POST" && pathname === "/api/login") {
    const body = await readJson(req, 64 * 1024);
    const user = db.users.find((item) => item.username === String(body.username || "").trim() && item.active);
    if (!user || !verifyPassword(String(body.password || ""), user.passwordHash)) {
      return sendError(res, 401, "Invalid username or password.");
    }
    const sid = crypto.randomBytes(24).toString("hex");
    sessions.set(sid, { userId: user.id, expiresAt: Date.now() + 1000 * 60 * 60 * 8 });
    return sendJson(res, 200, { user: publicUser(user) }, {
      "set-cookie": `sid=${encodeURIComponent(sid)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 8}`
    });
  }

  if (req.method === "POST" && pathname === "/api/logout") {
    const sid = parseCookies(req.headers.cookie).sid;
    if (sid) sessions.delete(sid);
    return sendJson(res, 200, { ok: true }, {
      "set-cookie": "sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
    });
  }

  if (req.method === "GET" && pathname === "/api/me") {
    return sendJson(res, 200, { user: publicUser(getUser(req)), settings: db.settings });
  }

  if (req.method === "POST" && pathname === "/api/chat") {
    const body = await readJson(req, 64 * 1024);
    const user = getUser(req);
    return sendJson(res, 200, { reply: createChatReply(body.message, user), at: now() });
  }

  if (req.method === "POST" && pathname === "/api/public-inquiry") {
    const body = await readJson(req, 256 * 1024);
    const name = String(body.name || "Website visitor").trim();
    const message = String(body.message || "").trim();
    if (!message) return sendError(res, 400, "Inquiry message is required.");
    const query = {
      id: makeId("query"),
      clientCode: "PUBLIC",
      clientName: name,
      subject: "Website inquiry",
      message,
      status: "Open",
      replies: [],
      createdAt: now(),
      updatedAt: now()
    };
    db.queries.unshift(query);
    await saveDb();
    broadcast("queries", { reason: "public-inquiry", queryId: query.id, at: now() });
    return sendJson(res, 201, { query });
  }

  if (pathname === "/api/events" && req.method === "GET") {
    const user = requireUser(req, res);
    if (!user) return;
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive"
    });
    res.write(`event: ready\ndata: ${JSON.stringify({ at: now() })}\n\n`);
    eventClients.add(res);
    req.on("close", () => eventClients.delete(res));
    return;
  }

  const user = requireUser(req, res);
  if (!user) return;

  if (req.method === "GET" && pathname === "/api/dashboard") {
    return sendJson(res, 200, buildDashboard(user));
  }

  if (req.method === "GET" && pathname === "/api/orders") {
    return sendJson(res, 200, { orders: visibleOrders(user).map(orderResponse), sheet: db.settings.sheet });
  }

  if (req.method === "POST" && pathname === "/api/orders") {
    if (!canManageOrders(user)) return sendError(res, 403, "You do not have permission to update orders.");
    const body = await readJson(req, 512 * 1024);
    const normalized = normalizeOrderInput(body);
    if (!normalized.poNo || !normalized.clientCode) {
      return sendError(res, 400, "PO number and client code are required.");
    }
    const duplicate = db.orders.find(
      (order) =>
        order.poNo.toLowerCase() === normalized.poNo.toLowerCase() &&
        order.clientCode.toLowerCase() === normalized.clientCode.toLowerCase()
    );
    if (duplicate) return sendError(res, 409, "This PO already exists for the selected client.");
    const order = {
      id: makeId("po"),
      ...normalized,
      attachments: [],
      source: "manual",
      updatedAt: now()
    };
    db.orders.unshift(order);
    await saveDb();
    broadcast("orders", { reason: "created", orderId: order.id, at: now() });
    return sendJson(res, 201, { order: orderResponse(order) });
  }

  const orderMatch = pathname.match(/^\/api\/orders\/([^/]+)(?:\/attachments(?:\/([^/]+))?)?$/);
  if (orderMatch) {
    const order = db.orders.find((item) => item.id === orderMatch[1]);
    if (!order || (!canSeeAll(user) && order.clientCode !== user.clientCode)) {
      return sendError(res, 404, "Order not found.");
    }
    if (req.method === "PUT" && !orderMatch[2]) {
      if (!canManageOrders(user)) return sendError(res, 403, "You do not have permission to update orders.");
      const body = await readJson(req, 512 * 1024);
      Object.assign(order, normalizeOrderInput(body, order), { updatedAt: now(), source: order.source || "manual" });
      await saveDb();
      broadcast("orders", { reason: "updated", orderId: order.id, at: now() });
      return sendJson(res, 200, { order: orderResponse(order) });
    }
    if (req.method === "POST" && pathname.endsWith("/attachments")) {
      if (!canManageOrders(user)) return sendError(res, 403, "You do not have permission to add files.");
      const body = await readJson(req, 80 * 1024 * 1024);
      const files = Array.isArray(body.files) ? body.files : [];
      if (!files.length) return sendError(res, 400, "No files were received.");
      const saved = [];
      for (const file of files.slice(0, 20)) {
        saved.push(await saveAttachment(order, file));
      }
      await saveDb();
      broadcast("orders", { reason: "attachments", orderId: order.id, at: now() });
      return sendJson(res, 200, { attachments: saved, order: orderResponse(order) });
    }
    if (req.method === "DELETE" && orderMatch[2]) {
      if (!canManageOrders(user)) return sendError(res, 403, "You do not have permission to remove files.");
      const deleted = deleteAttachment(order, orderMatch[2]);
      await saveDb();
      broadcast("orders", { reason: "attachment-deleted", orderId: order.id, at: now() });
      return sendJson(res, 200, { deleted, order: orderResponse(order) });
    }
  }

  if (req.method === "GET" && pathname === "/api/queries") {
    return sendJson(res, 200, { queries: visibleQueries(user) });
  }

  if (req.method === "POST" && pathname === "/api/queries") {
    const body = await readJson(req, 256 * 1024);
    const clientCode = canSeeAll(user) ? String(body.clientCode || user.clientCode || "INTERNAL").trim() : user.clientCode;
    const clientName = canSeeAll(user) ? String(body.clientName || user.name || "Internal").trim() : user.name;
    const query = {
      id: makeId("query"),
      clientCode,
      clientName,
      subject: String(body.subject || "Order inquiry").trim(),
      message: String(body.message || "").trim(),
      status: "Open",
      replies: [],
      createdAt: now(),
      updatedAt: now()
    };
    if (!query.message) return sendError(res, 400, "Message is required.");
    db.queries.unshift(query);
    await saveDb();
    broadcast("queries", { reason: "created", queryId: query.id, at: now() });
    return sendJson(res, 201, { query });
  }

  const queryMatch = pathname.match(/^\/api\/queries\/([^/]+)$/);
  if (queryMatch && req.method === "PUT") {
    const query = db.queries.find((item) => item.id === queryMatch[1]);
    if (!query || (!canSeeAll(user) && query.clientCode !== user.clientCode)) return sendError(res, 404, "Query not found.");
    const body = await readJson(req, 256 * 1024);
    if (canSeeAll(user)) {
      query.status = String(body.status || query.status || "Open");
      if (body.reply) {
        query.replies.push({
          id: makeId("reply"),
          by: user.name,
          role: user.role,
          message: String(body.reply).trim(),
          createdAt: now()
        });
      }
    } else if (body.reply) {
      query.replies.push({
        id: makeId("reply"),
        by: user.name,
        role: "client",
        message: String(body.reply).trim(),
        createdAt: now()
      });
      query.status = "Open";
    }
    query.updatedAt = now();
    await saveDb();
    broadcast("queries", { reason: "updated", queryId: query.id, at: now() });
    return sendJson(res, 200, { query });
  }

  if (req.method === "GET" && pathname === "/api/users") {
    if (!canManageUsers(user)) return sendError(res, 403, "You do not have permission to manage users.");
    return sendJson(res, 200, { users: db.users.map(publicUser) });
  }

  if ((req.method === "POST" || req.method === "PUT") && pathname.startsWith("/api/users")) {
    if (!canManageUsers(user)) return sendError(res, 403, "You do not have permission to manage users.");
    const body = await readJson(req, 256 * 1024);
    const allowedRoles = new Set(["owner", "admin", "developer", "coworker", "client"]);
    const role = allowedRoles.has(body.role) ? body.role : "client";
    if (req.method === "POST") {
      const username = String(body.username || "").trim();
      if (!username || !body.password) return sendError(res, 400, "Username and password are required.");
      if (db.users.some((item) => item.username.toLowerCase() === username.toLowerCase())) {
        return sendError(res, 409, "Username already exists.");
      }
      const created = seedUser({
        username,
        password: String(body.password),
        role,
        name: String(body.name || username).trim(),
        clientCode: role === "client" ? String(body.clientCode || "").trim() : ""
      });
      db.users.push(created);
      await saveDb();
      return sendJson(res, 201, { user: publicUser(created) });
    }
    const userId = pathname.split("/").pop();
    const target = db.users.find((item) => item.id === userId);
    if (!target) return sendError(res, 404, "User not found.");
    target.name = String(body.name || target.name).trim();
    target.role = role;
    target.clientCode = role === "client" ? String(body.clientCode || target.clientCode || "").trim() : "";
    target.active = body.active !== false;
    if (body.password) target.passwordHash = hashPassword(String(body.password));
    target.updatedAt = now();
    await saveDb();
    return sendJson(res, 200, { user: publicUser(target) });
  }

  if (req.method === "GET" && pathname === "/api/settings") {
    if (!canManageOrders(user)) return sendError(res, 403, "You do not have permission to see settings.");
    return sendJson(res, 200, { settings: db.settings });
  }

  if (req.method === "PUT" && pathname === "/api/settings") {
    if (!canManageUsers(user)) return sendError(res, 403, "You do not have permission to change settings.");
    const body = await readJson(req, 128 * 1024);
    if (body.sheetCsvUrl) db.settings.sheetCsvUrl = String(body.sheetCsvUrl).trim();
    if (body.sheetSyncSeconds) db.settings.sheetSyncSeconds = Math.max(30, Number(body.sheetSyncSeconds) || 60);
    await saveDb();
    return sendJson(res, 200, { settings: db.settings });
  }

  if (req.method === "POST" && pathname === "/api/sync") {
    if (!canManageOrders(user)) return sendError(res, 403, "You do not have permission to sync the sheet.");
    const result = await syncSheet();
    return sendJson(res, 200, { sheet: result });
  }

  return sendError(res, 404, "API route not found.");
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".pdf": "application/pdf",
    ".json": "application/json; charset=utf-8"
  }[ext] || "application/octet-stream";
}

async function serveStatic(req, res, pathname) {
  const baseDir = pathname.startsWith("/uploads/") ? ROOT : PUBLIC_DIR;
  const requested = pathname === "/" ? "/index.html" : pathname;
  const fullPath = path.normalize(path.join(baseDir, requested.replace(/^\/+/, "")));
  const allowedBase = pathname.startsWith("/uploads/") ? UPLOAD_DIR : PUBLIC_DIR;
  if (!fullPath.startsWith(allowedBase)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  try {
    const stat = await fs.stat(fullPath);
    if (!stat.isFile()) throw new Error("Not a file");
    res.writeHead(200, {
      "content-type": contentType(fullPath),
      "cache-control": pathname.startsWith("/uploads/") ? "public, max-age=3600" : "no-cache"
    });
    fssync.createReadStream(fullPath).pipe(res);
  } catch {
    if (!pathname.startsWith("/api/") && !path.extname(pathname)) {
      return serveStatic(req, res, "/index.html");
    }
    res.writeHead(404);
    res.end("Not found");
  }
}

function startSheetLoop() {
  setTimeout(() => syncSheet().catch(() => {}), 2500);
  setInterval(() => {
    const seconds = Math.max(30, Number(db.settings.sheetSyncSeconds) || 60);
    const last = Date.parse(db.settings.sheet?.lastSyncAt || 0) || 0;
    if (Date.now() - last >= seconds * 1000) syncSheet().catch(() => {});
  }, 15000);
  setInterval(() => broadcast("ping", { at: now() }), 25000);
}

async function main() {
  await ensureStore();
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const pathname = decodeURIComponent(url.pathname);
      if (pathname.startsWith("/api/")) {
        await handleApi(req, res, pathname);
      } else {
        await serveStatic(req, res, pathname);
      }
    } catch (error) {
      sendError(res, 500, error.message || "Server error.");
    }
  });
  server.listen(PORT, () => {
    console.log(`RV Cotton Mill portal running at http://localhost:${PORT}`);
  });
  startSheetLoop();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || process.argv[2] || 4173);
const host = process.env.HOST || "0.0.0.0";
const sheetId = process.env.SHEET_ID || "1B5EkMFuu70iDiVcze_0y2DrqEER2Zpx4xlKuT0j57dA";
const adminPin = process.env.ADMIN_PIN || "";
const cacheMs = Number(process.env.SHEET_CACHE_MS || 60000);
const imageOverridesPath = join(root, "order-images.json");
const maxJsonBodyBytes = Number(process.env.MAX_JSON_BODY_BYTES || 8 * 1024 * 1024);

let sheetCache = {
  csv: "",
  orders: [],
  fetchedAt: 0
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function hasAdminAccess(request, url) {
  if (!adminPin) return true;
  return request.headers["x-admin-pin"] === adminPin || url.searchParams.get("pin") === adminPin;
}

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

function orderKey(order) {
  return `${normalizeCode(order.clientCode)}|${String(order.poNo || "").trim()}`;
}

async function readRequestJson(request) {
  let body = "";

  for await (const chunk of request) {
    body += chunk;
    if (body.length > maxJsonBodyBytes) {
      throw new Error("Request body too large");
    }
  }

  return body ? JSON.parse(body) : {};
}

async function loadImageOverrides() {
  try {
    return JSON.parse(await readFile(imageOverridesPath, "utf-8"));
  } catch {
    return {};
  }
}

async function saveImageOverrides(overrides) {
  await writeFile(imageOverridesPath, JSON.stringify(overrides, null, 2));
}

async function applyImageOverrides(orders) {
  const overrides = await loadImageOverrides();
  return orders.map((order) => {
    const image = overrides[orderKey(order)]?.image;
    return image ? { ...order, image, hasImageOverride: true } : order;
  });
}

function parseCsv(text) {
  const rows = [];
  let current = "";
  let row = [];
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(current);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  row.push(current);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

function normalizeHeader(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function csvToObjects(csv) {
  const rows = parseCsv(csv);
  const headers = rows[0] || [];

  return rows.slice(1).map((row) => {
    const item = {};
    headers.forEach((header, index) => {
      item[normalizeHeader(header)] = String(row[index] || "").trim();
    });
    return item;
  });
}

function getSheetValue(row, keys) {
  for (const key of keys) {
    const value = row[normalizeHeader(key)];
    if (value) return value;
  }
  return "";
}

function parseSheetDate(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseSheetStatus(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return ["TRUE", "YES", "Y", "DISPATCHED", "DONE", "1"].includes(normalized)
    ? "Dispatched"
    : "Undispatched";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function placeholderImage(code, fabric) {
  const palettes = [
    ["#0d5f66", "#9fd3c7", "#fff8e7"],
    ["#92345d", "#f2c2c9", "#fffdf9"],
    ["#e59b34", "#fff0bd", "#0d5f66"],
    ["#132126", "#e59b34", "#f7f4ee"],
    ["#255f85", "#d9ecf2", "#92345d"],
    ["#6f8945", "#e7f0cf", "#e59b34"]
  ];
  const seed = `${code}${fabric}`.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const colors = palettes[seed % palettes.length];
  const label = escapeHtml((fabric || code || "Fabric").slice(0, 18));
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="720" height="520" viewBox="0 0 720 520">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop stop-color="${colors[0]}" offset="0"/>
          <stop stop-color="${colors[1]}" offset=".62"/>
          <stop stop-color="${colors[2]}" offset="1"/>
        </linearGradient>
        <pattern id="weave" width="36" height="36" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <rect width="36" height="36" fill="none"/>
          <path d="M0 7H36M0 25H36" stroke="rgba(255,255,255,.34)" stroke-width="5"/>
          <path d="M0 16H36" stroke="rgba(19,33,38,.18)" stroke-width="2"/>
        </pattern>
      </defs>
      <rect width="720" height="520" fill="url(#g)"/>
      <rect width="720" height="520" fill="url(#weave)" opacity=".85"/>
      <rect x="42" y="356" width="330" height="82" rx="8" fill="rgba(255,253,249,.82)"/>
      <text x="66" y="408" fill="#132126" font-family="Arial, sans-serif" font-size="38" font-weight="800">${label}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function normalizeImageUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";

  const driveFile = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  const driveOpen = url.match(/[?&]id=([^&]+)/);
  const driveId = driveFile?.[1] || driveOpen?.[1];

  if (driveId) {
    return `https://drive.google.com/thumbnail?id=${driveId}&sz=w1000`;
  }

  return url;
}

function mapSheetOrders(csv) {
  return csvToObjects(csv)
    .map((row, index) => {
      const poNo = getSheetValue(row, ["P.O NO.", "PO NO", "PONO"]);
      const clientCode = normalizeCode(getSheetValue(row, ["CODE", "CLIENT CODE"]));
      const fabric = getSheetValue(row, ["FABRIC", "ITEM DETAILS", "ITEM"]);

      if (!poNo && !clientCode && !fabric) return null;

      const status = parseSheetStatus(getSheetValue(row, ["DISPATCH STATUS", "STATUS", "ORDER STATUS"]));
      const image = normalizeImageUrl(getSheetValue(row, ["IMAGE", "IMAGE URL", "ITEM IMAGE"]));

      return {
        id: `sheet-${index + 2}-${poNo || "no-po"}-${clientCode || "no-code"}`,
        clientName: getSheetValue(row, ["CLIENT NAME", "CLIENT"]) || clientCode || "Client",
        clientCode,
        poNo,
        orderDate: parseSheetDate(getSheetValue(row, ["ORDER DATE", "DATE"])),
        fabric: fabric || "Fabric details pending",
        quantity: getSheetValue(row, ["QUANTITY", "QTY"]) || "-",
        image: image || placeholderImage(clientCode, fabric),
        status,
        dispatchDate: status === "Dispatched" ? parseSheetDate(getSheetValue(row, ["DISPATCH DATE"])) : "",
        deliveryCode: status === "Dispatched" ? getSheetValue(row, ["DELIVERY CODE", "DELIVERY"]) : ""
      };
    })
    .filter(Boolean);
}

async function loadSheetOrders({ force = false } = {}) {
  const now = Date.now();
  if (!force && sheetCache.orders.length && now - sheetCache.fetchedAt < cacheMs) {
    return sheetCache;
  }

  const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`;
  const sheetResponse = await fetch(sheetUrl);

  if (!sheetResponse.ok) {
    throw new Error(`Unable to fetch Google Sheet orders: ${sheetResponse.status}`);
  }

  const csv = await sheetResponse.text();
  sheetCache = {
    csv,
    orders: mapSheetOrders(csv),
    fetchedAt: Date.now()
  };
  return sheetCache;
}

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname === "/api/health") {
      sendJson(response, 200, { ok: true, sheetId, adminProtected: Boolean(adminPin) });
      return;
    }

    if (url.pathname === "/api/google-sheet/orders") {
      if (!hasAdminAccess(request, url)) {
        sendJson(response, 401, { error: "Admin PIN required" });
        return;
      }

      const cache = await loadSheetOrders({ force: url.searchParams.get("force") === "true" });
      response.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Cache-Control": "no-store"
      });
      response.end(cache.csv);
      return;
    }

    if (url.pathname === "/api/orders/admin") {
      if (!hasAdminAccess(request, url)) {
        sendJson(response, 401, { error: "Admin PIN required" });
        return;
      }

      const cache = await loadSheetOrders({ force: url.searchParams.get("force") === "true" });
      const orders = await applyImageOverrides(cache.orders);
      sendJson(response, 200, {
        orders,
        count: orders.length,
        updatedAt: new Date(cache.fetchedAt).toISOString()
      });
      return;
    }

    if (url.pathname === "/api/orders") {
      const clientCode = normalizeCode(url.searchParams.get("clientCode"));
      if (!clientCode) {
        sendJson(response, 400, { error: "clientCode is required" });
        return;
      }

      const cache = await loadSheetOrders({ force: url.searchParams.get("force") === "true" });
      const orders = (await applyImageOverrides(cache.orders)).filter((order) => order.clientCode === clientCode);
      sendJson(response, 200, {
        clientCode,
        orders,
        count: orders.length,
        updatedAt: new Date(cache.fetchedAt).toISOString()
      });
      return;
    }

    if (url.pathname === "/api/order-images" && request.method === "POST") {
      if (!hasAdminAccess(request, url)) {
        sendJson(response, 401, { error: "Admin PIN required" });
        return;
      }

      const payload = await readRequestJson(request);
      const clientCode = normalizeCode(payload.clientCode);
      const poNo = String(payload.poNo || "").trim();
      const image = String(payload.image || "").trim();

      if (!clientCode || !poNo) {
        sendJson(response, 400, { error: "clientCode and poNo are required" });
        return;
      }

      if (image && !image.startsWith("data:image/") && !/^https?:\/\//i.test(image)) {
        sendJson(response, 400, { error: "image must be a data image or URL" });
        return;
      }

      const overrides = await loadImageOverrides();
      const key = orderKey({ clientCode, poNo });

      if (image) {
        overrides[key] = {
          clientCode,
          poNo,
          image,
          updatedAt: new Date().toISOString()
        };
      } else {
        delete overrides[key];
      }

      await saveImageOverrides(overrides);
      sendJson(response, 200, { ok: true, key });
      return;
    }

    const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    if (pathname === "/order-images.json") {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    const filePath = normalize(join(root, pathname));

    if (!filePath.startsWith(root)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    const body = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(body);
  } catch (error) {
    console.error(error);
    if (request.url?.startsWith("/api/")) {
      sendJson(response, 500, { error: "Server error" });
      return;
    }
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}).listen(port, host, () => {
  console.log(`RV COTTON MILL app running at http://${host}:${port}`);
});

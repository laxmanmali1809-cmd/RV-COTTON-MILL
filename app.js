const STORAGE_KEY = "rvCottonMillDispatchState";
const CLIENT_CODE_KEY = "rvCottonMillActiveClientCode";
const SYNC_CHANNEL = "rvCottonMillLiveOrders";
const SHEET_IMPORT_ENDPOINT = "/api/google-sheet/orders";
const MAX_TABLE_ROWS = 120;
const ADMIN_PIN_KEY = "rvCottonMillAdminPin";
const AUTO_SYNC_KEY = "rvCottonMillAutoCsvSync";
const SHEET_SYNC_INTERVAL_MS = 60000;

const els = {
  navTabs: document.querySelectorAll(".nav-tab"),
  views: document.querySelectorAll(".view"),
  lastUpdated: document.getElementById("lastUpdated"),
  activeClientChip: document.getElementById("activeClientChip"),
  statsGrid: document.getElementById("statsGrid"),
  orderForm: document.getElementById("orderForm"),
  orderFormTitle: document.getElementById("orderFormTitle"),
  orderId: document.getElementById("orderId"),
  clientName: document.getElementById("clientName"),
  clientCode: document.getElementById("clientCode"),
  poNo: document.getElementById("poNo"),
  orderDate: document.getElementById("orderDate"),
  fabric: document.getElementById("fabric"),
  quantity: document.getElementById("quantity"),
  orderStatus: document.getElementById("orderStatus"),
  dispatchDate: document.getElementById("dispatchDate"),
  deliveryCode: document.getElementById("deliveryCode"),
  itemImage: document.getElementById("itemImage"),
  imageFileName: document.getElementById("imageFileName"),
  pasteImageZone: document.getElementById("pasteImageZone"),
  pasteImageStatus: document.getElementById("pasteImageStatus"),
  pastedImagePreview: document.getElementById("pastedImagePreview"),
  clearPastedImage: document.getElementById("clearPastedImage"),
  resetOrderForm: document.getElementById("resetOrderForm"),
  cancelEditBtn: document.getElementById("cancelEditBtn"),
  orderSearch: document.getElementById("orderSearch"),
  ordersTable: document.getElementById("ordersTable"),
  clientCodeForm: document.getElementById("clientCodeForm"),
  clientPortalCode: document.getElementById("clientPortalCode"),
  clientSummary: document.getElementById("clientSummary"),
  clientOrders: document.getElementById("clientOrders"),
  queryForm: document.getElementById("queryForm"),
  queryPoNo: document.getElementById("queryPoNo"),
  querySubject: document.getElementById("querySubject"),
  queryMessage: document.getElementById("queryMessage"),
  clientQueries: document.getElementById("clientQueries"),
  adminQueries: document.getElementById("adminQueries"),
  queryFilterButtons: document.querySelectorAll("[data-query-filter]"),
  toast: document.getElementById("toast"),
  importSheetBtn: document.getElementById("importSheetBtn"),
  autoSyncBtn: document.getElementById("autoSyncBtn"),
  sheetSyncStatus: document.getElementById("sheetSyncStatus"),
  seedDataBtn: document.getElementById("seedDataBtn"),
  exportBtn: document.getElementById("exportBtn")
};

let state = loadState();
let activeClientCode = normalizeCode(localStorage.getItem(CLIENT_CODE_KEY) || "RV-SUN-102");
let queryFilter = "All";
let toastTimer;
let stagedPastedImage = "";
let autoSyncEnabled = localStorage.getItem(AUTO_SYNC_KEY) !== "false";
let sheetSyncTimer;

const channel = "BroadcastChannel" in window ? new BroadcastChannel(SYNC_CHANNEL) : null;

function uid(prefix) {
  if (window.crypto && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed.orders) && Array.isArray(parsed.queries)) {
        return parsed;
      }
    } catch (error) {
      console.warn("Saved state could not be read", error);
    }
  }

  const seeded = createSeedState();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
  return seeded;
}

function createSeedState() {
  return {
    updatedAt: new Date().toISOString(),
    orders: [
      {
        id: uid("order"),
        clientName: "Sunrise Garments",
        clientCode: "RV-SUN-102",
        poNo: "PO-2471",
        orderDate: "2026-05-06",
        fabric: "Combed cotton poplin 60s",
        quantity: "3200 m",
        image: textileImage(["#0d5f66", "#9fd3c7", "#fff8e7"], "Poplin"),
        status: "Undispatched",
        dispatchDate: "",
        deliveryCode: ""
      },
      {
        id: uid("order"),
        clientName: "Laxmi Apparel",
        clientCode: "RV-LAX-118",
        poNo: "PO-2464",
        orderDate: "2026-05-02",
        fabric: "Printed cotton voile",
        quantity: "1800 m",
        image: textileImage(["#92345d", "#f2c2c9", "#fffdf9"], "Voile"),
        status: "Dispatched",
        dispatchDate: "2026-05-12",
        deliveryCode: "DLV-ST-7382"
      },
      {
        id: uid("order"),
        clientName: "Sunrise Garments",
        clientCode: "RV-SUN-102",
        poNo: "PO-2458",
        orderDate: "2026-04-28",
        fabric: "Cotton cambric dyed",
        quantity: "2500 m",
        image: textileImage(["#e59b34", "#fff0bd", "#0d5f66"], "Cambric"),
        status: "Dispatched",
        dispatchDate: "2026-05-10",
        deliveryCode: "DLV-ST-7314"
      },
      {
        id: uid("order"),
        clientName: "Armaan Textiles",
        clientCode: "RV-ARM-204",
        poNo: "PO-2480",
        orderDate: "2026-05-09",
        fabric: "Organic cotton twill",
        quantity: "4100 m",
        image: textileImage(["#132126", "#e59b34", "#f7f4ee"], "Twill"),
        status: "Undispatched",
        dispatchDate: "",
        deliveryCode: ""
      }
    ],
    queries: [
      {
        id: uid("query"),
        clientCode: "RV-SUN-102",
        clientName: "Sunrise Garments",
        poNo: "PO-2471",
        subject: "Dispatch timing",
        message: "Please confirm expected dispatch timing for PO-2471.",
        status: "Open",
        reply: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ]
  };
}

function textileImage(colors, label) {
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 520;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, colors[0]);
  gradient.addColorStop(0.58, colors[1]);
  gradient.addColorStop(1, colors[2]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let x = -canvas.height; x < canvas.width; x += 22) {
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + canvas.height, canvas.height);
    ctx.stroke();
  }

  for (let y = 0; y < canvas.height; y += 16) {
    ctx.strokeStyle = y % 32 === 0 ? "rgba(19,33,38,0.22)" : "rgba(255,255,255,0.16)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(255,253,249,0.78)";
  ctx.fillRect(46, 360, 252, 72);
  ctx.fillStyle = "#132126";
  ctx.font = "700 42px Manrope, Arial";
  ctx.fillText(label, 66, 410);
  return canvas.toDataURL("image/png");
}

function textileImageForOrder(code, fabric) {
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
      <text x="66" y="408" fill="#132126" font-family="Manrope, Arial, sans-serif" font-size="38" font-weight="800">${label}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
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
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(current);
      if (row.some((cell) => cell.trim())) {
        rows.push(row);
      }
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  row.push(current);
  if (row.some((cell) => cell.trim())) {
    rows.push(row);
  }

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
        image: image || textileImageForOrder(clientCode, fabric),
        status,
        dispatchDate: status === "Dispatched" ? parseSheetDate(getSheetValue(row, ["DISPATCH DATE"])) : "",
        deliveryCode: status === "Dispatched" ? getSheetValue(row, ["DELIVERY CODE", "DELIVERY"]) : ""
      };
    })
    .filter(Boolean);
}

function orderKey(order) {
  return `${normalizeCode(order.clientCode)}|${String(order.poNo || "").trim()}`;
}

function isGeneratedPlaceholder(image) {
  return String(image || "").startsWith("data:image/svg+xml");
}

function getAdminPin({ promptOnMissing = false } = {}) {
  let pin = localStorage.getItem(ADMIN_PIN_KEY) || "";
  if (!pin && promptOnMissing) {
    pin = window.prompt("Enter admin PIN for hosted sheet import") || "";
    if (pin) {
      localStorage.setItem(ADMIN_PIN_KEY, pin);
    }
  }
  return pin;
}

function setSheetSyncStatus(message) {
  if (els.sheetSyncStatus) {
    els.sheetSyncStatus.textContent = message;
  }
}

function updateAutoSyncButton() {
  if (!els.autoSyncBtn) return;
  els.autoSyncBtn.textContent = autoSyncEnabled ? "Auto CSV sync on" : "Auto CSV sync off";
  els.autoSyncBtn.classList.toggle("primary-btn", autoSyncEnabled);
  els.autoSyncBtn.classList.toggle("ghost-btn", !autoSyncEnabled);
}

function startAutoSheetSync() {
  clearInterval(sheetSyncTimer);
  updateAutoSyncButton();

  if (!autoSyncEnabled) {
    setSheetSyncStatus("CSV auto sync paused");
    return;
  }

  sheetSyncTimer = setInterval(() => {
    importGoogleSheetOrders({ silent: true, keepClientCode: true });
  }, SHEET_SYNC_INTERVAL_MS);

  setSheetSyncStatus("CSV auto sync every 60 sec");
}

async function importGoogleSheetOrders({ silent = false, force = true, keepClientCode = false, retrying = false } = {}) {
  if (!silent) {
    els.importSheetBtn.disabled = true;
    els.importSheetBtn.textContent = "Importing...";
  }
  setSheetSyncStatus(silent ? "Checking CSV..." : "Importing CSV...");

  try {
    const pin = getAdminPin({ promptOnMissing: false });
    const response = await fetch(`${SHEET_IMPORT_ENDPOINT}${force ? "?force=true" : ""}`, {
      cache: "no-store",
      headers: pin ? { "x-admin-pin": pin } : {}
    });

    if (response.status === 401 && !retrying && !silent) {
      const nextPin = getAdminPin({ promptOnMissing: true });
      if (nextPin) {
        return importGoogleSheetOrders({ silent, force, keepClientCode, retrying: true });
      }
    }

    if (!response.ok) {
      throw new Error("Sheet request failed");
    }

    const csv = await response.text();
    const existingImages = new Map(
      state.orders
        .filter((order) => order.image && !isGeneratedPlaceholder(order.image))
        .map((order) => [orderKey(order), order.image])
    );
    const importedOrders = mapSheetOrders(csv).map((order) => ({
      ...order,
      image: existingImages.get(orderKey(order)) || order.image
    }));

    if (!importedOrders.length) {
      showToast("No orders found in the sheet.");
      return;
    }

    state.orders = importedOrders;
    if (!state.queries) {
      state.queries = [];
    }
    if (!keepClientCode || !activeClientCode) {
      activeClientCode = importedOrders[0].clientCode || activeClientCode;
    }
    localStorage.setItem(CLIENT_CODE_KEY, activeClientCode);
    resetOrderForm();
    persist(silent ? "" : `${importedOrders.length} orders imported from Google Sheet.`);
    setSheetSyncStatus(`CSV updated ${formatDateTime(state.updatedAt)} (${importedOrders.length} orders)`);
  } catch (error) {
    console.error(error);
    setSheetSyncStatus("CSV sync failed");
    if (!silent) {
      showToast("Google Sheet import failed. Check sharing access, admin PIN, and server.");
    }
  } finally {
    if (!silent) {
      els.importSheetBtn.disabled = false;
      els.importSheetBtn.textContent = "Import Google Sheet";
    }
  }
}

function persist(message) {
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (channel) {
    channel.postMessage({ type: "state", state });
  }
  render();
  flashLive();
  if (message) {
    showToast(message);
  }
}

function syncFromStorage() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return;
  try {
    const incoming = JSON.parse(saved);
    if (!incoming.updatedAt || incoming.updatedAt === state.updatedAt) return;
    state = incoming;
    render();
    flashLive();
  } catch (error) {
    console.warn("Incoming state could not be read", error);
  }
}

function flashLive() {
  document.querySelector(".sidebar-panel").classList.remove("flash");
  requestAnimationFrame(() => {
    document.querySelector(".sidebar-panel").classList.add("flash");
  });
}

function showToast(message) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("show");
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2600);
}

function render() {
  els.lastUpdated.textContent = `Updated ${formatDateTime(state.updatedAt)}`;
  els.activeClientChip.textContent = activeClientCode || "-";
  els.clientPortalCode.value = activeClientCode;
  renderStats();
  renderOrdersTable();
  renderClient();
  renderQueries();
}

function renderStats() {
  const total = state.orders.length;
  const dispatched = state.orders.filter((order) => order.status === "Dispatched").length;
  const pending = total - dispatched;
  const clients = new Set(state.orders.map((order) => order.clientCode)).size;

  const stats = [
    ["Total orders", total],
    ["Dispatched", dispatched],
    ["Undispatched", pending],
    ["Active clients", clients]
  ];

  els.statsGrid.innerHTML = stats
    .map(
      ([label, value]) => `
        <article class="stat">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </article>
      `
    )
    .join("");
}

function renderOrdersTable() {
  const term = els.orderSearch.value.trim().toLowerCase();
  const orders = state.orders
    .filter((order) => {
      const haystack = [
        order.clientName,
        order.clientCode,
        order.poNo,
        order.fabric,
        order.quantity,
        order.status,
        order.deliveryCode
      ]
        .join(" ")
        .toLowerCase();
      return !term || haystack.includes(term);
    })
    .sort((a, b) => b.orderDate.localeCompare(a.orderDate));

  if (!orders.length) {
    els.ordersTable.innerHTML = `
      <tr>
        <td colspan="10">
          <div class="empty-state">No orders match this view.</div>
        </td>
      </tr>
    `;
    return;
  }

  const visibleOrders = orders.slice(0, MAX_TABLE_ROWS);
  const hiddenCount = orders.length - visibleOrders.length;

  els.ordersTable.innerHTML =
    visibleOrders
    .map(
      (order) => `
        <tr>
          <td><img class="item-thumb" loading="lazy" src="${order.image}" alt="${escapeHtml(order.fabric)}" /></td>
          <td><strong>${escapeHtml(order.poNo)}</strong><br /><span>${escapeHtml(order.clientName)}</span></td>
          <td>${escapeHtml(order.clientCode)}</td>
          <td>${formatDate(order.orderDate)}</td>
          <td>${escapeHtml(order.fabric)}</td>
          <td>${escapeHtml(order.quantity)}</td>
          <td>${statusPill(order.status)}</td>
          <td>${order.dispatchDate ? formatDate(order.dispatchDate) : "-"}</td>
          <td>${escapeHtml(order.deliveryCode || "-")}</td>
          <td>
            <div class="row-actions">
              <button class="mini-btn" type="button" data-action="edit-order" data-id="${order.id}">Edit</button>
              <button class="danger-btn" type="button" data-action="delete-order" data-id="${order.id}">Delete</button>
            </div>
          </td>
        </tr>
      `
    )
      .join("") +
    (hiddenCount > 0
      ? `
        <tr>
          <td colspan="10">
            <div class="empty-state">Showing ${MAX_TABLE_ROWS} of ${orders.length} orders. Use search to narrow the register.</div>
          </td>
        </tr>
      `
      : "");
}

function renderClient() {
  const orders = state.orders
    .filter((order) => order.clientCode === activeClientCode)
    .sort((a, b) => b.orderDate.localeCompare(a.orderDate));
  const dispatched = orders.filter((order) => order.status === "Dispatched").length;
  const pending = orders.length - dispatched;
  const clientName = orders[0]?.clientName || "Client";

  els.clientSummary.innerHTML = [
    ["Client", clientName],
    ["Orders visible", orders.length],
    ["Dispatched / Pending", `${dispatched} / ${pending}`]
  ]
    .map(
      ([label, value]) => `
        <article class="client-summary-tile">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </article>
      `
    )
    .join("");

  if (!orders.length) {
    els.clientOrders.innerHTML = `<div class="empty-state">No orders found for ${escapeHtml(activeClientCode || "this code")}.</div>`;
  } else {
    els.clientOrders.innerHTML = orders.map(orderCard).join("");
  }

  const clientQueries = state.queries
    .filter((query) => query.clientCode === activeClientCode)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  els.clientQueries.innerHTML = clientQueries.length
    ? clientQueries.map(clientQueryItem).join("")
    : `<div class="empty-state">No query history for ${escapeHtml(activeClientCode || "this code")}.</div>`;
}

function orderCard(order) {
  return `
    <article class="order-card">
      <img src="${order.image}" alt="${escapeHtml(order.fabric)}" />
      <div class="order-card-body">
        <div class="order-title">
          <div>
            <p class="eyebrow">${escapeHtml(order.clientCode)}</p>
            <h3>${escapeHtml(order.poNo)}</h3>
          </div>
          ${statusPill(order.status)}
        </div>
        <div class="detail-grid">
          ${detail("Order date", formatDate(order.orderDate))}
          ${detail("Fabric", order.fabric)}
          ${detail("Quantity", order.quantity)}
          ${detail("Dispatch date", order.dispatchDate ? formatDate(order.dispatchDate) : "-")}
          ${detail("Delivery code", order.deliveryCode || "-")}
          ${detail("Status", order.status)}
        </div>
      </div>
    </article>
  `;
}

function detail(label, value) {
  return `
    <div class="detail">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderQueries() {
  const queries = state.queries
    .filter((query) => queryFilter === "All" || query.status === queryFilter)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  els.adminQueries.innerHTML = queries.length
    ? queries.map(adminQueryItem).join("")
    : `<div class="empty-state">No ${queryFilter.toLowerCase()} queries.</div>`;
}

function clientQueryItem(query) {
  return `
    <article class="query-item">
      <div class="query-meta">
        ${statusLabel(query.status)}
        <span>${escapeHtml(query.poNo || "General")}</span>
        <span>${formatDateTime(query.createdAt)}</span>
      </div>
      <h4>${escapeHtml(query.subject)}</h4>
      <p>${escapeHtml(query.message)}</p>
      ${query.reply ? `<div class="reply"><strong>RV reply:</strong> ${escapeHtml(query.reply)}</div>` : ""}
    </article>
  `;
}

function adminQueryItem(query) {
  return `
    <article class="query-item">
      <div class="query-meta">
        ${statusLabel(query.status)}
        <span>${escapeHtml(query.clientCode)}</span>
        <span>${escapeHtml(query.clientName || "Client")}</span>
        <span>${escapeHtml(query.poNo || "General")}</span>
        <span>${formatDateTime(query.createdAt)}</span>
      </div>
      <h4>${escapeHtml(query.subject)}</h4>
      <p>${escapeHtml(query.message)}</p>
      ${query.reply ? `<div class="reply"><strong>Reply:</strong> ${escapeHtml(query.reply)}</div>` : ""}
      <div class="admin-query-actions">
        <label>
          Reply
          <input type="text" value="${escapeAttribute(query.reply || "")}" data-reply-input="${query.id}" placeholder="Type reply" />
        </label>
        <button class="mini-btn" type="button" data-action="reply-query" data-id="${query.id}">Send reply</button>
        <button class="ghost-btn" type="button" data-action="toggle-query" data-id="${query.id}">
          ${query.status === "Answered" ? "Mark open" : "Mark answered"}
        </button>
      </div>
    </article>
  `;
}

function statusPill(status) {
  const className = status === "Dispatched" ? "dispatched" : "undispatched";
  return `<span class="status ${className}">${escapeHtml(status)}</span>`;
}

function statusLabel(status) {
  return `<span class="status ${status === "Answered" ? "dispatched" : "undispatched"}">${escapeHtml(status)}</span>`;
}

function formatDate(dateString) {
  if (!dateString) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(`${dateString}T00:00:00`));
}

function formatDateTime(dateString) {
  if (!dateString) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(dateString));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("\n", " ");
}

function syncDispatchFields() {
  const isDispatched = els.orderStatus.value === "Dispatched";
  els.dispatchDate.disabled = !isDispatched;
  els.deliveryCode.disabled = !isDispatched;
  els.dispatchDate.required = isDispatched;
  els.deliveryCode.required = isDispatched;
  if (!isDispatched) {
    els.dispatchDate.value = "";
    els.deliveryCode.value = "";
  }
}

function resetOrderForm() {
  els.orderForm.reset();
  els.orderId.value = "";
  els.orderFormTitle.textContent = "Add order";
  els.imageFileName.textContent = "No new image selected";
  clearPastedImage();
  els.orderDate.valueAsDate = new Date();
  syncDispatchFields();
}

function findClientName(code) {
  return state.orders.find((order) => order.clientCode === code)?.clientName || "";
}

async function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function setPastedImage(dataUrl, label = "Pasted WhatsApp image ready") {
  stagedPastedImage = dataUrl;
  els.pastedImagePreview.src = dataUrl;
  els.pastedImagePreview.hidden = false;
  els.clearPastedImage.hidden = false;
  els.pasteImageStatus.textContent = label;
  els.pasteImageZone.classList.add("ready");
  els.imageFileName.textContent = "Pasted image will be used";
}

function clearPastedImage() {
  stagedPastedImage = "";
  els.pastedImagePreview.removeAttribute("src");
  els.pastedImagePreview.hidden = true;
  els.clearPastedImage.hidden = true;
  els.pasteImageStatus.textContent = "No pasted image";
  els.pasteImageZone.classList.remove("ready");
}

async function handleImagePaste(event) {
  const items = Array.from(event.clipboardData?.items || []);
  const imageItem = items.find((item) => item.type.startsWith("image/"));

  if (!imageItem) {
    showToast("No image found in clipboard.");
    return;
  }

  event.preventDefault();
  const file = imageItem.getAsFile();
  if (!file) {
    showToast("Clipboard image could not be read.");
    return;
  }

  const dataUrl = await readImageFile(file);
  els.itemImage.value = "";
  setPastedImage(dataUrl);
  showToast("Image pasted. Save order to publish it.");
}

async function handleOrderSubmit(event) {
  event.preventDefault();
  const id = els.orderId.value || uid("order");
  const existing = state.orders.find((order) => order.id === id);
  const file = els.itemImage.files[0];
  const image = stagedPastedImage || (file
    ? await readImageFile(file)
    : existing?.image || textileImageForOrder(els.clientCode.value, els.fabric.value || "Fabric"));

  const status = els.orderStatus.value;
  const order = {
    id,
    clientName: els.clientName.value.trim(),
    clientCode: normalizeCode(els.clientCode.value),
    poNo: els.poNo.value.trim(),
    orderDate: els.orderDate.value,
    fabric: els.fabric.value.trim(),
    quantity: els.quantity.value.trim(),
    image,
    status,
    dispatchDate: status === "Dispatched" ? els.dispatchDate.value : "",
    deliveryCode: status === "Dispatched" ? els.deliveryCode.value.trim() : ""
  };

  const index = state.orders.findIndex((item) => item.id === id);
  if (index >= 0) {
    state.orders[index] = order;
  } else {
    state.orders.unshift(order);
  }

  resetOrderForm();
  persist(index >= 0 ? "Order updated live." : "Order added live.");
}

function editOrder(id) {
  const order = state.orders.find((item) => item.id === id);
  if (!order) return;

  els.orderId.value = order.id;
  els.clientName.value = order.clientName;
  els.clientCode.value = order.clientCode;
  els.poNo.value = order.poNo;
  els.orderDate.value = order.orderDate;
  els.fabric.value = order.fabric;
  els.quantity.value = order.quantity;
  els.orderStatus.value = order.status;
  els.dispatchDate.value = order.dispatchDate || "";
  els.deliveryCode.value = order.deliveryCode || "";
  els.itemImage.value = "";
  els.imageFileName.textContent = "Current image will be kept";
  clearPastedImage();
  els.orderFormTitle.textContent = `Edit ${order.poNo}`;
  syncDispatchFields();
  document.getElementById("adminView").scrollIntoView({ behavior: "smooth", block: "start" });
}

function deleteOrder(id) {
  const order = state.orders.find((item) => item.id === id);
  if (!order) return;
  const confirmed = window.confirm(`Delete ${order.poNo}?`);
  if (!confirmed) return;
  state.orders = state.orders.filter((item) => item.id !== id);
  persist("Order deleted.");
}

function handleClientCodeSubmit(event) {
  event.preventDefault();
  activeClientCode = normalizeCode(els.clientPortalCode.value);
  localStorage.setItem(CLIENT_CODE_KEY, activeClientCode);
  render();
  showToast(`Showing orders for ${activeClientCode}.`);
}

function handleQuerySubmit(event) {
  event.preventDefault();
  if (!activeClientCode) {
    showToast("Please enter a client code first.");
    return;
  }

  const clientName = findClientName(activeClientCode) || "Client";
  state.queries.unshift({
    id: uid("query"),
    clientCode: activeClientCode,
    clientName,
    poNo: els.queryPoNo.value.trim(),
    subject: els.querySubject.value.trim(),
    message: els.queryMessage.value.trim(),
    status: "Open",
    reply: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  els.queryForm.reset();
  persist("Query sent to admin.");
}

function replyToQuery(id) {
  const query = state.queries.find((item) => item.id === id);
  if (!query) return;
  const input = document.querySelector(`[data-reply-input="${CSS.escape(id)}"]`);
  query.reply = input ? input.value.trim() : query.reply;
  query.status = query.reply ? "Answered" : query.status;
  query.updatedAt = new Date().toISOString();
  persist("Query reply updated.");
}

function toggleQuery(id) {
  const query = state.queries.find((item) => item.id === id);
  if (!query) return;
  query.status = query.status === "Answered" ? "Open" : "Answered";
  query.updatedAt = new Date().toISOString();
  persist("Query status updated.");
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `rv-cotton-mill-orders-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

els.navTabs.forEach((button) => {
  button.addEventListener("click", () => {
    els.navTabs.forEach((tab) => tab.classList.toggle("active", tab === button));
    els.views.forEach((view) => view.classList.toggle("active", view.id === button.dataset.view));
  });
});

els.orderForm.addEventListener("submit", handleOrderSubmit);
els.resetOrderForm.addEventListener("click", resetOrderForm);
els.cancelEditBtn.addEventListener("click", resetOrderForm);
els.orderStatus.addEventListener("change", syncDispatchFields);
els.orderSearch.addEventListener("input", renderOrdersTable);
els.clientCodeForm.addEventListener("submit", handleClientCodeSubmit);
els.queryForm.addEventListener("submit", handleQuerySubmit);
els.pasteImageZone.addEventListener("paste", handleImagePaste);
els.pasteImageZone.addEventListener("click", () => els.pasteImageZone.focus());
els.pasteImageZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    els.pasteImageZone.focus();
  }
});
els.clearPastedImage.addEventListener("click", (event) => {
  event.stopPropagation();
  clearPastedImage();
  els.imageFileName.textContent = els.itemImage.files[0]?.name || "No new image selected";
});
els.importSheetBtn.addEventListener("click", () => importGoogleSheetOrders({ silent: false, force: true }));
els.autoSyncBtn.addEventListener("click", () => {
  autoSyncEnabled = !autoSyncEnabled;
  localStorage.setItem(AUTO_SYNC_KEY, String(autoSyncEnabled));
  startAutoSheetSync();
  showToast(autoSyncEnabled ? "Automatic CSV sync enabled." : "Automatic CSV sync paused.");
});
els.seedDataBtn.addEventListener("click", () => {
  const confirmed = window.confirm("Reload demo data? Current local entries will be replaced.");
  if (!confirmed) return;
  state = createSeedState();
  persist("Demo data reloaded.");
});
els.exportBtn.addEventListener("click", exportData);

els.itemImage.addEventListener("change", () => {
  clearPastedImage();
  els.imageFileName.textContent = els.itemImage.files[0]?.name || "No new image selected";
});

els.ordersTable.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  if (button.dataset.action === "edit-order") {
    editOrder(button.dataset.id);
  }
  if (button.dataset.action === "delete-order") {
    deleteOrder(button.dataset.id);
  }
});

els.adminQueries.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  if (button.dataset.action === "reply-query") {
    replyToQuery(button.dataset.id);
  }
  if (button.dataset.action === "toggle-query") {
    toggleQuery(button.dataset.id);
  }
});

els.queryFilterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    queryFilter = button.dataset.queryFilter;
    els.queryFilterButtons.forEach((item) => item.classList.toggle("active", item === button));
    renderQueries();
  });
});

window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY) {
    syncFromStorage();
  }
  if (event.key === CLIENT_CODE_KEY) {
    activeClientCode = normalizeCode(event.newValue);
    render();
  }
});

if (channel) {
  channel.addEventListener("message", (event) => {
    if (event.data?.type !== "state") return;
    if (event.data.state?.updatedAt === state.updatedAt) return;
    state = event.data.state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render();
    flashLive();
  });
}

resetOrderForm();
render();
startAutoSheetSync();

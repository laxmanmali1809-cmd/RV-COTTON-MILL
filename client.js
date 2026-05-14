const CLIENT_CODE_KEY = "rvCottonMillPublicClientCode";
const REFRESH_MS = 60000;

const els = {
  form: document.getElementById("clientLookupForm"),
  code: document.getElementById("clientLookupCode"),
  chip: document.getElementById("clientCodeChip"),
  lastUpdated: document.getElementById("clientLastUpdated"),
  summary: document.getElementById("clientPublicSummary"),
  orders: document.getElementById("clientPublicOrders"),
  status: document.getElementById("clientSyncStatus"),
  refresh: document.getElementById("clientRefreshBtn"),
  queryForm: document.getElementById("clientQueryDraftForm"),
  queryPo: document.getElementById("clientQueryPo"),
  querySubject: document.getElementById("clientQuerySubject"),
  queryMessage: document.getElementById("clientQueryMessage"),
  toast: document.getElementById("clientToast")
};

let activeClientCode = "";
let refreshTimer;
let toastTimer;

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

function showToast(message) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("show");
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2600);
}

function statusPill(status) {
  const className = status === "Dispatched" ? "dispatched" : "undispatched";
  return `<span class="status ${className}">${escapeHtml(status)}</span>`;
}

function detail(label, value) {
  return `
    <div class="detail">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
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

function renderOrders(payload) {
  const orders = payload.orders || [];
  const dispatched = orders.filter((order) => order.status === "Dispatched").length;
  const pending = orders.length - dispatched;
  const clientName = orders[0]?.clientName || activeClientCode || "Client";

  els.chip.textContent = activeClientCode || "-";
  els.lastUpdated.textContent = `Updated ${formatDateTime(payload.updatedAt)}`;
  els.status.textContent = `${orders.length} orders loaded from the latest CSV sync.`;

  els.summary.innerHTML = [
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

  els.orders.innerHTML = orders.length
    ? orders.map(orderCard).join("")
    : `<div class="empty-state">No orders found for ${escapeHtml(activeClientCode || "this code")}.</div>`;
}

async function loadClientOrders({ force = false } = {}) {
  if (!activeClientCode) return;

  els.status.textContent = "Checking latest CSV...";
  const response = await fetch(`/api/orders?clientCode=${encodeURIComponent(activeClientCode)}${force ? "&force=true" : ""}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    els.status.textContent = "Could not load orders. Please retry.";
    showToast("Order refresh failed.");
    return;
  }

  renderOrders(await response.json());
}

function startRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => loadClientOrders(), REFRESH_MS);
}

els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  activeClientCode = normalizeCode(els.code.value);
  localStorage.setItem(CLIENT_CODE_KEY, activeClientCode);
  loadClientOrders({ force: true });
  startRefresh();
});

els.refresh.addEventListener("click", () => loadClientOrders({ force: true }));

els.queryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = [
    `Client code: ${activeClientCode || "-"}`,
    `PO no.: ${els.queryPo.value || "-"}`,
    `Subject: ${els.querySubject.value}`,
    "",
    els.queryMessage.value
  ].join("\n");

  try {
    await navigator.clipboard.writeText(text);
    showToast("Query copied. Send it to RV COTTON MILL.");
    els.queryForm.reset();
  } catch {
    showToast("Copy failed. Select and copy the message manually.");
  }
});

const urlCode = new URLSearchParams(window.location.search).get("code");
activeClientCode = normalizeCode(urlCode || localStorage.getItem(CLIENT_CODE_KEY) || "");
els.code.value = activeClientCode;

if (activeClientCode) {
  loadClientOrders({ force: true });
  startRefresh();
}

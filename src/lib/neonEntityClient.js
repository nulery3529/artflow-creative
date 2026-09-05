const ENTITY_OPS = {
  ArtPiece: "art-pieces",
  Business: "businesses",
  Expense: "expenses",
  InventoryCost: "inventory",
  MileageLog: "mileage",
  Order: "orders",
  ScheduleEvent: "schedule",
};

function opFor(entityName) {
  const op = ENTITY_OPS[entityName];
  if (!op) throw new Error(`Unsupported Art Flow entity: ${entityName}`);
  return op;
}

async function request(entityName, options = {}) {
  const op = opFor(entityName);
  const response = await fetch(`/api/neon-data?op=${encodeURIComponent(op)}`, {
    credentials: "include",
    cache: "no-store",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    const returnTo = window.location.pathname + window.location.search;
    window.location.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    throw new Error("Session expired");
  }
  if (!response.ok) throw new Error(data.error || `Art Flow data request failed (${response.status})`);
  return data;
}

export const neonEntities = {
  async list(entityName) {
    const data = await request(entityName);
    if (entityName === "Expense") return data.expenses || [];
    if (entityName === "InventoryCost") return data.inventory || [];
    if (entityName === "Order") return data.orders || [];
    return data.records || [];
  },

  async create(entityName, payload) {
    const data = await request(entityName, {
      method: "POST",
      body: JSON.stringify({ action: "create", ...payload }),
    });
    window.dispatchEvent(new CustomEvent("artflow:data-synced"));
    return data.item;
  },

  async update(entityName, id, payload) {
    const data = await request(entityName, {
      method: "POST",
      body: JSON.stringify({ action: "update", id, ...payload }),
    });
    window.dispatchEvent(new CustomEvent("artflow:data-synced"));
    return data.item;
  },

  async delete(entityName, id) {
    const data = await request(entityName, {
      method: "POST",
      body: JSON.stringify({ action: "delete", id }),
    });
    window.dispatchEvent(new CustomEvent("artflow:data-synced"));
    return data.item;
  },
};

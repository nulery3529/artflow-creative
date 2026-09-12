import { useEffect, useState } from "react";

const CART_TOKEN_KEY = "artflow_store_cart_token";
const CUSTOMER_TOKEN_KEY = "artflow_store_customer_token";

export const STORE_SYNC_EVENT = "artflow:store-updated";
export const CUSTOMER_SYNC_EVENT = "artflow:store-customer";

// The cart token is generated on the buyer's device (web or iOS) and sent with
// every storefront request, so a cart survives across visits and devices.
export function getCartToken() {
  let token = "";
  try { token = localStorage.getItem(CART_TOKEN_KEY) || ""; } catch { token = ""; }
  if (!token) {
    token = (crypto.randomUUID && crypto.randomUUID()) || `cart-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try { localStorage.setItem(CART_TOKEN_KEY, token); } catch { /* private mode */ }
  }
  return token;
}

export function getCustomerToken() {
  try { return localStorage.getItem(CUSTOMER_TOKEN_KEY) || ""; } catch { return ""; }
}

export function isStoreLoggedIn() {
  return Boolean(getCustomerToken());
}

export function setCustomerToken(token) {
  try {
    if (token) localStorage.setItem(CUSTOMER_TOKEN_KEY, token);
    else localStorage.removeItem(CUSTOMER_TOKEN_KEY);
  } catch { /* private mode */ }
  window.dispatchEvent(new Event(CUSTOMER_SYNC_EVENT));
  window.dispatchEvent(new Event(STORE_SYNC_EVENT));
}

export function notifyStoreSync() {
  window.dispatchEvent(new Event(STORE_SYNC_EVENT));
}

async function storeFetch(path, { method = "GET", body } = {}) {
  const headers = { "x-cart-token": getCartToken() };
  const customerToken = getCustomerToken();
  if (customerToken) headers["x-customer-token"] = customerToken;
  if (body) headers["Content-Type"] = "application/json";
  const response = await fetch(path, {
    method,
    headers,
    cache: "no-store",
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

export const storeApi = {
  catalog: () => storeFetch("/api/store?resource=catalog"),
  product: (id) => storeFetch(`/api/store?resource=product&id=${encodeURIComponent(id)}`),
  cart: () => storeFetch("/api/store-cart"),
  cartAction: (action, extra = {}) => storeFetch("/api/store-cart", { method: "POST", body: { action, ...extra } }),
  addresses: () => storeFetch("/api/store-checkout"),
  saveAddress: (address) => storeFetch("/api/store-checkout", { method: "POST", body: { action: "save_address", address } }),
  deleteAddress: (id) => storeFetch("/api/store-checkout", { method: "POST", body: { action: "delete_address", id } }),
  placeOrder: (payload) => storeFetch("/api/store-checkout", { method: "POST", body: { action: "place_order", ...payload } }),
  orders: () => storeFetch("/api/store-orders"),
  login: (payload) => storeFetch("/api/store-auth", { method: "POST", body: { action: "login", ...payload } }),
  register: (payload) => storeFetch("/api/store-auth", { method: "POST", body: { action: "register", ...payload } }),
  logout: () => storeFetch("/api/store-auth", { method: "POST", body: { action: "logout" } }),
};

async function adminFetch(path, { method = "GET", body } = {}) {
  const response = await fetch(path, {
    method,
    credentials: "include",
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

export const storeAdmin = {
  products: () => adminFetch("/api/store-admin?resource=products"),
  categories: () => adminFetch("/api/store-admin?resource=categories"),
  orders: () => adminFetch("/api/store-admin?resource=orders"),
  order: (id) => adminFetch(`/api/store-admin?resource=orders&id=${encodeURIComponent(id)}`),
  customers: () => adminFetch("/api/store-admin?resource=customers"),
  productSave: (product) => adminFetch("/api/store-admin", { method: "POST", body: { action: "product_save", ...product } }),
  productDelete: (id) => adminFetch("/api/store-admin", { method: "POST", body: { action: "product_delete", id } }),
  categorySave: (category) => adminFetch("/api/store-admin", { method: "POST", body: { action: "category_save", ...category } }),
  categoryDelete: (id) => adminFetch("/api/store-admin", { method: "POST", body: { action: "category_delete", id } }),
  orderUpdate: (id, status) => adminFetch("/api/store-admin", { method: "POST", body: { action: "order_update", id, status } }),
};

export function formatStoreMoney(cents, currency = "USD") {
  return ((Number(cents) || 0) / 100).toLocaleString("en-US", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function priceInputToCents(value) {
  const n = Number(String(value ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function centsToPriceInput(cents) {
  return (((Number(cents) || 0) / 100).toFixed(2)).toString();
}

export function useStoreCart() {
  const [cart, setCart] = useState(null);
  const [wishlist, setWishlist] = useState([]);

  const refresh = async () => {
    try {
      const data = await storeApi.cart();
      setCart(data.cart);
      setWishlist(data.wishlist);
    } catch {
      setCart([]);
      setWishlist([]);
    }
  };

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener(STORE_SYNC_EVENT, handler);
    return () => window.removeEventListener(STORE_SYNC_EVENT, handler);
  }, []);

  const cartCount = (cart || []).reduce((sum, item) => sum + (item.quantity || 0), 0);
  return { cart, wishlist, cartCount, refresh };
}

export function useStoreCustomer() {
  const [customer, setCustomer] = useState(undefined);

  const refresh = async () => {
    if (!isStoreLoggedIn()) {
      setCustomer(null);
      return;
    }
    try {
      const data = await storeFetch("/api/store-auth");
      setCustomer(data.customer || null);
      if (!data.customer) setCustomerToken("");
    } catch {
      setCustomer(null);
    }
  };

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener(CUSTOMER_SYNC_EVENT, handler);
    return () => window.removeEventListener(CUSTOMER_SYNC_EVENT, handler);
  }, []);

  return { customer, refresh };
}
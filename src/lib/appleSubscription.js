const SUBSCRIPTION_EVENT = "artflow:apple-subscription";

const nativeBridge = () => {
  if (typeof window === "undefined") return null;
  return window.webkit?.messageHandlers?.artflowIAP || null;
};

export function isAppleApp() {
  if (typeof window === "undefined") return false;
  return Boolean(
    nativeBridge()
    || window.ArtFlowNative?.platform === "ios"
    || document.documentElement?.dataset?.artflowPlatform === "ios"
  );
}

export function postApplePurchaseMessage(action, payload = {}) {
  const bridge = nativeBridge();
  if (!bridge?.postMessage) return false;
  bridge.postMessage({ action, ...payload });
  return true;
}

export function requestAppleSubscriptionState() {
  return postApplePurchaseMessage("getSubscriptionState");
}

export function requestAppleProducts() {
  return postApplePurchaseMessage("getProducts");
}

export function purchaseAppleProduct(productId) {
  if (!productId) return false;
  return postApplePurchaseMessage("purchase", { productId });
}

export function restoreApplePurchases() {
  return postApplePurchaseMessage("restorePurchases");
}

export function manageAppleSubscriptions() {
  return postApplePurchaseMessage("manageSubscriptions");
}

export function subscribeToAppleSubscription(callback) {
  if (typeof window === "undefined") return () => {};

  const onEvent = (event) => callback(event.detail || {});
  window.addEventListener(SUBSCRIPTION_EVENT, onEvent);

  const previous = window.__artflowIAPReceive;
  window.__artflowIAPReceive = (payload) => {
    let detail = payload;
    if (typeof payload === "string") {
      try {
        detail = JSON.parse(payload);
      } catch {
        detail = { type: "error", message: payload };
      }
    }
    window.dispatchEvent(new CustomEvent(SUBSCRIPTION_EVENT, { detail: detail || {} }));
  };

  return () => {
    window.removeEventListener(SUBSCRIPTION_EVENT, onEvent);
    if (previous) window.__artflowIAPReceive = previous;
    else delete window.__artflowIAPReceive;
  };
}

export function normalizedAppleProducts(products = []) {
  return (Array.isArray(products) ? products : [])
    .map((product) => ({
      id: String(product?.id || product?.productId || "").trim(),
      displayName: String(product?.displayName || product?.name || "").trim(),
      displayPrice: String(product?.displayPrice || product?.price || "").trim(),
      period: String(product?.period || product?.subscriptionPeriod || "").trim().toLowerCase(),
      introPeriod: String(product?.introPeriod || "").trim().toLowerCase(),
      introPaymentMode: String(product?.introPaymentMode || "").trim(),
    }))
    .filter((product) => product.id);
}

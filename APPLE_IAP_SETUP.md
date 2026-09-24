# Apple App Store subscription setup

Art Flow Creative contains an iOS-only subscription gate and paywall. The web app remains unchanged and unlocked.

## Native iOS bridge contract

The iOS wrapper must expose a WKWebView message handler named `artflowIAP`.

JavaScript sends:
- `{ action: "getSubscriptionState" }`
- `{ action: "getProducts" }`
- `{ action: "purchase", productId: "..." }`
- `{ action: "restorePurchases" }`

The native app returns updates by evaluating:
`window.__artflowIAPReceive(<JSON payload>)`

Supported payloads:
- `{ type: "products", products: [{ id, displayName, displayPrice, period }] }`
- `{ type: "entitlement", entitled: true|false, products?: [...] }`
- `{ type: "purchase-started" }`
- `{ type: "purchase-complete", entitled: true }`
- `{ type: "purchase-cancelled" }`
- `{ type: "restore-started" }`
- `{ type: "restore-complete", entitled: true|false }`
- `{ type: "error", message: "..." }`

## StoreKit requirements

1. Create auto-renewable subscription products in App Store Connect.
2. Put monthly/yearly variants of the same access in one subscription group.
3. Load localized prices from StoreKit rather than hard-coding prices in the web bundle.
4. Determine access with StoreKit 2 current entitlements.
5. Observe StoreKit transaction updates while the app is running.
6. Implement Restore Purchases.
7. For server-synced entitlements, configure App Store Server Notifications V2 and verify transactions server-side.

The paywall already includes Terms, Privacy, support, auto-renewal disclosure, and Restore Purchases.

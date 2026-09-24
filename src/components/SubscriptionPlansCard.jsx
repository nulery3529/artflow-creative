import React, { useEffect, useMemo, useState } from "react";
import { Check, CreditCard, Loader2, RefreshCw } from "lucide-react";
import {
  isAppleApp,
  manageAppleSubscriptions,
  normalizedAppleProducts,
  purchaseAppleProduct,
  requestAppleSubscriptionState,
  restoreApplePurchases,
  subscribeToAppleSubscription,
} from "@/lib/appleSubscription";

const LAUNCH_PLANS = [
  {
    id: "com.artflowcreative.app.monthly",
    key: "monthly",
    name: "Monthly",
    price: "$9.99",
    suffix: "/month",
  },
  {
    id: "com.artflowcreative.app.yearly",
    key: "yearly",
    name: "Yearly",
    price: "$79.99",
    suffix: "/year",
    badge: "Save about 33%",
  },
];

function planKind(product = {}) {
  const haystack = `${product.id || ""} ${product.period || ""} ${product.displayName || ""}`.toLowerCase();
  return /year|annual/.test(haystack) ? "yearly" : "monthly";
}

export default function SubscriptionPlansCard() {
  const appleApp = isAppleApp();
  const [products, setProducts] = useState([]);
  const [entitled, setEntitled] = useState(false);
  const [loading, setLoading] = useState(appleApp);
  const [busy, setBusy] = useState(false);
  const [pendingId, setPendingId] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!appleApp) return undefined;

    const unsubscribe = subscribeToAppleSubscription((event = {}) => {
      const type = String(event.type || event.action || "").toLowerCase();

      if (type === "products") {
        setProducts(event.products || []);
        setLoading(false);
        return;
      }

      if (type === "purchase-started" || type === "restore-started" || type === "loading") {
        setBusy(true);
        setMessage("");
        return;
      }

      if (
        type === "entitlement"
        || type === "purchase-complete"
        || type === "purchase-completed"
        || type === "restore-complete"
        || type === "restore-completed"
      ) {
        const active = Boolean(event.entitled ?? event.active ?? event.isActive);
        setEntitled(active);
        setBusy(false);
        setLoading(false);
        setPendingId("");
        setMessage(active ? "Your Apple subscription is active." : "No active Apple subscription was found.");
        if (event.products) setProducts(event.products);
        return;
      }

      if (type === "purchase-cancelled" || type === "cancelled") {
        setBusy(false);
        setPendingId("");
        return;
      }

      if (type === "error") {
        setBusy(false);
        setPendingId("");
        setLoading(false);
        setMessage(String(event.message || "Apple could not complete that request."));
      }
    });

    if (!requestAppleSubscriptionState()) {
      setLoading(false);
      setMessage("Apple subscription services are not available in this build yet.");
    }

    return unsubscribe;
  }, [appleApp]);

  const liveByKind = useMemo(() => {
    const normalized = normalizedAppleProducts(products);
    return Object.fromEntries(normalized.map((product) => [planKind(product), product]));
  }, [products]);

  const choosePlan = (id) => {
    if (!appleApp || entitled || busy) return;
    setPendingId(id);
    setMessage("");
    if (!purchaseAppleProduct(id)) {
      setPendingId("");
      setMessage("Apple subscription services are unavailable right now.");
    }
  };

  const restore = () => {
    if (!appleApp || busy) return;
    setMessage("");
    if (!restoreApplePurchases()) {
      setMessage("Apple could not start Restore Purchases.");
    }
  };

  const manage = () => {
    if (!manageAppleSubscriptions()) {
      window.location.assign("https://apps.apple.com/account/subscriptions");
    }
  };

  return (
    <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))]">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="font-heading text-lg flex items-center gap-2">
            <CreditCard className="w-5 h-5" /> Plans &amp; Billing
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Full Art Flow Creative access with either billing option.
          </p>
        </div>
        {appleApp && entitled ? (
          <span className="shrink-0 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            Active
          </span>
        ) : null}
      </div>

      <div className="space-y-3">
        {LAUNCH_PLANS.map((fallback) => {
          const live = liveByKind[fallback.key];
          const displayPrice = live?.displayPrice || fallback.price;
          const displayName = live?.displayName || fallback.name;
          const hasStoreProduct = Boolean(live?.id);
          const productId = live?.id || fallback.id;
          const trialText = live?.introPaymentMode === "freeTrial" && live?.introPeriod
            ? `${live.introPeriod} free trial for eligible subscribers`
            : "7-day free trial for eligible new subscribers";

          return (
            <div
              key={fallback.id}
              className="rounded-2xl border border-[hsl(var(--border))] bg-background p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold">{displayName}</p>
                    {fallback.badge ? (
                      <span className="rounded-full bg-[hsl(var(--primary))]/10 px-2 py-0.5 text-[11px] font-semibold text-[hsl(var(--primary))]">
                        {fallback.badge}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{trialText}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-heading text-xl">{displayPrice}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {live ? (/year|annual/.test(live.period) ? "/year" : "/month") : fallback.suffix}
                  </p>
                </div>
              </div>

              <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                {[
                  "Automatic marketplace order tracking",
                  "Expenses, inventory, mileage, reports & planning",
                  "Backup and export tools",
                ].map((benefit) => (
                  <div key={benefit} className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 mt-0.5 text-[hsl(var(--primary))] shrink-0" />
                    <span>{benefit}</span>
                  </div>
                ))}
              </div>

              {appleApp && !entitled ? (
                <button
                  type="button"
                  disabled={busy || loading || !hasStoreProduct}
                  onClick={() => choosePlan(productId)}
                  className="mt-4 w-full h-11 rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {pendingId === productId && busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {hasStoreProduct ? `Choose ${fallback.name}` : "Waiting for App Store product"}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      {!appleApp ? (
        <div className="mt-4 rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">
          These are the Art Flow launch prices. Apple subscriptions are purchased and managed inside the Art Flow Creative iPhone app.
        </div>
      ) : null}

      {appleApp && entitled ? (
        <button
          type="button"
          onClick={manage}
          className="mt-4 w-full h-11 rounded-xl bg-muted text-foreground font-semibold"
        >
          Manage Apple Subscription
        </button>
      ) : null}

      {appleApp ? (
        <button
          type="button"
          onClick={restore}
          disabled={busy}
          className="mt-3 w-full h-11 rounded-xl border border-[hsl(var(--border))] bg-background text-foreground font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <RefreshCw className="w-4 h-4" />
          Restore Purchases
        </button>
      ) : null}

      {message ? (
        <p className="mt-3 text-center text-xs text-muted-foreground">{message}</p>
      ) : null}

      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
        Apple subscriptions auto-renew until canceled. Introductory offer eligibility is determined by Apple. Terms and Privacy are available from the app.
      </p>
    </section>
  );
}

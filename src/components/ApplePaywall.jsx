import React, { useEffect, useMemo, useState } from "react";
import { Check, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import Logo from "@/components/Logo";
import {
  normalizedAppleProducts,
  purchaseAppleProduct,
  requestAppleProducts,
  restoreApplePurchases,
} from "@/lib/appleSubscription";

const benefits = [
  "Automatic marketplace order tracking",
  "Business expense and receipt tracking",
  "Inventory, products, and sold-item history",
  "Reports, taxes, mileage, and business planning",
  "Backup and export tools",
];

const periodLabel = (period) => {
  if (/year|annual/.test(period)) return "Yearly";
  if (/month/.test(period)) return "Monthly";
  return "Subscription";
};

export default function ApplePaywall({ products = [], busy = false, error = "" }) {
  const [pendingId, setPendingId] = useState("");
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    requestAppleProducts();
  }, []);

  const plans = useMemo(() => {
    const normalized = normalizedAppleProducts(products);
    return normalized.sort((a, b) => {
      const aYear = /year|annual/.test(a.period) ? 1 : 0;
      const bYear = /year|annual/.test(b.period) ? 1 : 0;
      return aYear - bYear;
    });
  }, [products]);

  const buy = (productId) => {
    if (!productId) return;
    setPendingId(productId);
    if (!purchaseAppleProduct(productId)) setPendingId("");
  };

  const restore = () => {
    setRestoring(true);
    if (!restoreApplePurchases()) setRestoring(false);
  };

  useEffect(() => {
    if (!busy) {
      setPendingId("");
      setRestoring(false);
    }
  }, [busy]);

  return (
    <div className="min-h-screen bg-background text-foreground px-5 py-8 flex items-center justify-center">
      <main className="w-full max-w-md">
        <div className="text-center mb-7">
          <div className="flex justify-center mb-4"><Logo size={58} /></div>
          <h1 className="font-heading text-3xl">Art Flow Creative</h1>
          <p className="text-muted-foreground mt-2">
            Unlock the complete business toolkit for your art business.
          </p>
        </div>

        <section className="bg-card rounded-[2rem] border border-[hsl(var(--border))] p-5 shadow-sm">
          <div className="space-y-3 mb-6">
            {benefits.map((benefit) => (
              <div key={benefit} className="flex gap-3 items-start">
                <span className="mt-0.5 w-6 h-6 rounded-full bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] flex items-center justify-center shrink-0">
                  <Check className="w-4 h-4" />
                </span>
                <span className="text-sm">{benefit}</span>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            {plans.length ? plans.map((plan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => buy(plan.id)}
                disabled={busy}
                className="w-full min-h-16 px-4 rounded-2xl border border-[hsl(var(--border))] bg-background flex items-center justify-between text-left disabled:opacity-60 active:scale-[0.99] transition-transform"
              >
                <div>
                  <div className="font-semibold">{plan.displayName || periodLabel(plan.period)}</div>
                  <div className="text-xs text-muted-foreground">
                    {plan.introPaymentMode === "freeTrial" && plan.introPeriod
                      ? `${plan.introPeriod} free trial, then renews ${/year|annual/.test(plan.period) ? "yearly" : /month/.test(plan.period) ? "monthly" : "automatically"} until canceled`
                      : `Renews ${/year|annual/.test(plan.period) ? "yearly" : /month/.test(plan.period) ? "monthly" : "automatically"} until canceled`}
                  </div>
                </div>
                <div className="font-heading text-lg flex items-center gap-2">
                  {pendingId === plan.id && busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {plan.displayPrice || "Apple price"}
                </div>
              </button>
            )) : (
              <div className="rounded-2xl bg-muted px-4 py-5 text-center text-sm text-muted-foreground">
                Loading subscription options from the App Store…
              </div>
            )}
          </div>

          {error ? (
            <p className="mt-4 text-sm text-center text-[hsl(var(--destructive))]">{error}</p>
          ) : null}

          <button
            type="button"
            onClick={restore}
            disabled={busy}
            className="w-full h-12 mt-4 rounded-2xl bg-muted text-foreground font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {restoring && busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Restore Purchases
          </button>

          <div className="mt-5 flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
            <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
            <p>
              Payment is charged to your Apple Account. Subscriptions automatically renew unless canceled according to Apple’s subscription settings.
            </p>
          </div>
        </section>

        <div className="mt-5 text-center text-xs text-muted-foreground">
          <a className="underline" href="/terms-of-service">Terms of Service</a>
          <span className="mx-2">·</span>
          <a className="underline" href="/privacy-policy">Privacy Policy</a>
          <div className="mt-2">
            Need help? <a className="underline" href="mailto:help@artflowcreative.com">help@artflowcreative.com</a>
          </div>
        </div>
      </main>
    </div>
  );
}

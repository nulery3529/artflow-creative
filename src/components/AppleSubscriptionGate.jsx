import React, { useEffect, useState } from "react";
import ApplePaywall from "@/components/ApplePaywall";
import {
  isAppleApp,
  requestAppleSubscriptionState,
  subscribeToAppleSubscription,
} from "@/lib/appleSubscription";

export default function AppleSubscriptionGate({ children }) {
  const appleApp = isAppleApp();
  const [state, setState] = useState(() => ({
    loading: appleApp,
    entitled: !appleApp,
    products: [],
    busy: false,
    error: "",
  }));

  useEffect(() => {
    if (!appleApp) return undefined;

    const unsubscribe = subscribeToAppleSubscription((message = {}) => {
      const type = String(message.type || message.action || "").toLowerCase();

      if (type === "products") {
        setState((current) => ({ ...current, products: message.products || [], loading: false }));
        return;
      }

      if (type === "purchase-started" || type === "restore-started" || type === "loading") {
        setState((current) => ({ ...current, busy: true, error: "" }));
        return;
      }

      if (
        type === "entitlement"
        || type === "purchase-complete"
        || type === "purchase-completed"
        || type === "restore-complete"
        || type === "restore-completed"
      ) {
        const entitled = Boolean(message.entitled ?? message.active ?? message.isActive);
        setState((current) => ({
          ...current,
          entitled,
          loading: false,
          busy: false,
          error: entitled ? "" : current.error,
          products: message.products || current.products,
        }));
        return;
      }

      if (type === "purchase-cancelled" || type === "cancelled") {
        setState((current) => ({ ...current, busy: false, loading: false }));
        return;
      }

      if (type === "error") {
        setState((current) => ({
          ...current,
          busy: false,
          loading: false,
          error: String(message.message || "Apple could not complete that request. Please try again."),
        }));
      }
    });

    const sent = requestAppleSubscriptionState();
    if (!sent) {
      setState({
        loading: false,
        entitled: false,
        products: [],
        busy: false,
        error: "Apple purchase services are unavailable in this build.",
      });
    }

    return unsubscribe;
  }, [appleApp]);

  if (!appleApp) return children;

  const path = typeof window !== "undefined" ? window.location.pathname.replace(/\/+$/, "") || "/" : "/";
  if (path === "/account") return children;

  if (state.loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-9 h-9 rounded-full border-4 border-[hsl(var(--border))] border-t-[hsl(var(--primary))] animate-spin" />
      </div>
    );
  }

  if (!state.entitled) {
    return <ApplePaywall products={state.products} busy={state.busy} error={state.error} />;
  }

  return children;
}

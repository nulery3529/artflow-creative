import React, { useState } from "react";
import { toast } from "sonner";
import { storeApi, setCustomerToken } from "@/lib/storeClient";

// Storefront buyer sign-in / sign-up — separate from seller accounts.
export default function StoreAuthForm({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const data = mode === "login"
        ? await storeApi.login({ email, password })
        : await storeApi.register({ email, password, name });
      setCustomerToken(data.token);
      toast.success(mode === "login" ? "Welcome back" : "Account created");
      onAuthenticated?.(data.customer);
    } catch (error) {
      toast.error(error?.message || "Could not sign in");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-4">
      <div className="bg-card rounded-3xl p-6 border border-[hsl(var(--border))] space-y-4">
        <div>
          <h1 className="font-heading text-2xl">{mode === "login" ? "Sign in to your account" : "Create your account"}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track your orders, save addresses, and keep a wishlist.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {mode === "register" && (
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="form-input mt-1" placeholder="Your name" />
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="form-input mt-1" placeholder="you@example.com" required />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="form-input mt-1" placeholder="At least 8 characters" required minLength={8} />
          </div>
          <button type="submit" disabled={submitting} className="w-full h-12 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold disabled:opacity-50">
            {submitting ? "Just a moment…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => { setMode(mode === "login" ? "register" : "login"); setPassword(""); }}
          className="w-full text-sm text-muted-foreground"
        >
          {mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Your buyer account is separate from marketplace accounts — it only works on this shop.
      </p>
    </div>
  );
}
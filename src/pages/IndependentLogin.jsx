import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, Mail, Lock, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";

export default function IndependentLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const finish = () => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("returnTo") || "/";
    const staleGoogleSetup = requested.includes("setup=gmail") || requested.includes("setup=tracker");
    const next = requested.startsWith("/") && !staleGoogleSetup ? requested : "/";
    window.location.replace(next);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      const enteredEmail = email.trim().toLowerCase();
      const loginEmail = enteredEmail === "natashaulery@gmail.com"
        ? "nulery3529@gmail.com"
        : enteredEmail;
      const response = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({ email: loginEmail, password, rememberMe: true }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.error) {
        throw new Error(data?.message || data?.error?.message || "Email or password is incorrect.");
      }
      finish();
    } catch (err) {
      setError(err?.message || "Could not sign in.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Never let a failed/abandoned Google OAuth attempt hijack Art Flow login.
    // Login is always email/password only; Google can be reconnected later from Account.
    try {
      sessionStorage.removeItem("artflow_connect_gmail");
      sessionStorage.removeItem("artflow_create_tracker_after_google");
    } catch {}

    const params = new URLSearchParams(window.location.search);
    const serverError = params.get("error");
    if (serverError) setError(serverError);
  }, []);

  return (
    <AuthLayout
      icon={LogIn}
      title="Welcome back"
      subtitle="Sign in with your Art Flow Creative email and password"
      footer={
        <>
          New to Art Flow?{" "}
          <Link to="/register" className="text-primary font-medium hover:underline">Create an account</Link>
        </>
      }
    >
      {error && (
        <div className="mb-4 px-4 py-3 rounded-2xl border border-destructive/30 bg-destructive/10 text-destructive text-sm leading-relaxed" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="independent-email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input id="independent-email" name="email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10 h-12" required />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="independent-password">Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input id="independent-password" name="password" type="password" autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10 h-12" required />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 rounded-2xl font-semibold text-base" disabled={loading}>
          {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Signing in…</> : "Sign in"}
        </Button>
        <div className="text-center">
          <Link
            to="/forgot-password"
            className="text-sm font-medium text-[hsl(var(--primary))] hover:underline"
          >
            Forgot your password?
          </Link>
        </div>
      </form>

      <p className="text-center text-xs text-muted-foreground mt-6 leading-relaxed">
        Art Flow login is separate from Google. Connected email accounts are only used for sales and expense syncing.
      </p>
    </AuthLayout>
  );
}
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, Mail, Lock, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import { artflowAuthClient } from "@/lib/artflowAuthClient";
import { safeReturnTo } from "@/lib/authReturnTo";

export default function IndependentLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const finish = () => {
    window.location.replace(safeReturnTo());
  };

  const handleGoogleSignIn = async () => {
    if (loading || googleLoading) return;
    setError("");
    setGoogleLoading(true);
    try {
      const returnTo = safeReturnTo();
      const isLocal = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
      const canonicalOrigin = isLocal ? window.location.origin : "https://artflowcreative.com";
      if (!isLocal && window.location.origin !== canonicalOrigin) {
        window.location.assign(`${canonicalOrigin}/login?returnTo=${encodeURIComponent(returnTo)}`);
        return;
      }
      const result = await artflowAuthClient.signIn.social({
        provider: "google",
        callbackURL: `${canonicalOrigin}${returnTo}`,
        errorCallbackURL: `${canonicalOrigin}/login?error=google_sign_in_failed`,
        disableRedirect: true,
        requestSignUp: false,
        additionalParams: { prompt: "select_account" },
      });
      if (result?.error) throw new Error(result.error.message || "Could not sign in with Google.");
      if (!result?.data?.url) throw new Error("Google sign-in did not open. Please try again.");
      window.location.assign(result.data.url);
    } catch (err) {
      setError(err?.message || "Could not sign in with Google.");
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({ email: email.trim(), password, rememberMe: true }),
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
    // Clear connector-only setup flags before starting a normal Art Flow login.
    try {
      sessionStorage.removeItem("artflow_connect_gmail");
      sessionStorage.removeItem("artflow_create_tracker_after_google");
    } catch {}

    const params = new URLSearchParams(window.location.search);
    const serverError = params.get("error");
    if (serverError) {
      setError(serverError === "google_sign_in_failed"
        ? "Google sign-in did not finish. Please try again."
        : "Could not sign in. Please try again.");
    }
  }, []);

  return (
    <AuthLayout
      icon={LogIn}
      title="Welcome back"
      subtitle="Continue with Google or use your Art Flow Creative email and password"
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

      <Button
        type="button"
        variant="outline"
        className="w-full h-12 rounded-2xl font-semibold text-base bg-background text-foreground"
        onClick={handleGoogleSignIn}
        disabled={loading || googleLoading}
      >
        {googleLoading ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Opening Google…</>
        ) : (
          <><GoogleIcon className="w-5 h-5 mr-2" />Continue with Google</>
        )}
      </Button>

      <div className="flex items-center gap-3 my-5" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

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
        <Button type="submit" className="w-full h-12 rounded-2xl font-semibold text-base" disabled={loading || googleLoading}>
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
        Google sign-in opens your existing Art Flow account. New users can create an email-and-password account below.
      </p>
    </AuthLayout>
  );
}

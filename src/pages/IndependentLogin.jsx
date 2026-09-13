import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, Mail, Lock, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { artflowAuthClient } from "@/lib/artflowAuthClient";

export default function IndependentLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const finish = () => {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("returnTo") || "/";
    window.location.replace(next.startsWith("/") ? next : "/");
  };

  useEffect(() => {
    let active = true;
    (async () => {
      const sessionResult = await artflowAuthClient.getSession().catch(() => null);
      const session = sessionResult?.data || sessionResult;
      if (active && session?.user?.id) finish();
    })();
    return () => { active = false; };
  }, []);

  const handleEmail = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const loginEmail = email.trim().toLowerCase();
      const response = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({
          email: loginEmail,
          password,
          rememberMe: true,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.error) {
        throw new Error(data?.message || data?.error?.message || "Email or password is incorrect.");
      }

      let session = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const sessionResponse = await fetch("/api/auth/get-session", {
          credentials: "include",
          cache: "no-store",
        }).catch(() => null);
        if (sessionResponse?.ok) {
          session = await sessionResponse.json().catch(() => null);
          if (session?.user?.id) break;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (!session?.user?.id) {
        throw new Error("Your sign-in completed, but the session was not saved. Please try again.");
      }

      finish();
    } catch (err) {
      setError(err?.message || "Could not sign in.");
    } finally {
      setLoading(false);
    }
  };

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

      <form onSubmit={handleEmail} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="independent-email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input id="independent-email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10 h-12" required />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="independent-password">Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input id="independent-password" type="password" autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10 h-12" required />
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
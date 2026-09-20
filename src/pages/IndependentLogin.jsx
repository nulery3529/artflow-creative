import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, Mail, Lock, Loader2, KeyRound } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { safeReturnTo } from "@/lib/authReturnTo";

export default function IndependentLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [signInCode, setSignInCode] = useState("");

  const finish = () => {
    window.location.replace(safeReturnTo());
  };

  const loginEmail = () => {
    const enteredEmail = email.trim().toLowerCase();
    return enteredEmail === "natashaulery@gmail.com"
      ? "nulery3529@gmail.com"
      : enteredEmail;
  };

  const handleSendCode = async () => {
    if (loading || codeLoading) return;
    setError("");
    const targetEmail = loginEmail();
    if (!targetEmail) {
      setError("Enter your email address first.");
      return;
    }
    setCodeLoading(true);
    try {
      const response = await fetch("/api/auth/email-otp/send-verification-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({ email: targetEmail, type: "sign-in" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.error) {
        throw new Error(data?.message || data?.error?.message || "Could not send the sign-in code.");
      }
      setCodeSent(true);
      setSignInCode("");
    } catch (err) {
      setError(err?.message || "Could not send the sign-in code.");
    } finally {
      setCodeLoading(false);
    }
  };

  const handleCodeSignIn = async () => {
    if (loading || codeLoading) return;
    setError("");
    const targetEmail = loginEmail();
    const otp = signInCode.trim();
    if (!targetEmail) {
      setError("Enter your email address first.");
      return;
    }
    if (otp.length < 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setCodeLoading(true);
    try {
      const response = await fetch("/api/auth/sign-in/email-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({ email: targetEmail, otp }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.error) {
        throw new Error(data?.message || data?.error?.message || "That sign-in code is invalid or expired.");
      }
      finish();
    } catch (err) {
      setError(err?.message || "Could not sign in with that code.");
    } finally {
      setCodeLoading(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      const targetEmail = loginEmail();
      const response = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({ email: targetEmail, password, rememberMe: true }),
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
    const params = new URLSearchParams(window.location.search);
    const serverError = params.get("error");
    if (serverError) setError("Could not sign in. Please try again.");
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

      <div className="mt-3 space-y-3">
        <Button
          type="button"
          variant="outline"
          className="w-full h-12 rounded-2xl font-semibold text-base bg-background text-foreground"
          onClick={handleSendCode}
          disabled={loading || codeLoading}
        >
          {codeLoading && !codeSent ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending code…</>
          ) : (
            <><Mail className="w-4 h-4 mr-2" />Email me a sign-in code</>
          )}
        </Button>

        {codeSent && (
          <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-3">
            <div className="text-sm font-medium text-foreground">Enter the 6-digit code from your email</div>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                value={signInCode}
                onChange={(e) => setSignInCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="pl-10 h-12 tracking-[0.35em] font-semibold"
                aria-label="Sign-in code"
              />
            </div>
            <Button
              type="button"
              className="w-full h-12 rounded-2xl font-semibold"
              onClick={handleCodeSignIn}
              disabled={codeLoading || signInCode.length < 6}
            >
              {codeLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Signing in…</> : "Sign in with code"}
            </Button>
            <button
              type="button"
              className="w-full text-xs text-muted-foreground hover:text-foreground"
              onClick={handleSendCode}
              disabled={codeLoading}
            >
              Send another code
            </button>
          </div>
        )}
      </div>

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
        Art Flow uses its own email-based sign-in. New users can create an account below.
      </p>
    </AuthLayout>
  );
}

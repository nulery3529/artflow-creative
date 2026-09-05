import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, ArrowLeft, Loader2, LockKeyhole, CheckCircle2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";

export default function ForgotPassword() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const token = params.get("token");
  const tokenError = params.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [error, setError] = useState("");

  const handleRequest = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({
          email: email.trim(),
          redirectTo: `${window.location.origin}/reset-password`,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.error) {
        throw new Error(data?.message || data?.error?.message || "The password reset email service is unavailable right now. Please try again shortly.");
      }
      setSent(true);
    } catch (err) {
      setError(err?.message || "Could not send the password reset email.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (event) => {
    event.preventDefault();
    setError("");

    if (!token) {
      setError("This password reset link is invalid or has expired.");
      return;
    }
    if (password.length < 8) {
      setError("Your new password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({ newPassword: password, token }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.error) {
        throw new Error(data?.message || data?.error?.message || "Could not reset your password.");
      }
      setResetDone(true);
    } catch (err) {
      setError(err?.message || "Could not reset your password. Please request a new link.");
    } finally {
      setLoading(false);
    }
  };

  const invalidToken = !token && Boolean(tokenError);

  if (token || tokenError || resetDone) {
    return (
      <AuthLayout
        icon={resetDone ? CheckCircle2 : LockKeyhole}
        title={resetDone ? "Password updated" : "Choose a new password"}
        subtitle={resetDone ? "Your Art Flow Creative password has been changed" : "Enter a new password for your account"}
        footer={
          <Link to="/login" className="text-primary font-medium hover:underline">
            <ArrowLeft className="w-3 h-3 inline mr-1" />Back to log in
          </Link>
        }
      >
        {resetDone ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-foreground">You can now sign in with your new password.</p>
            <Button asChild className="w-full h-12 font-medium">
              <Link to="/login">Log in</Link>
            </Button>
          </div>
        ) : invalidToken ? (
          <div className="space-y-4 text-center">
            <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              This password reset link is invalid or has expired.
            </div>
            <Button asChild variant="outline" className="w-full h-12">
              <Link to="/forgot-password">Request a new reset link</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={handleReset} className="space-y-4">
            {error && <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                className="h-12"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
                className="h-12"
                required
              />
            </div>
            <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Updating…</> : "Update password"}
            </Button>
          </form>
        )}
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={Mail}
      title="Reset password"
      subtitle="We'll email you a secure link to choose a new password"
      footer={
        <Link to="/login" className="text-primary font-medium hover:underline">
          <ArrowLeft className="w-3 h-3 inline mr-1" />Back to log in
        </Link>
      }
    >
      {error && <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}

      {sent ? (
        <div className="space-y-4 text-center">
          <p className="text-sm text-foreground">
            If an Art Flow account exists with that email, a password reset link is on its way.
          </p>
          <p className="text-xs text-muted-foreground">Check your inbox and spam folder. The link is time-limited.</p>
          <Button variant="outline" className="w-full h-12" onClick={() => setSent(false)}>
            Try another email
          </Button>
        </div>
      ) : (
        <form onSubmit={handleRequest} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reset-email">Email address</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <Input
                id="reset-email"
                type="email"
                autoComplete="email"
                autoFocus
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 h-12"
                required
              />
            </div>
          </div>
          <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
            {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending…</> : "Send reset link"}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, LockKeyhole, CheckCircle2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { artflowAuthClient } from "@/lib/artflowAuthClient";

export default function ResetPassword() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const token = params.get("token");
  const tokenError = params.get("error");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
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
      const { error: resetError } = await artflowAuthClient.resetPassword({
        newPassword: password,
        token,
      });
      if (resetError) {
        throw new Error(resetError.message || "Could not reset your password.");
      }
      setResetDone(true);
    } catch (err) {
      setError(err?.message || "Could not reset your password. Please request a new link.");
    } finally {
      setLoading(false);
    }
  };

  const invalidToken = !token || Boolean(tokenError);

  return (
    <AuthLayout
      icon={resetDone ? CheckCircle2 : LockKeyhole}
      title={resetDone ? "Password updated" : "Choose a new password"}
      subtitle={
        resetDone
          ? "Your Art Flow Creative password has been changed"
          : "Enter a new password for your account"
      }
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
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
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
              onChange={(event) => setConfirmPassword(event.target.value)}
              minLength={8}
              className="h-12"
              required
            />
          </div>
          <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />Updating…
              </>
            ) : (
              "Update password"
            )}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

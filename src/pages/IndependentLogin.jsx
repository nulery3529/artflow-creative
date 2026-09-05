import React, { useState } from "react";
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

  const handleEmail = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const enteredEmail = email.trim();
      const loginEmail = enteredEmail.toLowerCase() === "natashaulery@gmail.com"
        ? "nulery3529@gmail.com"
        : enteredEmail;
      const { error: signInError } = await artflowAuthClient.signIn.email({
        email: loginEmail,
        password,
        rememberMe: true,
      });
      if (signInError) throw new Error(signInError.message || "Email or password is incorrect.");

      // Authentication success should not be blocked by a temporary data refresh.
      // Confirm the Better Auth session exists, then let the app's normal Neon
      // workspace recovery load the user's data after navigation.
      const sessionResult = await artflowAuthClient.getSession().catch(() => null);
      const session = sessionResult?.data || sessionResult;
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
      {error && <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}

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
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Signing in…</> : "Log in"}
        </Button>
        <Link
          to="/forgot-password"
          className="flex w-full h-12 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-semibold text-primary hover:bg-accent hover:text-accent-foreground"
        >
          Forgot your password? Reset it here
        </Link>
      </form>

      <p className="text-center text-xs text-muted-foreground mt-5">
        Art Flow login is separate from Google. Connected email accounts are only used for sales and expense syncing.
      </p>
    </AuthLayout>
  );
}

import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth/_auth.mjs";

function safeReturnPath(value = "/") {
  const text = String(value || "/").trim();
  if (!text.startsWith("/") || text.startsWith("//")) return "/";
  return text;
}

function htmlPage({ error = "", returnTo = "/dashboard" } = {}) {
  const appleConfigured = Boolean(
    String(process.env.APPLE_CLIENT_ID || "").trim()
    && String(process.env.APPLE_TEAM_ID || "").trim()
    && String(process.env.APPLE_KEY_ID || "").trim()
    && String(process.env.APPLE_PRIVATE_KEY || "").trim()
  );
  const message = error === "invalid_credentials"
    ? "Email or password is incorrect."
    : error === "apple_sign_in_failed"
      ? "Apple sign-in did not finish. Please try again."
      : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <meta name="theme-color" content="#080809" />
  <title>Log in — Art Flow Creative</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin:0; min-height:100vh; display:grid; place-items:center; padding:24px; background:#080809; color:#f7f2fb; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    .card { width:min(100%,420px); background:#121213; border:1px solid #3a233d; border-radius:24px; padding:28px; box-shadow:0 20px 70px rgba(0,0,0,.35); }
    h1 { margin:0 0 8px; font-size:30px; }
    .sub { margin:0 0 22px; color:#c8c3cb; line-height:1.45; }
    .error { margin:0 0 16px; padding:12px 14px; border-radius:14px; background:#4a1f2e; color:#ffd9e1; border:1px solid #7d334d; }
    label { display:block; margin:14px 0 6px; font-size:14px; font-weight:650; }
    input { width:100%; height:48px; border-radius:14px; border:1px solid #4b324e; background:#171019; color:#fff; padding:0 14px; font-size:16px; outline:none; }
    input:focus { border-color:#e247c5; box-shadow:0 0 0 3px rgba(226,71,197,.18); }
    button,.google { width:100%; height:48px; border:0; border-radius:14px; font-size:16px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; text-decoration:none; }
    button { margin-top:18px; background:#d63bea; color:white; }
    .google { background:#f6f2f8; color:#121213; margin-bottom:10px; }
    .apple { background:#fff; color:#000; margin-bottom:18px; font-size:20px; font-weight:500; }
    .apple img { width:28px; height:28px; margin-right:8px; flex:0 0 auto; }
    .sep { display:flex; align-items:center; gap:12px; color:#9c98a0; font-size:12px; margin:8px 0 2px; }
    .sep:before,.sep:after { content:""; height:1px; background:#3a233d; flex:1; }
    .links { margin-top:18px; text-align:center; font-size:13px; color:#b9b5bc; line-height:1.7; }
    .links a { color:#f06add; }
  </style>
</head>
<body>
  <main class="card">
    <h1>Welcome back</h1>
    <p class="sub">Log in to your Art Flow Creative account.</p>
    ${message ? `<div class="error" role="alert">${message}</div>` : ""}
    ${appleConfigured ? `<a class="google apple" href="/api/auth/apple-login?returnTo=${encodeURIComponent(returnTo)}"><img src="https://appleid.cdn-apple.com/appleid/button/logo?color=white&border=false&size=30&scale=2" alt="" aria-hidden="true" />Continue with Apple</a>` : ""}
    ${appleConfigured ? `<div class="sep">OR</div>` : ""}
    <form action="/api/auth/login-form" method="POST" autocomplete="on">
      <input type="hidden" name="returnTo" value="${returnTo.replace(/"/g, "&quot;")}" />
      <label for="email">Email</label>
      <input id="email" name="email" type="email" autocomplete="email" required />
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required />
      <button type="submit">Sign in</button>
    </form>
    <div class="links">
      New to Art Flow? <a href="/register">Create account</a><br />
      <a href="/forgot-password">Forgot password?</a><br />
      Having trouble? <a href="mailto:help@artflowcreative.com?subject=Art%20Flow%20sign-in%20help">help@artflowcreative.com</a>
    </div>
  </main>
</body>
</html>`;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  const url = new URL(req.url, "http://localhost");
  const returnTo = safeReturnPath(url.searchParams.get("returnTo") || "/dashboard");
  const error = String(url.searchParams.get("error") || "");
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (session?.user) {
      res.statusCode = 303;
      res.setHeader("Location", returnTo);
      return res.end();
    }
  } catch {}

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.end(htmlPage({ error, returnTo }));
}

import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { auth } from "./auth/_auth.mjs";

const nodeHandler = toNodeHandler(auth);

function requestBody(req) {
  if (Buffer.isBuffer(req.body)) {
    const text = req.body.toString("utf8");
    try { return JSON.parse(text); } catch {}
    try { return Object.fromEntries(new URLSearchParams(text)); } catch {}
    return {};
  }
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch {}
    try { return Object.fromEntries(new URLSearchParams(req.body)); } catch {}
  }
  return {};
}

function applyHeaders(res, headers) {
  if (!headers) return;
  const setCookies = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];
  headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") return;
    res.setHeader(key, value);
  });
  if (setCookies.length) {
    res.setHeader("set-cookie", setCookies);
  } else {
    const cookie = headers.get?.("set-cookie");
    if (cookie) res.setHeader("set-cookie", cookie);
  }
}

function errorStatus(error) {
  for (const candidate of [error?.statusCode, error?.status]) {
    const numeric = Number(candidate);
    if (Number.isInteger(numeric) && numeric >= 400 && numeric <= 599) return numeric;
  }

  const named = String(error?.status || error?.body?.code || "").toUpperCase();
  return ({
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    TOO_MANY_REQUESTS: 429,
  })[named] || 500;
}

async function directEmailSignup(req, res) {
  try {
    const result = await auth.api.signUpEmail({
      body: requestBody(req),
      headers: fromNodeHeaders(req.headers),
      returnHeaders: true,
      returnStatus: true,
    });
    applyHeaders(res, result?.headers);
    return res.status(result?.status || 200).json(result?.response ?? {});
  } catch (error) {
    const status = errorStatus(error);
    const body = error?.body && typeof error.body === "object"
      ? error.body
      : { message: error?.message || "Could not create account." };
    if (status >= 500) console.error("Art Flow direct signup failed", error?.stack || error?.message || error);
    return res.status(status).json(body);
  }
}

async function directEmailSignIn(req, res) {
  try {
    const result = await signInEmailWithFallback({
      body: requestBody(req),
      headers: fromNodeHeaders(req.headers),
    });
    applyHeaders(res, result?.headers);
    return res.status(result?.status || 200).json(result?.response ?? {});
  } catch (error) {
    const status = errorStatus(error);
    const body = error?.body && typeof error.body === "object"
      ? error.body
      : { message: error?.message || "Could not sign in." };
    if (status >= 500) console.error("Art Flow direct sign-in failed", error?.stack || error?.message || error);
    return res.status(status).json(body);
  }
}

function safeReturnPath(value = "/") {
  const text = String(value || "/").trim();
  if (!text.startsWith("/") || text.startsWith("//")) return "/";
  return text;
}

function loginEmailCandidates(value = "") {
  const email = String(value || "").trim().toLowerCase();
  if (!email) return [];
  const aliases = {
    "natashaulery@gmail.com": "nulery3529@gmail.com",
  };
  return Array.from(new Set([email, aliases[email]].filter(Boolean)));
}

async function signInEmailWithFallback({ body, headers }) {
  const candidates = loginEmailCandidates(body?.email);
  let lastError = null;
  for (const email of candidates) {
    try {
      return await auth.api.signInEmail({
        body: {
          ...body,
          email,
        },
        headers,
        returnHeaders: true,
        returnStatus: true,
      });
    } catch (error) {
      lastError = error;
      if (errorStatus(error) >= 500) throw error;
    }
  }
  throw lastError || new Error("Invalid email or password");
}

async function directEmailFormSignIn(req, res) {
  const body = requestBody(req);
  const returnTo = safeReturnPath(body.returnTo || "/");
  try {
    const result = await signInEmailWithFallback({
      body: {
        email: String(body.email || ""),
        password: String(body.password || ""),
        rememberMe: true,
      },
      headers: fromNodeHeaders(req.headers),
    });
    applyHeaders(res, result?.headers);
    res.statusCode = 303;
    res.setHeader("Location", returnTo);
    return res.end();
  } catch (error) {
    console.warn("Art Flow form sign-in failed", {
      status: errorStatus(error),
      message: error?.message || error?.body?.message || "Sign-in failed",
      hasEmail: Boolean(body.email),
      hasPassword: Boolean(body.password),
      contentType: req.headers?.["content-type"] || null,
      bodyType: Buffer.isBuffer(req.body) ? "buffer" : typeof req.body,
    });
    res.statusCode = 303;
    res.setHeader("Location", "/login?error=invalid_credentials");
    return res.end();
  }
}

async function directGoogleFormSignIn(req, res) {
  try {
    const url = new URL(req.url, "http://localhost");
    const returnTo = safeReturnPath(url.searchParams.get("returnTo") || "/");
    const response = await auth.api.signInSocial({
      body: {
        provider: "google",
        callbackURL: `https://artflowcreative.com${returnTo}`,
        errorCallbackURL: "https://artflowcreative.com/login?error=google_sign_in_failed",
        disableRedirect: false,
      },
      headers: fromNodeHeaders(req.headers),
      asResponse: true,
    });

    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== "set-cookie" && key.toLowerCase() !== "content-length") {
        res.setHeader(key, value);
      }
    });
    const setCookies = typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [];
    if (setCookies.length) res.setHeader("set-cookie", setCookies);

    const payload = await response.clone().json().catch(() => null);
    const target = response.headers.get("location") || payload?.url || "";
    if (target) {
      res.statusCode = 303;
      res.setHeader("Location", target);
      return res.end();
    }

    res.statusCode = response.status;
    const buffer = Buffer.from(await response.arrayBuffer());
    return res.end(buffer);
  } catch (error) {
    console.error("Art Flow Google form sign-in failed", error?.stack || error?.message || error);
    res.statusCode = 303;
    res.setHeader("Location", "/login?error=google_sign_in_failed");
    return res.end();
  }
}

export default async function handler(req, res) {
  let authPath = "";
  try {
    const url = new URL(req.url, "http://localhost");
    authPath = url.searchParams.get("__path") || "";
    url.searchParams.delete("__path");
    req.url = `/api/auth/${authPath}${url.search}`;
    if (authPath === "get-session") {
      console.log("artflow auth session check", {
        hasCookie: Boolean(req.headers?.cookie),
        host: req.headers?.host || null,
      });
    }
  } catch {
    // Leave the URL unchanged; Better Auth will return a normal error response.
  }

  // Keep password authentication on Better Auth's direct API so Vercel's
  // Node request adapter cannot fail before returning a response on the
  // email signup route. Keep every other Better Auth route on the proven Node
  // handler, but use Better Auth's direct API for registration so password
  // hashing, transactions, account creation, and session cookies remain native.
  if (req.method === "POST" && authPath === "sign-up/email") {
    return directEmailSignup(req, res);
  }
  if (req.method === "POST" && authPath === "sign-in/email") {
    return directEmailSignIn(req, res);
  }
  if (req.method === "POST" && authPath === "login-form") {
    return directEmailFormSignIn(req, res);
  }
  if (req.method === "GET" && authPath === "google-login") {
    return directGoogleFormSignIn(req, res);
  }
  return nodeHandler(req, res);
}

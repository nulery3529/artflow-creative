import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { auth } from "./auth/_auth.mjs";

const nodeHandler = toNodeHandler(auth);

function requestBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
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
    const status = Number(error?.statusCode || error?.status || 500);
    const body = error?.body && typeof error.body === "object"
      ? error.body
      : { message: error?.message || "Could not create account." };
    if (status >= 500) console.error("Art Flow direct signup failed", error?.stack || error?.message || error);
    return res.status(status).json(body);
  }
}

async function directEmailSignIn(req, res) {
  try {
    const result = await auth.api.signInEmail({
      body: requestBody(req),
      headers: fromNodeHeaders(req.headers),
      returnHeaders: true,
      returnStatus: true,
    });
    applyHeaders(res, result?.headers);
    return res.status(result?.status || 200).json(result?.response ?? {});
  } catch (error) {
    const status = Number(error?.statusCode || error?.status || 500);
    const body = error?.body && typeof error.body === "object"
      ? error.body
      : { message: error?.message || "Could not sign in." };
    if (status >= 500) console.error("Art Flow direct sign-in failed", error?.stack || error?.message || error);
    return res.status(status).json(body);
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

  // Vercel's Node request adapter can fail before returning a response on the
  // email signup route. Keep every other Better Auth route on the proven Node
  // handler, but use Better Auth's direct API for registration so password
  // hashing, transactions, account creation, and session cookies remain native.
  if (req.method === "POST" && authPath === "sign-up/email") {
    return directEmailSignup(req, res);
  }
  if (req.method === "POST" && authPath === "sign-in/email") {
    return directEmailSignIn(req, res);
  }

  return nodeHandler(req, res);
}

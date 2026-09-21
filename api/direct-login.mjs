import { auth } from './auth/_auth.mjs';
import { fromNodeHeaders } from 'better-auth/node';

function bodyObject(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const raw = Buffer.isBuffer(req.body)
    ? req.body.toString('utf8')
    : typeof req.body === 'string'
      ? req.body
      : '';
  if (!raw) return {};
  const contentType = String(req.headers?.['content-type'] || '').toLowerCase();
  if (contentType.includes('application/json')) {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return Object.fromEntries(new URLSearchParams(raw));
}

function applyHeaders(res, headers) {
  if (!headers) return;
  const setCookies = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
  headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') return;
    res.setHeader(key, value);
  });
  if (setCookies.length) res.setHeader('set-cookie', setCookies);
  else {
    const cookie = headers.get?.('set-cookie');
    if (cookie) res.setHeader('set-cookie', cookie);
  }
}

function safeReturnTo(value = '/') {
  const text = String(value || '/').trim();
  if (!text.startsWith('/') || text.startsWith('//')) return '/';
  if (text.includes('setup=gmail') || text.includes('setup=tracker')) return '/';
  return text;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');

  if (req.method === 'GET') {
    res.statusCode = 303;
    res.setHeader('Location', '/login');
    return res.end();
  }
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  const body = bodyObject(req);
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const returnTo = safeReturnTo(body.returnTo || '/');

  if (!email || !password) {
    res.statusCode = 303;
    res.setHeader('Location', '/login?error=' + encodeURIComponent('Enter your email and password.'));
    return res.end();
  }

  try {
    const result = await auth.api.signInEmail({
      body: { email, password, rememberMe: true },
      headers: fromNodeHeaders(req.headers),
      returnHeaders: true,
      returnStatus: true,
    });

    applyHeaders(res, result?.headers);
    if (Number(result?.status || 200) >= 400) {
      const message = result?.response?.message || 'Email or password is incorrect.';
      res.statusCode = 303;
      res.setHeader('Location', '/login?error=' + encodeURIComponent(message));
      return res.end();
    }

    res.statusCode = 303;
    res.setHeader('Location', returnTo);
    return res.end();
  } catch (error) {
    const message = error?.body?.message || error?.message || 'Could not sign in.';
    if (Number(error?.statusCode || error?.status || 500) >= 500) {
      console.error('Art Flow server-side login failed', error?.stack || error?.message || error);
    }
    res.statusCode = 303;
    res.setHeader('Location', '/login?error=' + encodeURIComponent(message));
    return res.end();
  }
}

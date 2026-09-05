import https from 'node:https';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-forwarded-port',
  'x-vercel-forwarded-for',
]);

export default function handler(req, res) {
  // Use the stable public production alias instead of VERCEL_URL. The latter
  // changes on every deployment and may be protected by Vercel Authentication,
  // which can lock the custom domain out of Better Auth after a deploy.
  const deploymentHost = 'art-flow-creative.vercel.app';

  const authPath = String(req.query?.__path || '').replace(/^\/+/, '');
  const query = new URLSearchParams();
  query.set('__path', authPath);

  for (const [key, value] of Object.entries(req.query || {})) {
    if (key === '__path' || value == null) continue;
    if (Array.isArray(value)) value.forEach((item) => query.append(key, String(item)));
    else query.append(key, String(value));
  }

  const headers = {};
  for (const [key, value] of Object.entries(req.headers || {})) {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower) || value == null) continue;
    headers[key] = value;
  }

  const upstream = https.request(
    {
      protocol: 'https:',
      hostname: deploymentHost,
      port: 443,
      method: req.method,
      path: `/api/better-auth?${query.toString()}`,
      headers,
    },
    (upstreamRes) => {
      res.statusCode = upstreamRes.statusCode || 502;
      for (const [key, value] of Object.entries(upstreamRes.headers)) {
        if (value == null || HOP_BY_HOP_HEADERS.has(key.toLowerCase())) continue;
        res.setHeader(key, value);
      }
      upstreamRes.pipe(res);
    }
  );

  upstream.on('error', (error) => {
    console.error('auth proxy upstream error', error?.message || error);
    if (!res.headersSent) res.status(502).json({ error: 'Authentication service unavailable' });
    else res.end();
  });

  req.pipe(upstream);
}

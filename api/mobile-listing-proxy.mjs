import https from 'node:https';

const HOP_BY_HOP_HEADERS = new Set([
  'connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer',
  'transfer-encoding','upgrade','host','x-forwarded-host','x-forwarded-proto',
  'x-forwarded-port','x-vercel-forwarded-for'
]);

export default function handler(req, res) {
  const deploymentHost = 'art-flow-creative.vercel.app';
  const headers = {};
  for (const [key, value] of Object.entries(req.headers || {})) {
    const lower = key.toLowerCase();
    if (value == null || HOP_BY_HOP_HEADERS.has(lower) || lower === 'content-length') continue;
    headers[key] = value;
  }

  let body = null;
  if (Buffer.isBuffer(req.body)) {
    body = req.body;
  } else if (typeof req.body === 'string') {
    body = Buffer.from(req.body);
  } else if (req.body && typeof req.body === 'object') {
    body = Buffer.from(JSON.stringify(req.body));
    if (!headers['content-type'] && !headers['Content-Type']) headers['content-type'] = 'application/json';
  }
  if (body) headers['content-length'] = String(body.length);

  const upstream = https.request({
    protocol: 'https:',
    hostname: deploymentHost,
    port: 443,
    method: req.method,
    path: '/api/mobile-listing-handler',
    headers,
  }, (upstreamRes) => {
    res.statusCode = upstreamRes.statusCode || 502;
    for (const [key, value] of Object.entries(upstreamRes.headers)) {
      if (value == null || HOP_BY_HOP_HEADERS.has(key.toLowerCase())) continue;
      res.setHeader(key, value);
    }
    upstreamRes.pipe(res);
  });

  upstream.on('error', (error) => {
    console.error('mobile listing proxy upstream error', error?.message || error);
    if (!res.headersSent) res.status(502).json({ error: 'Gallery listing service unavailable' });
    else res.end();
  });

  if (body) upstream.end(body);
  else req.pipe(upstream);
}

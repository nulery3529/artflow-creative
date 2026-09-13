import pg from 'pg';
import crypto from 'node:crypto';
import { pooledDatabaseUrl } from './_db.mjs';
import { clean, decrypt, encrypt, businessForUser, insertOrders, sizeFromTitle } from './_official-sync-shared.mjs';

const { Pool } = pg;
const pool = new Pool({ connectionString: pooledDatabaseUrl(), ssl: { rejectUnauthorized: false }, max: 1 });
export const config = { api: { bodyParser: false } };
const API_BASE = 'https://openapi.etsy.com/v3/application';
const TOKEN_URL = 'https://api.etsy.com/v3/public/oauth/token';

async function rawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') return res.status(200).json({ ok: true, endpoint: 'Etsy webhook receiver' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  return res.status(501).json({ error: 'Webhook receiver setup is still being deployed' });
}

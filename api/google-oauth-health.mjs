import pg from "pg";
import { pooledDatabaseUrl } from "./_db.mjs";

const { Pool } = pg;
const ARTFLOW_GOOGLE_CLIENT_ID = "280802752102-m7pnv9mdpjrehg3maln9kjk4du8m80nb.apps.googleusercontent.com";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (process.env.VERCEL_ENV === "production") return res.status(404).end();
  const pool = new Pool({
    connectionString: pooledDatabaseUrl(),
    ssl: { rejectUnauthorized: false },
    max: 1,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 8000,
    allowExitOnIdle: true,
  });
  try {
    const row = await pool.query(
      `SELECT "refreshToken"
         FROM public.account
        WHERE "providerId"='google'
          AND "refreshToken" IS NOT NULL
        ORDER BY "updatedAt" DESC
        LIMIT 1`
    );
    const refreshToken = row.rows?.[0]?.refreshToken;
    if (!refreshToken) return res.status(200).json({ ok: false, reason: "no_refresh_token" });

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: ARTFLOW_GOOGLE_CLIENT_ID,
        client_secret: String(process.env.GOOGLE_CLIENT_SECRET || "").trim().replace(/^['"]|['"]$/g, ""),
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
    const data = await response.json().catch(() => ({}));
    return res.status(200).json({
      ok: response.ok && Boolean(data?.access_token),
      status: response.status,
      error: data?.error || null,
      description: data?.error_description || null,
    });
  } catch (error) {
    return res.status(200).json({ ok: false, reason: "health_check_error", message: error?.message || "unknown" });
  } finally {
    await pool.end().catch(() => {});
  }
}

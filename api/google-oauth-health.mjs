const ARTFLOW_GOOGLE_CLIENT_ID = "280802752102-m7pnv9mdpjrehg3maln9kjk4du8m80nb.apps.googleusercontent.com";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (process.env.VERCEL_ENV === "production") return res.status(404).end();
  try {
    const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || "").trim().replace(/^['"]|['"]$/g, "");
    if (!clientSecret) return res.status(200).json({ ok: false, reason: "missing_client_secret" });

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: ARTFLOW_GOOGLE_CLIENT_ID,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: "artflow-intentionally-invalid-health-check-token",
      }),
    });
    const data = await response.json().catch(() => ({}));
    const credentialsAccepted = data?.error === "invalid_grant";
    return res.status(200).json({
      ok: credentialsAccepted,
      status: response.status,
      error: data?.error || null,
      credentialsAccepted,
    });
  } catch (error) {
    return res.status(200).json({ ok: false, reason: "health_check_error", message: error?.message || "unknown" });
  }
}

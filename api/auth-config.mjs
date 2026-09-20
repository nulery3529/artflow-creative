const ARTFLOW_GOOGLE_CLIENT_ID = "280802752102-m7pnv9mdpjrehg3maln9kjk4du8m80nb.apps.googleusercontent.com";

function cleanEnvValue(value) {
  const text = String(value || "").trim();
  if (text.length >= 2 && ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))) {
    return text.slice(1, -1).trim();
  }
  return text;
}

export function GET() {
  let googleClientId = cleanEnvValue(process.env.GOOGLE_CLIENT_ID);
  let googleClientSecret = cleanEnvValue(process.env.GOOGLE_CLIENT_SECRET);
  const looksLikeGoogleClientId = (value = "") => /\.apps\.googleusercontent\.com$/i.test(String(value || "").trim());
  if (!looksLikeGoogleClientId(googleClientId) && looksLikeGoogleClientId(googleClientSecret)) {
    [googleClientId, googleClientSecret] = [googleClientSecret, googleClientId];
  }
  if (process.env.VERCEL_ENV === "production") googleClientId = ARTFLOW_GOOGLE_CLIENT_ID;

  return Response.json({
    emailPassword: true,
    google: Boolean(googleClientId && googleClientSecret),
    googleClientIdFormatValid: Boolean(googleClientId && /^[0-9]+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(googleClientId)),
    googleClientIdLength: googleClientId.length,
    googleClientSecretLooksLikeClientId: looksLikeGoogleClientId(googleClientSecret),
    apple: Boolean(process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET),
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}

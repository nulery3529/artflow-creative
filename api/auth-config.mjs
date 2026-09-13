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

  return Response.json({
    emailPassword: true,
    google: Boolean(googleClientId && googleClientSecret),
    googleClientFingerprint: googleClientId ? (() => { const body = googleClientId.split('-').slice(1).join('-').split('.')[0]; return `${body.slice(0, 8)}…${body.slice(-4)}`; })() : null,
    googleClientIdFormatValid: Boolean(googleClientId && /^[0-9]+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(googleClientId)),
    googleClientIdLength: googleClientId.length,
    googleClientSecretLooksLikeClientId: looksLikeGoogleClientId(googleClientSecret),
    apple: Boolean(process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET),
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}

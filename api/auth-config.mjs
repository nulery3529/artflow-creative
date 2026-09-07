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
  if (/^GOCSPX-/i.test(googleClientId) && /\.apps\.googleusercontent\.com$/i.test(googleClientSecret)) {
    [googleClientId, googleClientSecret] = [googleClientSecret, googleClientId];
  }

  return Response.json({
    emailPassword: true,
    google: Boolean(googleClientId && googleClientSecret),
    googleClientIdFormatValid: Boolean(googleClientId && /^[0-9]+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(googleClientId)),
    googleClientIdLength: googleClientId.length,
    apple: Boolean(process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET),
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}

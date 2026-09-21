export function pooledDatabaseUrl(raw = process.env.DATABASE_URL) {
  const value = String(raw || '').trim();
  if (!value) return value;
  try {
    const url = new URL(value);
    if (/\.neon\.tech$/i.test(url.hostname) && !/-pooler\./i.test(url.hostname)) {
      const parts = url.hostname.split('.');
      parts[0] = `${parts[0]}-pooler`;
      url.hostname = parts.join('.');
    }
    // Keep the current strict TLS behavior explicit. pg currently treats
    // sslmode=require as verify-full, but that alias changes in pg v9.
    if (/\.neon\.tech$/i.test(url.hostname)) url.searchParams.set('sslmode', 'verify-full');
    return url.toString();
  } catch {
    return value;
  }
}

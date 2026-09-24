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
    const sslMode = String(url.searchParams.get('sslmode') || '').toLowerCase();
    if (sslMode === 'prefer' || sslMode === 'require' || sslMode === 'verify-ca') {
      url.searchParams.set('sslmode', 'verify-full');
    }
    return url.toString();
  } catch {
    return value;
  }
}

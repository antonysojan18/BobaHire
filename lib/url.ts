/**
 * Helper to dynamically get the public base URL of the app.
 * Automatically adapts to Hostinger temporary URLs (e.g. *.hostingerapp.com),
 * custom production domains, or localhost during development.
 */
export function getAppBaseUrl(req?: Request): string {
  // 1. If user configured an explicit production URL that is not localhost, prefer it
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
    return envUrl.replace(/\/+$/, '');
  }

  // 2. Extract dynamically from incoming HTTP request headers (Hostinger proxy headers)
  if (req) {
    const proto = req.headers.get('x-forwarded-proto') || 'https';
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
    if (host) {
      const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
      const finalProto = isLocal ? 'http' : proto;
      return `${finalProto}://${host}`.replace(/\/+$/, '');
    }
  }

  // 3. Fallback
  return envUrl?.replace(/\/+$/, '') || 'http://localhost:3000';
}

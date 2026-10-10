/**
 * Builds the Content-Security-Policy for a request.
 *
 * - Scripts: only same-origin scripts carrying the per-request nonce
 *   ('strict-dynamic' lets Next.js load its chunks). No inline scripts.
 * - Styles: 'unsafe-inline' is required for React style attributes; no
 *   external stylesheets are allowed.
 * - Network: the app and the configured Supabase project (HTTPS + Realtime WSS).
 */
export function buildContentSecurityPolicy(nonce: string, supabaseUrl: string, isDev: boolean): string {
  let supabaseOrigin = "";
  let supabaseWs = "";
  try {
    const url = new URL(supabaseUrl);
    supabaseOrigin = url.origin;
    supabaseWs = `${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}`;
  } catch {
    // Misconfigured URL: fall back to same-origin only.
  }

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", supabaseOrigin].filter(Boolean),
    "font-src": ["'self'", "data:"],
    "media-src": ["'self'", "blob:", supabaseOrigin].filter(Boolean),
    "connect-src": ["'self'", supabaseOrigin, supabaseWs, ...(isDev ? ["ws:"] : [])].filter(Boolean),
    "frame-src": ["'self'", supabaseOrigin].filter(Boolean),
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
  };

  const policy = Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
  return isDev ? policy : `${policy}; upgrade-insecure-requests`;
}

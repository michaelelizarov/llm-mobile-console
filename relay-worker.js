/*
 * Unchained relay — a Cloudflare Worker that forwards requests from the
 * Unchained web app to the abliteration.ai API, for browsers that are blocked
 * by CORS from calling the API directly.
 *
 * No npm, no build step: paste this whole file into the Cloudflare dashboard
 * editor (Workers & Pages → Create → Worker → Edit code) and tap Deploy.
 *
 * Then, in the Worker's Settings → Variables and Secrets, add:
 *   ABLI_API_KEY     (Secret)  your real abliteration.ai API key
 *   RELAY_TOKEN      (Secret)  the access token from the app's Settings → "Generate token"
 *   ALLOWED_ORIGINS  (Text)    the app's address, e.g. https://you.github.io/unchained-llm-mobile-console/
 *                              (a full URL with a path is fine; it is reduced to the origin;
 *                               several origins may be separated by commas or spaces)
 *   UPSTREAM         (Text)    optional, defaults to https://api.abliteration.ai
 *
 * Behaviour:
 *   - Proxies only /v1/chat/completions, /v1/models and /v1/messages/count_tokens.
 *   - The phone authenticates with "Authorization: Bearer <RELAY_TOKEN>"; the worker swaps
 *     in the real API key, which never leaves Cloudflare.
 *   - Streams SSE straight through without buffering.
 *   - Refuses other origins, bad tokens, other paths and other methods.
 *   - GET / (opening the worker URL in a browser) shows a status page that says whether
 *     each secret/variable is set, without revealing any value.
 */

const ALLOWED_PATHS = new Set([
  '/v1/chat/completions',
  '/v1/models',
  '/v1/messages/count_tokens',
]);

const DEFAULT_UPSTREAM = 'https://api.abliteration.ai';

/** Reduce a pasted value (maybe a full URL with a path) to its origin. */
function toOrigin(value) {
  const v = String(value || '').trim();
  if (!v) return '';
  try {
    const url = new URL(v.includes('://') ? v : 'https://' + v);
    return url.origin.toLowerCase();
  } catch (e) {
    return '';
  }
}

function parseAllowedOrigins(env) {
  const raw = String(env.ALLOWED_ORIGINS || '');
  const list = raw.split(/[\s,]+/).map(toOrigin).filter(Boolean);
  return new Set(list);
}

/** Constant-time string comparison so token checks don't leak timing. */
function safeEqual(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(String(a || ''));
  const y = enc.encode(String(b || ''));
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, X-Requested-With',
    'Access-Control-Expose-Headers': 'Content-Type, X-Relay',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(status, body, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });
}

function statusPage(env) {
  const set = (name) => (env[name] && String(env[name]).length > 0 ? '✅ set' : '❌ not set');
  const origins = [...parseAllowedOrigins(env)];
  const upstream = toOrigin(env.UPSTREAM) || DEFAULT_UPSTREAM;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Unchained relay</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem;background:#111;color:#eee}
code{background:#222;padding:.1em .3em;border-radius:4px}li{margin:.3rem 0}</style></head><body>
<h1>Unchained relay</h1><p>This Worker is running. Nothing secret is shown here.</p>
<ul>
<li><code>ABLI_API_KEY</code> (secret): ${set('ABLI_API_KEY')}</li>
<li><code>RELAY_TOKEN</code> (secret): ${set('RELAY_TOKEN')}</li>
<li><code>ALLOWED_ORIGINS</code>: ${origins.length ? '✅ ' + esc(origins.join(', ')) : '❌ not set'}</li>
<li><code>UPSTREAM</code>: ${esc(upstream)}${env.UPSTREAM ? '' : ' (default)'}</li>
</ul>
<p>Allowed paths: <code>/v1/chat/completions</code>, <code>/v1/models</code>, <code>/v1/messages/count_tokens</code>.</p>
<p>In the app, set the base URL to this Worker's address followed by <code>/v1</code> and paste your access token.</p>
</body></html>`;
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const origin = request.headers.get('Origin') || '';
    const allowed = parseAllowedOrigins(env);
    const originOk = origin && allowed.has(toOrigin(origin));

    // Status page: a plain browser visit with no Origin header.
    if (path === '/' && request.method === 'GET') return statusPage(env);

    if (!ALLOWED_PATHS.has(path)) {
      return json(404, { error: { message: 'Not proxied: ' + path, type: 'relay_not_found' } }, originOk ? corsHeaders(origin) : {});
    }

    if (request.method === 'OPTIONS') {
      if (!originOk) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (!originOk) {
      return json(403, { error: { message: 'Origin not allowed by this relay (check ALLOWED_ORIGINS)', type: 'relay_origin' } });
    }

    const cors = corsHeaders(origin);
    if (!env.ABLI_API_KEY || !env.RELAY_TOKEN) {
      return json(503, { error: { message: 'Relay not configured: set the ABLI_API_KEY and RELAY_TOKEN secrets', type: 'relay_config' } }, cors);
    }

    const auth = request.headers.get('Authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!token || !safeEqual(token, env.RELAY_TOKEN)) {
      return json(401, { error: { message: 'Bad relay token', type: 'relay_auth' } }, cors);
    }

    const expectedMethod = path === '/v1/models' ? 'GET' : 'POST';
    if (request.method !== expectedMethod) {
      return json(405, { error: { message: 'Method not allowed', type: 'relay_method' } }, { ...cors, Allow: expectedMethod });
    }

    const upstreamBase = toOrigin(env.UPSTREAM) || DEFAULT_UPSTREAM;
    const upstreamUrl = upstreamBase + path + url.search;
    const headers = new Headers();
    headers.set('Authorization', 'Bearer ' + env.ABLI_API_KEY);
    headers.set('Accept', request.headers.get('Accept') || '*/*');
    const ct = request.headers.get('Content-Type');
    if (ct) headers.set('Content-Type', ct);
    headers.set('User-Agent', 'unchained-relay/1.0');

    let upstream;
    try {
      upstream = await fetch(upstreamUrl, {
        method: request.method,
        headers,
        body: request.method === 'POST' ? request.body : undefined,
        redirect: 'manual',
      });
    } catch (e) {
      return json(502, { error: { message: 'Relay could not reach the API: ' + (e && e.message ? e.message : String(e)), type: 'relay_upstream' } }, cors);
    }

    // Pass the body through untouched (streaming), copy content headers, add CORS.
    const out = new Headers();
    for (const name of ['content-type', 'cache-control', 'x-request-id']) {
      const v = upstream.headers.get(name);
      if (v) out.set(name, v);
    }
    out.set('X-Relay', 'unchained');
    out.set('X-Accel-Buffering', 'no');
    for (const [k, v] of Object.entries(cors)) out.set(k, v);
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
  },
};

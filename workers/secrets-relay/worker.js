// Worker "mapa-da-carreira-relay": guarda os segredos fora do site.
// /meta/events → API de Conversões da Meta | /mp/api → Mercado Pago (só as 3 operações do Pix) | /health
// Variáveis: RELAY_SECRET (secret, igual a META_RELAY_SECRET no Netlify), META_CAPI_TOKEN (secret),
// META_PIXEL_ID, META_TEST_EVENT_CODE (opcional), MP_ACCESS_TOKEN (secret, produção).
// Assinatura: x-mc-timestamp (s) e x-mc-signature = HMAC-SHA256(RELAY_SECRET, `${ts}.${corpo}`) em hex.
const MAX_SKEW = 300, MAX_BODY = 32 * 1024, MAX_EVENTS = 10, GRAPH = 'v21.0';
const ALLOWED_EVENTS = new Set(['QuizComplete', 'Lead', 'DiagnosticInterest', 'Purchase']);
const MP_ROUTES = [
  { method: 'POST', re: /^\/v1\/orders$/ },
  { method: 'GET', re: /^\/v1\/orders\/[A-Za-z0-9_-]{1,64}$/ },
  { method: 'POST', re: /^\/v1\/orders\/[A-Za-z0-9_-]{1,64}\/cancel$/ },
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') {
      return json(200, {
        ok: true,
        meta_configured: Boolean(env.META_CAPI_TOKEN && env.META_PIXEL_ID && env.RELAY_SECRET),
        mp_configured: Boolean(env.MP_ACCESS_TOKEN && env.RELAY_SECRET),
        relay_secret_fp: env.RELAY_SECRET ? (await sha256hex(String(env.RELAY_SECRET).trim())).slice(0, 10) : null,
        time: Math.floor(Date.now() / 1000),
      });
    }
    if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
    if (url.pathname !== '/meta/events' && url.pathname !== '/mp/api') return json(404, { error: 'not_found' });
    const isMeta = url.pathname === '/meta/events';
    if (!env.RELAY_SECRET || (isMeta ? !env.META_CAPI_TOKEN || !env.META_PIXEL_ID : !env.MP_ACCESS_TOKEN)) return json(503, { error: 'not_configured' });
    const raw = await request.text();
    if (raw.length > MAX_BODY) return json(413, { error: 'too_large' });
    if (!(await verify(request, raw, env.RELAY_SECRET))) return json(401, { error: 'bad_signature' });
    let body;
    try { body = JSON.parse(raw); } catch { return json(400, { error: 'invalid_json' }); }
    return isMeta ? metaEvents(body, env) : mpApi(body, env);
  },
};

async function metaEvents(body, env) {
  const data = Array.isArray(body?.data) ? body.data : null;
  if (!data || data.length === 0 || data.length > MAX_EVENTS) return json(400, { error: 'invalid_events' });
  for (const e of data) {
    if (!e || !ALLOWED_EVENTS.has(e.event_name) || typeof e.event_id !== 'string' || e.action_source !== 'website') return json(400, { error: 'event_not_allowed' });
  }
  const payload = { data };
  const testCode = env.META_TEST_EVENT_CODE || (typeof body.test_event_code === 'string' ? body.test_event_code : undefined);
  if (testCode) payload.test_event_code = testCode;
  const res = await fetch(`https://graph.facebook.com/${GRAPH}/${encodeURIComponent(env.META_PIXEL_ID)}/events?access_token=${encodeURIComponent(env.META_CAPI_TOKEN)}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const meta = await res.json().catch(() => null);
  // Só o essencial volta ao site; nunca o token.
  return json(res.ok ? 200 : 502, { ok: res.ok, status: res.status, events_received: meta?.events_received, fbtrace_id: meta?.fbtrace_id, error: meta?.error?.message });
}

async function mpApi(req, env) {
  const method = String(req?.method || '').toUpperCase();
  const path = String(req?.path || '');
  if (!MP_ROUTES.some((r) => r.method === method && r.re.test(path))) return json(403, { error: 'route_not_allowed' });
  const headers = { Authorization: `Bearer ${String(env.MP_ACCESS_TOKEN).trim()}` };
  if (typeof req.idempotency_key === 'string' && req.idempotency_key) headers['X-Idempotency-Key'] = req.idempotency_key.slice(0, 120);
  let body;
  if (method === 'POST' && req.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(req.body); }
  let res;
  try { res = await fetch(`https://api.mercadopago.com${path}`, { method, headers, body }); } catch { return json(502, { error: 'mp_unreachable' }); }
  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text.slice(0, 500) }; }
  // Resposta do Mercado Pago como veio (status + corpo); o token nunca sai daqui.
  return json(200, { status: res.status, body: parsed });
}

async function verify(request, raw, secret) {
  const ts = request.headers.get('x-mc-timestamp') || '';
  const sig = (request.headers.get('x-mc-signature') || '').toLowerCase();
  if (!/^\d{9,11}$/.test(ts) || !/^[0-9a-f]{64}$/.test(sig)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(ts)) > MAX_SKEW) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(String(secret).trim()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${ts}.${raw}`))));
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

const hex = (a) => [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha256hex = async (s) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))));
const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

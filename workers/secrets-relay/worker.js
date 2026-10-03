// Cloudflare Worker "mapa-da-carreira-relay": guarda os segredos fora do site.
// - /meta/events: repassa eventos à API de Conversões da Meta (token da Meta fica só aqui).
// - /mp/api: chamadas ao Mercado Pago (Access Token fica só aqui), limitadas às 3 operações do Pix.
//
// Variáveis do Worker (Settings → Variables and Secrets):
//   RELAY_SECRET          (secret)  mesmo valor de META_RELAY_SECRET no Netlify
//   META_CAPI_TOKEN       (secret)  token da API de Conversões
//   META_PIXEL_ID         (texto)   287406024051977
//   META_TEST_EVENT_CODE  (texto, opcional) para ver os eventos em "Testar eventos"
//   MP_ACCESS_TOKEN       (secret)  Access Token de PRODUÇÃO do Mercado Pago
//
// O site assina cada pedido: x-mc-timestamp (segundos) e
// x-mc-signature = HMAC-SHA256(RELAY_SECRET, `${timestamp}.${corpo}`) em hex.

const MAX_SKEW_SECONDS = 300;
const MAX_BODY_BYTES = 32 * 1024;
const MAX_EVENTS = 10;
const ALLOWED_EVENTS = new Set(['QuizComplete', 'Lead', 'DiagnosticInterest', 'Purchase']);
const GRAPH_VERSION = 'v21.0';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') {
      return json(200, {
        ok: true,
        meta_configured: Boolean(env.META_CAPI_TOKEN && env.META_PIXEL_ID && env.RELAY_SECRET),
        mp_configured: Boolean(env.MP_ACCESS_TOKEN && env.RELAY_SECRET),
      });
    }
    if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
    if (url.pathname === '/meta/events') return metaEvents(request, env);
    if (url.pathname === '/mp/api') return mpApi(request, env);
    return json(404, { error: 'not_found' });
  },
};

async function metaEvents(request, env) {
  if (!env.RELAY_SECRET || !env.META_CAPI_TOKEN || !env.META_PIXEL_ID) return json(503, { error: 'not_configured' });
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { error: 'too_large' });
  if (!(await verifySignature(request, raw, env.RELAY_SECRET))) return json(401, { error: 'bad_signature' });

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: 'invalid_json' });
  }
  const data = Array.isArray(body?.data) ? body.data : null;
  if (!data || data.length === 0 || data.length > MAX_EVENTS) return json(400, { error: 'invalid_events' });
  for (const e of data) {
    if (!e || !ALLOWED_EVENTS.has(e.event_name) || typeof e.event_id !== 'string' || e.action_source !== 'website') {
      return json(400, { error: 'event_not_allowed' });
    }
  }

  const payload = { data };
  const testCode = env.META_TEST_EVENT_CODE || (typeof body.test_event_code === 'string' ? body.test_event_code : undefined);
  if (testCode) payload.test_event_code = testCode;

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(env.META_PIXEL_ID)}/events?access_token=${encodeURIComponent(env.META_CAPI_TOKEN)}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
  );
  let meta = null;
  try {
    meta = await res.json();
  } catch {
    /* resposta sem JSON */
  }
  // Só o essencial volta ao site; nunca o token.
  const out = { ok: res.ok, status: res.status, events_received: meta?.events_received, fbtrace_id: meta?.fbtrace_id, error: meta?.error?.message };
  return json(res.ok ? 200 : 502, out);
}

// Só o que o Pix do site usa: criar order, consultar order e cancelar order.
const MP_ROUTES = [
  { method: 'POST', re: /^\/v1\/orders$/ },
  { method: 'GET', re: /^\/v1\/orders\/[A-Za-z0-9_-]{1,64}$/ },
  { method: 'POST', re: /^\/v1\/orders\/[A-Za-z0-9_-]{1,64}\/cancel$/ },
];

async function mpApi(request, env) {
  if (!env.RELAY_SECRET || !env.MP_ACCESS_TOKEN) return json(503, { error: 'not_configured' });
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { error: 'too_large' });
  if (!(await verifySignature(request, raw, env.RELAY_SECRET))) return json(401, { error: 'bad_signature' });
  let req;
  try {
    req = JSON.parse(raw);
  } catch {
    return json(400, { error: 'invalid_json' });
  }
  const method = String(req?.method || '').toUpperCase();
  const path = String(req?.path || '');
  if (!MP_ROUTES.some((r) => r.method === method && r.re.test(path))) return json(403, { error: 'route_not_allowed' });

  const headers = { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}` };
  if (typeof req.idempotency_key === 'string' && req.idempotency_key) headers['X-Idempotency-Key'] = req.idempotency_key.slice(0, 120);
  let body;
  if (method === 'POST' && req.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(req.body);
  }
  let res;
  try {
    res = await fetch(`https://api.mercadopago.com${path}`, { method, headers, body });
  } catch (e) {
    return json(502, { error: 'mp_unreachable' });
  }
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text.slice(0, 500) };
  }
  // Devolve a resposta do Mercado Pago como veio (status + corpo); o token nunca sai daqui.
  return json(200, { status: res.status, body: parsed });
}

async function verifySignature(request, raw, secret) {
  const ts = request.headers.get('x-mc-timestamp') || '';
  const sig = (request.headers.get('x-mc-signature') || '').toLowerCase();
  if (!/^\d{9,11}$/.test(ts) || !/^[0-9a-f]{64}$/.test(sig)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(ts)) > MAX_SKEW_SECONDS) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(String(secret).trim()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${ts}.${raw}`)));
  const expected = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

function json(status, obj) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

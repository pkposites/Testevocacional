import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error: Worker em JS puro, colado no painel da Cloudflare
import worker from '../workers/secrets-relay/worker.js';
import { hmacHex } from '../server/http';
import type { App } from '../server/services';
import { analyticAnswers, Client, makeApp } from './helpers';

const ENV = { RELAY_SECRET: 's3gr3do-compartilhado', META_CAPI_TOKEN: 'TOKEN-SECRETO-META', META_PIXEL_ID: '287406024051977' };
const RELAY = 'https://relay.example.workers.dev';

function signed(body: unknown, secret = ENV.RELAY_SECRET, ts = Math.floor(Date.now() / 1000)) {
  const raw = JSON.stringify(body);
  return new Request(`${RELAY}/meta/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mc-timestamp': String(ts), 'x-mc-signature': hmacHex('sha256', secret, `${ts}.${raw}`) },
    body: raw,
  });
}
const ev = (name = 'Lead') => ({ event_name: name, event_id: 'lead_1', action_source: 'website', event_time: 1, user_data: {} });

let graph: { url: string; body: any }[];
beforeEach(() => {
  graph = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    graph.push({ url: String(url), body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify({ events_received: 1, fbtrace_id: 'abc' }), { status: 200 });
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('Worker da Cloudflare (token da Meta)', () => {
  it('repassa evento assinado à Meta com o token, sem devolvê-lo', async () => {
    const res = await worker.fetch(signed({ data: [ev()] }), ENV);
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out).toMatchObject({ ok: true, events_received: 1 });
    expect(JSON.stringify(out)).not.toContain(ENV.META_CAPI_TOKEN);
    expect(graph[0].url).toBe(`https://graph.facebook.com/v21.0/${ENV.META_PIXEL_ID}/events?access_token=${ENV.META_CAPI_TOKEN}`);
    expect(graph[0].body.data[0].event_name).toBe('Lead');
  });

  it('recusa assinatura errada, pedido velho, evento fora da lista e falta de configuração', async () => {
    expect((await worker.fetch(signed({ data: [ev()] }, 'outro'), ENV)).status).toBe(401);
    expect((await worker.fetch(signed({ data: [ev()] }, ENV.RELAY_SECRET, Math.floor(Date.now() / 1000) - 3600), ENV)).status).toBe(401);
    const semAssinatura = new Request(`${RELAY}/meta/events`, { method: 'POST', body: JSON.stringify({ data: [ev()] }) });
    expect((await worker.fetch(semAssinatura, ENV)).status).toBe(401);
    expect((await worker.fetch(signed({ data: [ev('AddToCart')] }), ENV)).status).toBe(400);
    expect((await worker.fetch(signed({ data: [] }), ENV)).status).toBe(400);
    expect((await worker.fetch(signed({ data: [ev()] }), { ...ENV, META_CAPI_TOKEN: '' })).status).toBe(503);
    expect(graph).toHaveLength(0);
    const health = await worker.fetch(new Request(`${RELAY}/health`), ENV);
    expect(await health.json()).toEqual({ ok: true, meta_configured: true, mp_configured: false });
  });
});

describe('site → Worker', () => {
  let app: App;
  beforeEach(async () => {
    app = await makeApp({ OFFER_MODE: 'free', META_PIXEL_ID: ENV.META_PIXEL_ID, META_RELAY_URL: RELAY + '/', META_RELAY_SECRET: ENV.RELAY_SECRET });
    // As chamadas do site caem direto no Worker (que usa o fetch simulado para falar com a Meta).
    app.fetchImpl = (async (url: string, init: RequestInit) => worker.fetch(new Request(url, init), ENV)) as any;
  });

  it('QuizComplete e Lead chegam à Meta pelo Worker; o site não tem o token', async () => {
    expect(app.cfg.meta.capiToken).toBeUndefined();
    const c = new Client(app);
    await c.req('POST', '/api/quiz/sessions', { attribution: {}, consent: 'granted', fbp: 'fb.1.1.1' });
    await c.req('PUT', '/api/quiz/sessions/me', { answers: analyticAnswers(), context: { moment: 'change', dailyTime: 15 } });
    const r = await c.req('POST', '/api/results', { consent: 'granted' });
    await c.req('POST', '/api/leads', { result_id: r.body.result_id, buyer_name: 'Ana', buyer_phone: '11987654321', contact_consent: true });
    expect(graph.map((g) => g.body.data[0].event_name)).toEqual(['QuizComplete', 'Lead']);
    expect(graph.every((g) => g.url.includes(`access_token=${ENV.META_CAPI_TOKEN}`))).toBe(true);
    expect(JSON.stringify(graph.map((g) => g.body))).not.toContain('11987654321');
  });

  it('sem consentimento nada é enviado', async () => {
    const c = new Client(app);
    await c.req('POST', '/api/quiz/sessions', { attribution: {}, consent: 'denied' });
    await c.req('PUT', '/api/quiz/sessions/me', { answers: analyticAnswers(), context: { moment: 'change', dailyTime: 15 } });
    await c.req('POST', '/api/results', { consent: 'denied' });
    expect(graph).toHaveLength(0);
  });
});

describe('Mercado Pago pelo Worker (token só na Cloudflare)', () => {
  const MP_ENV = { ...ENV, MP_ACCESS_TOKEN: 'APP_USR-token-secreto' };
  const order = {
    id: 'ORD01TESTE', external_reference: '11111111-2222-3333-4444-555555555555', status: 'action_required', status_detail: 'waiting_transfer',
    total_amount: '29.90', currency: 'BRL', user_id: '123',
    transactions: { payments: [{ id: 'PAY1', status: 'action_required', amount: '29.90', date_of_expiration: '2026-10-03T12:00:00.000-03:00',
      payment_method: { id: 'pix', type: 'bank_transfer', qr_code: '000201pix', qr_code_base64: 'iVBOR', ticket_url: 'https://mp/t' } }] },
  };
  let mpCalls: { url: string; init: RequestInit }[];
  beforeEach(() => {
    mpCalls = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      mpCalls.push({ url: String(url), init });
      return new Response(JSON.stringify(order), { status: String(url).endsWith('/cancel') ? 200 : 201 });
    });
  });

  it('cria, consulta e cancela o Pix pelo Worker; o site não tem o token', async () => {
    const { loadConfig } = await import('../server/config');
    const { createMercadoPago } = await import('../server/payments/mercadopago');
    const cfg = loadConfig({ APP_ENV: 'test', PAYMENT_PROVIDER: 'mercadopago', MP_WEBHOOK_SECRET: 's', MP_RELAY: '1', META_RELAY_URL: RELAY, META_RELAY_SECRET: ENV.RELAY_SECRET });
    expect(cfg.mp.accessToken).toBeUndefined();
    const mp = createMercadoPago(cfg, (async (url: string, init: RequestInit) => worker.fetch(new Request(url, init), MP_ENV)) as any);
    const r = await mp.createCheckout({ orderId: order.external_reference, publicRef: 'DG-X', attempt: 1, amountCents: 2990, buyerPhone: '5511987654321', buyerName: 'Ana', description: 'Diagnóstico', attribution: {} });
    expect(r.kind === 'pix' && r.state.pix?.qrCode).toBe('000201pix');
    expect(mpCalls[0].url).toBe('https://api.mercadopago.com/v1/orders');
    const h = mpCalls[0].init.headers as Record<string, string>;
    expect(h.Authorization).toBe('Bearer APP_USR-token-secreto');
    expect(h['X-Idempotency-Key']).toBe(`${order.external_reference}-1`);
    expect(JSON.parse(String(mpCalls[0].init.body)).total_amount).toBe('29.90');
    expect((await mp.fetchState('ORD01TESTE'))?.status).toBe('pending');
    expect(mpCalls[1].url).toBe('https://api.mercadopago.com/v1/orders/ORD01TESTE');
    await mp.cancel!('ORD01TESTE');
    expect(mpCalls[2].url).toBe('https://api.mercadopago.com/v1/orders/ORD01TESTE/cancel');
  });

  it('Worker recusa rotas fora da lista e pedidos sem assinatura', async () => {
    const req = (b: unknown, secret = ENV.RELAY_SECRET) => {
      const raw = JSON.stringify(b); const ts = Math.floor(Date.now() / 1000);
      return new Request(`${RELAY}/mp/api`, { method: 'POST', headers: { 'x-mc-timestamp': String(ts), 'x-mc-signature': hmacHex('sha256', secret, `${ts}.${raw}`) }, body: raw });
    };
    expect((await worker.fetch(req({ method: 'GET', path: '/v1/payments/search?x=1' }), MP_ENV)).status).toBe(403);
    expect((await worker.fetch(req({ method: 'DELETE', path: '/v1/orders/ORD1' }), MP_ENV)).status).toBe(403);
    expect((await worker.fetch(req({ method: 'GET', path: '/v1/orders/ORD1' }, 'errado'), MP_ENV)).status).toBe(401);
    expect((await worker.fetch(req({ method: 'GET', path: '/v1/orders/ORD1' }), { ...MP_ENV, MP_ACCESS_TOKEN: '' })).status).toBe(503);
    expect(mpCalls).toHaveLength(0);
    const ok = await worker.fetch(req({ method: 'GET', path: '/v1/orders/ORD1' }), MP_ENV);
    const out = await ok.json();
    expect(out.status).toBe(201);
    expect(JSON.stringify(out)).not.toContain('APP_USR-token-secreto');
  });
});

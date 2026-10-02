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
    expect(await health.json()).toEqual({ ok: true, meta_configured: true });
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

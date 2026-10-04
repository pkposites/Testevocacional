import { beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../server/services';
import { buildDiagnostic } from '../server/diagnostic';
import { computeResult } from '../server/scoring';
import { CAREERS } from '../server/content/careers.v1';
import { CAREER_DIAGNOSTICS } from '../server/content/diagnostic.v1';
import { QUESTIONS } from '../shared/quiz';
import { analyticAnswers, Client, fakeWebhook, lastResourceId, makeApp } from './helpers';
import { fakeStore } from '../server/payments/fake';

let app: App;
let capi: any[];

async function lead(c: Client) {
  await c.req('POST', '/api/quiz/sessions', { attribution: { utm_source: 'meta', utm_content: 'AD7' }, consent: 'granted', fbp: 'fb.1.1.2' });
  await c.req('PUT', '/api/quiz/sessions/me', { answers: analyticAnswers(), context: { moment: 'change', dailyTime: 30, currentArea: 'Atendimento ao cliente' } });
  const r = await c.req('POST', '/api/results', { consent: 'granted' });
  const l = await c.req('POST', '/api/leads', { result_id: r.body.result_id, buyer_name: 'Ana Souza', buyer_phone: '11987654321', contact_consent: true });
  return { resultId: r.body.result_id as string, mapRef: l.body.public_ref as string };
}

async function pay(orderId: string) {
  const rid = await lastResourceId(app, orderId);
  fakeStore.setStatus(rid, 'paid');
  const res = await fakeWebhook(app, rid);
  expect(res.status).toBe(200);
}

describe('diagnóstico pago', () => {
  beforeEach(async () => {
    app = await makeApp({ OFFER_MODE: 'free', DIAGNOSTIC_MODE: 'paid', DIAGNOSTIC_PRICE_CENTS: '2990', META_PIXEL_ID: '1', META_CAPI_TOKEN: 'tok' });
    capi = [];
    app.fetchImpl = (async (url: string, init: RequestInit) => {
      if (String(url).includes('graph.facebook.com')) capi.push(JSON.parse(String(init.body)).data[0]);
      return new Response('{}', { status: 200 });
    }) as any;
  });

  it('Pix → webhook → libera o diagnóstico, sem mexer no mapa nem nos leads', async () => {
    const c = new Client(app);
    const cfg = await c.req('GET', '/api/config');
    expect(cfg.body.diagnostic_mode).toBe('paid');
    expect(cfg.body.diagnostic_price_cents).toBe(2990);
    const { resultId, mapRef } = await lead(c);

    let full = await c.req('GET', `/api/results/${resultId}/full`);
    expect(full.body.diagnostic).toEqual({ mode: 'paid', price_cents: 2990, purchased: false, open_order_id: null });
    expect((await c.req('GET', `/api/diagnostic/${resultId}`)).status).toBe(402);

    const o = await c.req('POST', '/api/diagnostic/orders', { result_id: resultId });
    expect(o.status).toBe(200);
    expect(o.body.public_ref).toMatch(/^DG-/);
    expect(o.body.product).toBe('diagnostic');
    expect(o.body.amount_cents).toBe(2990);
    expect(o.body.next_action).toBe('pay_pix');
    expect(o.body.pix?.qr_code).toBeTruthy();

    // Repetir o clique reaproveita o mesmo pedido e o mesmo Pix.
    const again = await c.req('POST', '/api/diagnostic/orders', { result_id: resultId });
    expect(again.body.order_id).toBe(o.body.order_id);
    expect(Number((await app.db.query(`select count(*) n from payments where order_id = $1`, [o.body.order_id]))[0].n)).toBe(1);

    // O mapa continua o mesmo pedido gratuito.
    full = await c.req('GET', `/api/results/${resultId}/full`);
    expect(full.body.public_ref).toBe(mapRef);
    expect(full.body.diagnostic.open_order_id).toBe(o.body.order_id);

    await pay(o.body.order_id);
    const st = await c.req('GET', `/api/orders/${o.body.order_id}/status`);
    expect(st.body.status).toBe('paid');
    expect(st.body.next_action).toBe('open_diagnostic');
    expect(capi.filter((e) => e.event_name === 'Purchase')).toEqual([
      expect.objectContaining({ event_id: `purchase_${o.body.order_id}`, custom_data: { currency: 'BRL', value: 29.9 } }),
    ]);

    const dg = await c.req('GET', `/api/diagnostic/${resultId}`);
    expect(dg.status).toBe(200);
    expect(dg.body.buyer_first_name).toBe('Ana');
    expect(dg.body.diagnostic.weeks).toHaveLength(4);
    expect(dg.body.diagnostic.weeks[0].tasks).toHaveLength(4); // 30 min/dia
    expect(dg.body.diagnostic.experience.text).toContain('Atendimento ao cliente');
    expect(dg.body.diagnostic.career.id).toBe(full.body.map.cards[0].careerId);
    // Outro caminho do mesmo mapa.
    const other = full.body.map.cards[2].careerId;
    expect((await c.req('GET', `/api/diagnostic/${resultId}?career=${other}`)).body.diagnostic.career.id).toBe(other);

    full = await c.req('GET', `/api/results/${resultId}/full`);
    expect(full.body.public_ref).toBe(mapRef);
    expect(full.body.diagnostic.purchased).toBe(true);
    // Comprado: novo clique devolve o pedido pago, sem gerar outro Pix.
    expect((await c.req('POST', '/api/diagnostic/orders', { result_id: resultId })).body.next_action).toBe('open_diagnostic');

    // Outro aparelho: recupera com o código DG- e abre os dois.
    const outro = new Client(app);
    const rec = await outro.req('POST', '/api/access/recover', { phone: '11987654321', order_ref: o.body.public_ref });
    expect(rec.status).toBe(200);
    expect(rec.body.maps).toEqual([expect.objectContaining({ result_id: resultId, public_ref: mapRef, diagnostic: true })]);
    expect((await outro.req('GET', `/api/diagnostic/${resultId}`)).status).toBe(200);

    // Painel de leads: continua um lead só.
    const adm = new Client(app);
    await adm.req('POST', '/api/admin/login', { password: 'adm' });
    expect((await adm.req('GET', '/api/admin/leads')).body.leads).toHaveLength(1);
  });

  it('painel conta Pix gerados e Pix pagos separadamente', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const adm = new Client(app);
    await adm.req('POST', '/api/admin/login', { password: 'adm' });
    await adm.req('POST', '/api/admin/device', { internal: false });
    const counts = async () => {
      const d = (await adm.req('GET', `/api/admin/analytics?from=${today}&to=${today}`)).body;
      const f = Object.fromEntries(d.funnel.map((x: any) => [x.key, x.value]));
      return [f.pix, f.paid, d.revenue.grossCents];
    };
    const a = new Client(app);
    const { resultId } = await lead(a);
    const o = await a.req('POST', '/api/diagnostic/orders', { result_id: resultId });
    expect(await counts()).toEqual([1, 0, 0]);
    await pay(o.body.order_id);
    expect(await counts()).toEqual([1, 1, 2990]);
  });

  it('sem acesso ao mapa não cria pedido; modo lista de espera recusa a compra', async () => {
    const c = new Client(app);
    const { resultId } = await lead(c);
    const stranger = new Client(app);
    expect((await stranger.req('POST', '/api/diagnostic/orders', { result_id: resultId })).status).toBe(403);
    expect((await stranger.req('GET', `/api/diagnostic/${resultId}`)).status).toBe(403);

    app.cfg.diagnosticMode = 'waitlist';
    const r = await c.req('POST', '/api/diagnostic/orders', { result_id: resultId });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('diagnostic_waitlist');
  });

  it('valor pago diferente do pedido não libera', async () => {
    const c = new Client(app);
    const { resultId } = await lead(c);
    const o = await c.req('POST', '/api/diagnostic/orders', { result_id: resultId });
    const rid = await lastResourceId(app, o.body.order_id);
    fakeStore.set(rid, { status: 'paid', rawStatus: 'approved', amountCents: 100 });
    await fakeWebhook(app, rid);
    expect((await c.req('GET', `/api/diagnostic/${resultId}`)).status).toBe(402);
  });
});

describe('conteúdo do diagnóstico', () => {
  it('toda carreira tem conteúdo e o plano muda com tempo, momento e área', () => {
    for (const c of CAREERS) expect(CAREER_DIAGNOSTICS[c.id], c.name).toBeDefined();
    const answers = analyticAnswers();
    const a = computeResult(answers, { moment: 'first', dailyTime: 15 }).snapshot;
    const b = computeResult(answers, { moment: 'change', dailyTime: 60, currentArea: 'vendas em loja' }).snapshot;
    const da = buildDiagnostic(a, answers);
    const db = buildDiagnostic(b, answers);
    expect(da.weeks.every((w) => w.tasks.length === 3)).toBe(true);
    expect(db.weeks.every((w) => w.tasks.length === 5)).toBe(true);
    expect(da.weeks[3].goal).not.toBe(db.weeks[3].goal);
    expect(db.experience.text).toContain('vendas em loja');
    expect(da.hoursTotal).toBe(5);
  });

  it('gera para todos os perfis sem erro e com evidências das próprias respostas', () => {
    // Um perfil forte em cada área.
    for (const dim of ['P', 'A', 'C', 'S', 'N', 'O']) {
      const answers = Object.fromEntries(QUESTIONS.map((q) => [q.id, q.dimension === dim ? 5 : 2]));
      const snap = computeResult(answers, { moment: 'explore', dailyTime: 30 }).snapshot;
      for (const card of snap.cards) {
        const d = buildDiagnostic(snap, answers, card.careerId);
        expect(d.career.id).toBe(card.careerId);
        expect(d.why.length).toBeGreaterThan(0);
        expect(d.attention.length).toBeGreaterThan(0);
        expect(d.weeks.flatMap((w) => w.tasks).join(' ')).not.toMatch(/undefined|null/);
      }
    }
  });
});

describe('apagar leads de teste', () => {
  it('remove lead, diagnóstico pago, respostas e acesso; mantém os outros', async () => {
    app = await makeApp({ OFFER_MODE: 'free', DIAGNOSTIC_MODE: 'paid' });
    const a = new Client(app);
    const { resultId } = await lead(a);
    const o = await a.req('POST', '/api/diagnostic/orders', { result_id: resultId });
    await pay(o.body.order_id);
    await a.req('PUT', '/api/progress', { result_id: resultId, career_id: (await a.req('GET', `/api/results/${resultId}/full`)).body.map.cards[0].careerId, day: 1, checked: true });

    const b = new Client(app);
    await b.req('POST', '/api/quiz/sessions', {});
    await b.req('PUT', '/api/quiz/sessions/me', { answers: analyticAnswers(), context: { moment: 'first', dailyTime: 15 } });
    const rb = await b.req('POST', '/api/results', {});
    await b.req('POST', '/api/leads', { result_id: rb.body.result_id, buyer_name: 'Bia', buyer_phone: '21987654321', contact_consent: true });

    const adm = new Client(app);
    await adm.req('POST', '/api/admin/login', { password: 'adm' });
    const leads = (await adm.req('GET', '/api/admin/leads')).body.leads;
    expect(leads).toHaveLength(2);
    const ana = leads.find((l: any) => l.buyer_name === 'Ana Souza');

    expect((await adm.req('POST', '/api/admin/leads/purge', { order_ids: [ana.id] })).status).toBe(400);
    expect((await new Client(app).req('POST', '/api/admin/leads/purge', { order_ids: [ana.id], confirm: 'APAGAR' })).status).toBe(401);
    const r = await adm.req('POST', '/api/admin/leads/purge', { order_ids: [ana.id], confirm: 'APAGAR' });
    expect(r.body).toMatchObject({ ok: true, orders: 2, sessions: 1 });

    const left = (await adm.req('GET', '/api/admin/leads')).body.leads;
    expect(left.map((l: any) => l.buyer_name)).toEqual(['Bia']);
    const n = async (sql: string) => Number((await app.db.query(sql))[0].n);
    expect(await n(`select count(*) n from orders`)).toBe(1);
    expect(await n(`select count(*) n from payments`)).toBe(0);
    expect(await n(`select count(*) n from entitlements`)).toBe(1);
    expect(await n(`select count(*) n from progress`)).toBe(0);
    expect(await n(`select count(*) n from results`)).toBe(1);
    expect(await n(`select count(*) n from quiz_sessions`)).toBe(1);
    expect(await n(`select count(*) n from access_sessions where buyer_phone = '5511987654321'`)).toBe(0);
    // O aparelho da pessoa apagada perde o acesso; o outro continua.
    expect((await a.req('GET', `/api/results/${resultId}/full`)).status).toBe(403);
    expect((await b.req('GET', `/api/results/${rb.body.result_id}/full`)).status).toBe(200);
  });
});

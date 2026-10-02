import { describe, expect, it } from 'vitest';
import { QUESTIONS } from '../shared/quiz';
import { fakeStore } from '../server/payments/fake';
import { analyticAnswers, Client, fakeWebhook, lastResourceId, makeApp } from './helpers';

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

describe('painel de análise', () => {
  it('funil, abandono por pergunta, origem e receita batem com o que aconteceu', async () => {
    const app = await makeApp();
    const all = analyticAnswers();

    // 4 visitas na home (PageView), sendo uma sem consentimento
    for (const consent of ['granted', 'granted', 'denied', 'unknown']) {
      await new Client(app).req('POST', '/api/events', { name: 'PageView', event_id: `pv-${Math.random()}`, consent });
    }

    // A: responde 3 perguntas e desiste (anúncio AD1)
    const a = new Client(app);
    await a.req('POST', '/api/quiz/sessions', { attribution: { utm_source: 'meta', utm_content: 'AD1 | Mudança', utm_term: 'CJ1' } });
    await a.req('PUT', '/api/quiz/sessions/me', { answers: { Q01: 3, Q02: 4, Q03: 5 } });

    // B: termina, vê prévia, não compra (AD1)
    const b = new Client(app);
    await b.req('POST', '/api/quiz/sessions', { attribution: { utm_source: 'meta', utm_content: 'AD1 | Mudança', utm_term: 'CJ1' } });
    await b.req('PUT', '/api/quiz/sessions/me', { answers: all, context: { moment: 'change', dailyTime: 30 } });
    await b.req('POST', '/api/results');

    // C: termina e compra (AD2)
    const c = new Client(app);
    await c.req('POST', '/api/quiz/sessions', { attribution: { utm_source: 'meta', utm_content: 'AD2 | Primeira', utm_term: 'CJ2' } });
    await c.req('PUT', '/api/quiz/sessions/me', { answers: all, context: { moment: 'first', dailyTime: 15 } });
    const r = await c.req('POST', '/api/results');
    await c.req('POST', '/api/events', { name: 'CheckoutClick', event_id: 'cc-1' });
    const o = await c.req('POST', '/api/orders', { result_id: r.body.result_id, buyer_name: 'Ana', buyer_phone: '11987654321' });
    const rid = await lastResourceId(app, o.body.order_id);
    fakeStore.setStatus(rid, 'paid');
    await fakeWebhook(app, rid);
    const full = await c.req('GET', `/api/results/${r.body.result_id}/full`);
    await c.req('PUT', '/api/progress', { result_id: r.body.result_id, career_id: full.body.map.cards[0].careerId, day: 1, checked: true });

    // D: abre o teste e não responde nada (direto, sem UTM)
    await new Client(app).req('POST', '/api/quiz/sessions', {});

    const adm = new Client(app);
    expect((await adm.req('GET', '/api/admin/analytics')).status).toBe(401);
    await adm.req('POST', '/api/admin/login', { password: 'adm' });
    const res = await adm.req('GET', `/api/admin/analytics?from=${today}&to=${today}`);
    expect(res.status).toBe(200);
    const d = res.body;

    const f = Object.fromEntries(d.funnel.map((x: any) => [x.key, x.value]));
    expect(f).toEqual({ visits: 4, started: 3, completed: 2, result: 2, checkout_click: 1, pix: 1, paid: 1 });

    const q = Object.fromEntries(d.questions.map((x: any) => [x.key, x.value]));
    expect([q.Q01, q.Q03, q.Q04, q.Q12, q.context, q.result]).toEqual([3, 3, 2, 2, 2, 2]);
    expect(d.questions).toHaveLength(QUESTIONS.length + 2);
    expect(d.quiz.sessions).toBe(4);

    const ad1 = d.sources.find((s: any) => s.source === 'AD1 | Mudança');
    expect(ad1).toMatchObject({ adset: 'CJ1', sessions: 2, started: 2, completed: 1, orders: 0, paid: 0, revenueCents: 0 });
    const ad2 = d.sources.find((s: any) => s.source === 'AD2 | Primeira');
    expect(ad2).toMatchObject({ sessions: 1, completed: 1, orders: 1, paid: 1, revenueCents: 1450 });
    expect(d.sources.find((s: any) => s.source === '(sem UTM / direto)').sessions).toBe(1);

    expect(d.revenue).toEqual({ grossCents: 1450, netCents: 1450, purchases: 1 });
    expect(d.orders).toMatchObject({ created: 1, pixGenerated: 1, paid: 1, expired: 0 });
    expect(d.daily).toHaveLength(1);
    expect(d.daily[0]).toMatchObject({ day: today, visits: 4, started: 3, completed: 2, purchases: 1, revenueCents: 1450 });
    expect(d.delivery).toMatchObject({ entitlements: 1, accessed: 1, plan_started: 1 });
    expect(d.profile.moments.map((m: any) => m.key).sort()).toEqual(['change', 'first']);
    const consent = Object.fromEntries(d.consent.map((x: any) => [x.key, x.c]));
    expect(consent).toEqual({ granted: 2, denied: 1, unknown: 1 });

    // Período sem dados devolve zeros, não erro.
    const empty = await adm.req('GET', '/api/admin/analytics?from=2020-01-01&to=2020-01-03');
    expect(empty.body.funnel[0].value).toBe(0);
    expect(empty.body.daily).toHaveLength(3);
  });
});

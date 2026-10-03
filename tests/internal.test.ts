import { describe, expect, it } from 'vitest';
import { analyticAnswers, Client, makeApp } from './helpers';

async function lead(c: Client, phone: string) {
  await c.req('POST', '/api/quiz/sessions', { attribution: { utm_content: 'AD12' } });
  await c.req('PUT', '/api/quiz/sessions/me', { answers: analyticAnswers(), context: { moment: 'first', dailyTime: 15 } });
  const r = await c.req('POST', '/api/results', {});
  await c.req('POST', '/api/leads', { result_id: r.body.result_id, buyer_name: 'Teste', buyer_phone: phone, contact_consent: true });
  await c.req('POST', '/api/events', { name: 'PageView', event_id: `pv_${phone}` });
}

describe('aparelho do admin não conta', () => {
  it('testes e visitas do aparelho marcado ficam fora de leads, painel e relatório', async () => {
    const app = await makeApp({ OFFER_MODE: 'free', REPORT_TOKEN: 't'.repeat(32) });
    const adm = new Client(app);
    await adm.req('POST', '/api/admin/login', { password: 'adm' });
    expect((await adm.req('GET', '/api/config')).body.internal).toBe(true);
    await lead(adm, '11911112222'); // teste do próprio admin
    await lead(new Client(app), '11933334444'); // pessoa real

    const leads = (await adm.req('GET', '/api/admin/leads')).body.leads;
    expect(leads).toHaveLength(1);
    expect(leads[0].buyer_phone).toBe('5511933334444');

    const rep = await new Client(app).req('GET', '/api/admin/report?hours=24', undefined, { 'x-report-token': 't'.repeat(32) });
    expect(rep.body.janela).toMatchObject({ testes_iniciados: 1, testes_concluidos: 1, leads: 1 });

    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const an = (await adm.req('GET', `/api/admin/analytics?from=${today}&to=${today}`)).body;
    const step = (k: string) => an.funnel.find((x: any) => x.key === k)?.value;
    expect(step('visits')).toBe(1);
    expect(step('started')).toBe(1);
    expect(step('leads')).toBe(1);
    expect(Number((await app.db.query(`select count(*) n from events where name = 'Lead'`))[0].n)).toBe(1);

    // Desfazer a marcação volta a contar.
    await adm.req('POST', '/api/admin/device', { internal: false });
    expect((await adm.req('GET', '/api/config')).body.internal).toBe(false);
  });
});

describe('painel: período "hoje"', () => {
  it('conta só desde a meia-noite de Brasília, sem misturar com ontem', async () => {
    const app = await makeApp({ OFFER_MODE: 'free' });
    await lead(new Client(app), '11955556666'); // hoje
    await lead(new Client(app), '11977778888'); // será movido para ontem
    await app.db.query(`update quiz_sessions set created_at = created_at - interval '1 day' where attribution->>'utm_content' = 'AD12' and id = (select session_id from orders where buyer_phone = '5511977778888')`);
    await app.db.query(`update orders set created_at = created_at - interval '1 day' where buyer_phone = '5511977778888'`);
    await app.db.query(`update events set ts = ts - interval '1 day' where event_id = 'pv_11977778888'`);
    const adm = new Client(app);
    await adm.req('POST', '/api/admin/login', { password: 'adm' });
    await adm.req('POST', '/api/admin/device', { internal: false });
    const tz = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
    const today = tz(new Date());
    const yesterday = tz(new Date(Date.now() - 86400000));
    const t = (await adm.req('GET', `/api/admin/analytics?from=${today}&to=${today}`)).body;
    const y = (await adm.req('GET', `/api/admin/analytics?from=${yesterday}&to=${yesterday}`)).body;
    const step = (d: any, k: string) => d.funnel.find((x: any) => x.key === k)?.value;
    expect([step(t, 'visits'), step(t, 'started'), step(t, 'leads')]).toEqual([1, 1, 1]);
    expect([step(y, 'visits'), step(y, 'started'), step(y, 'leads')]).toEqual([1, 1, 1]);
  });
});

describe('amostra do roteiro antes de comprar', () => {
  it('só para quem tem o mapa; muda conforme o caminho escolhido', async () => {
    const app = await makeApp({ OFFER_MODE: 'free', DIAGNOSTIC_MODE: 'paid' });
    const c = new Client(app);
    await c.req('POST', '/api/quiz/sessions', {});
    await c.req('PUT', '/api/quiz/sessions/me', { answers: analyticAnswers(), context: { moment: 'first', dailyTime: 30 } });
    const r = await c.req('POST', '/api/results', {});
    await c.req('POST', '/api/leads', { result_id: r.body.result_id, buyer_name: 'Lia', buyer_phone: '11922223333', contact_consent: true });
    expect((await new Client(app).req('GET', `/api/diagnostic/${r.body.result_id}/sample`)).status).toBe(403);
    const cards = (await c.req('GET', `/api/results/${r.body.result_id}/full`)).body.map.cards;
    const a = (await c.req('GET', `/api/diagnostic/${r.body.result_id}/sample?career=${cards[0].careerId}`)).body;
    const b = (await c.req('GET', `/api/diagnostic/${r.body.result_id}/sample?career=${cards[1].careerId}`)).body;
    expect(a.career.id).toBe(cards[0].careerId);
    expect(b.career.id).toBe(cards[1].careerId);
    expect(a.today.activity).toMatch(/^Faça esta atividade/);
    expect(a.requirement.length).toBeGreaterThan(20);
    expect(a.tasks).toBe(16);
    expect(a.today.activity).not.toBe(b.today.activity);
    // O roteiro completo continua bloqueado até pagar.
    expect((await c.req('GET', `/api/diagnostic/${r.body.result_id}`)).status).toBe(402);
  });
});

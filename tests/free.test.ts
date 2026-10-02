import { beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../server/services';
import { analyticAnswers, Client, makeApp } from './helpers';

let app: App;
let capi: any[];

beforeEach(async () => {
  app = await makeApp({ OFFER_MODE: 'free', META_PIXEL_ID: '287406024051977', META_CAPI_TOKEN: 'tok' });
  capi = [];
  app.fetchImpl = (async (url: string, init: RequestInit) => {
    if (String(url).includes('graph.facebook.com')) capi.push(JSON.parse(String(init.body)).data[0]);
    return new Response('{}', { status: 200 });
  }) as any;
});

async function finishQuiz(c: Client, consent: 'granted' | 'denied' = 'granted', utm = 'AD1 | Mudança') {
  await c.req('POST', '/api/quiz/sessions', { attribution: { utm_source: 'meta', utm_content: utm }, consent, fbp: 'fb.1.123.456' });
  await c.req('PUT', '/api/quiz/sessions/me', { answers: analyticAnswers(), context: { moment: 'change', dailyTime: 15 } });
  return c.req('POST', '/api/results', { consent });
}

const count = async (sql: string, p: unknown[] = []) => Number((await app.db.query(sql, p))[0].n);

describe('modo gratuito', () => {
  it('nome + WhatsApp liberam o mapa completo sem pagamento; pedido pago é bloqueado', async () => {
    const c = new Client(app);
    expect((await c.req('GET', '/api/config')).body.offer_mode).toBe('free');
    const r = await finishQuiz(c);
    expect(r.body.event_id).toMatch(/^gamecomplete_/);

    expect((await c.req('GET', `/api/results/${r.body.result_id}/full`)).status).toBe(403);
    expect((await c.req('POST', '/api/orders', { result_id: r.body.result_id, buyer_name: 'Ana', buyer_phone: '11987654321' })).body.code).toBe('free_mode');

    // Consentimento de contato é obrigatório.
    const noConsent = await c.req('POST', '/api/leads', { result_id: r.body.result_id, buyer_name: 'Ana', buyer_phone: '11987654321' });
    expect(noConsent.body.code).toBe('consent_required');

    const lead = await c.req('POST', '/api/leads', { result_id: r.body.result_id, buyer_name: 'ana souza', buyer_phone: '(11) 98765-4321', contact_consent: true, public_name_ok: true });
    expect(lead.status).toBe(200);
    expect(lead.body.event_id).toBe(`lead_${lead.body.order_id}`);
    const full = await c.req('GET', `/api/results/${r.body.result_id}/full`);
    expect(full.status).toBe(200);
    expect(full.body.map.cards).toHaveLength(5);
    expect(full.body.offer_mode).toBe('free');
    expect(full.body.diagnostic_interest).toBe(false);

    // Reenviar o formulário não cria outro lead.
    await c.req('POST', '/api/leads', { result_id: r.body.result_id, buyer_name: 'Ana', buyer_phone: '11987654321', contact_consent: true });
    expect(await count(`select count(*) n from orders where provider = 'free'`)).toBe(1);
    expect(await count(`select count(*) n from orders where amount_cents = 0 and status = 'paid'`)).toBe(1);

    // Outro aparelho recupera com WhatsApp + código.
    const outro = new Client(app);
    const rec = await outro.req('POST', '/api/access/recover', { phone: '11987654321', order_ref: lead.body.public_ref });
    expect(rec.body.maps[0].result_id).toBe(r.body.result_id);
  });

  it('interesse no diagnóstico é registrado uma vez e aparece no admin de leads', async () => {
    const c = new Client(app);
    const r = await finishQuiz(c);
    const lead = await c.req('POST', '/api/leads', { result_id: r.body.result_id, buyer_name: 'Bia', buyer_phone: '21998765432', contact_consent: true });
    const i1 = await c.req('POST', '/api/interest', { result_id: r.body.result_id });
    const i2 = await c.req('POST', '/api/interest', { result_id: r.body.result_id });
    expect(i1.body.event_id).toBe(`interest_${lead.body.order_id}`);
    expect(i2.body.interested_at).toBe(i1.body.interested_at);
    expect(await count(`select count(*) n from events where name = 'DiagnosticInterest'`)).toBe(1);
    expect((await c.req('GET', `/api/results/${r.body.result_id}/full`)).body.diagnostic_interest).toBe(true);
    expect((await new Client(app).req('POST', '/api/interest', { result_id: r.body.result_id })).status).toBe(403);

    const adm = new Client(app);
    await adm.req('POST', '/api/admin/login', { password: 'adm' });
    const all = await adm.req('GET', '/api/admin/leads');
    expect(all.body.leads).toHaveLength(1);
    expect(all.body.leads[0]).toMatchObject({ buyer_name: 'Bia', buyer_phone: '5521998765432', moment: 'change', utm_content: 'AD1 | Mudança' });
    expect(all.body.leads[0].diagnostic_interest_at).toBeTruthy();
    expect((await adm.req('GET', '/api/admin/leads?interest=1')).body.leads).toHaveLength(1);
  });

  it('eventos da Meta: QuizComplete, Lead e DiagnosticInterest com os mesmos IDs do navegador e só com consentimento', async () => {
    const c = new Client(app);
    const r = await finishQuiz(c, 'granted');
    const lead = await c.req('POST', '/api/leads', { result_id: r.body.result_id, buyer_name: 'Ana', buyer_phone: '11987654321', contact_consent: true });
    const interest = await c.req('POST', '/api/interest', { result_id: r.body.result_id });
    expect(capi.map((e) => [e.event_name, e.event_id])).toEqual([
      ['QuizComplete', r.body.event_id],
      ['Lead', lead.body.event_id],
      ['DiagnosticInterest', interest.body.event_id],
    ]);
    // Sem dados pessoais no evento.
    const s = JSON.stringify(capi);
    expect(s).not.toContain('Ana');
    expect(s).not.toContain('987654321');
    expect(capi[0].user_data.fbp).toBe('fb.1.123.456');

    capi.length = 0;
    const d = new Client(app);
    const r2 = await finishQuiz(d, 'denied');
    await d.req('POST', '/api/leads', { result_id: r2.body.result_id, buyer_name: 'Caio', buyer_phone: '31998765432', contact_consent: true });
    expect(capi).toHaveLength(0);
  });

  it('notificações usam só dados reais e o nome apenas com autorização', async () => {
    const empty = await new Client(app).req('GET', '/api/social-proof');
    expect(empty.body.items).toEqual([]);

    const a = new Client(app);
    const ra = await finishQuiz(a);
    await a.req('POST', '/api/leads', { result_id: ra.body.result_id, buyer_name: 'maria clara silva', buyer_phone: '11911112222', contact_consent: true, public_name_ok: true });
    const b = new Client(app);
    const rb = await finishQuiz(b);
    await b.req('POST', '/api/leads', { result_id: rb.body.result_id, buyer_name: 'João', buyer_phone: '11933334444', contact_consent: true, public_name_ok: false });

    const sp = await new Client(app).req('GET', '/api/social-proof');
    expect(sp.body.items).toHaveLength(2);
    const names = sp.body.items.map((i: any) => i.name);
    expect(names).toContain('Maria');
    expect(names).toContain(null);
    expect(JSON.stringify(sp.body)).not.toMatch(/João|Silva|1191111|1193333/);
    expect(sp.body.items[0].career).toBeTruthy();
    expect(sp.body.results_today).toBe(2);
  });

  it('painel no modo gratuito: funil termina em leads e interesse; nada conta como venda', async () => {
    const c = new Client(app);
    await c.req('POST', '/api/events', { name: 'PageView', event_id: 'pv1', consent: 'granted' });
    const r = await finishQuiz(c);
    await c.req('POST', '/api/leads', { result_id: r.body.result_id, buyer_name: 'Ana', buyer_phone: '11987654321', contact_consent: true });
    await c.req('POST', '/api/interest', { result_id: r.body.result_id });
    const adm = new Client(app);
    await adm.req('POST', '/api/admin/login', { password: 'adm' });
    const d = (await adm.req('GET', '/api/admin/analytics')).body;
    expect(d.mode).toBe('free');
    expect(d.funnel.map((f: any) => f.key)).toEqual(['visits', 'started', 'completed', 'result', 'leads', 'interested']);
    expect(d.funnel.at(-2).value).toBe(1);
    expect(d.funnel.at(-1).value).toBe(1);
    expect(d.revenue).toEqual({ grossCents: 0, netCents: 0, purchases: 0 });
    expect(d.sources[0]).toMatchObject({ leads: 1, interested: 1, paid: 0 });
    expect(d.daily[0]).toMatchObject({ leads: 1, interested: 1, purchases: 0 });
  });

  it('sessão opcional: sem teste começado responde null (sem 401); com teste, os dados', async () => {
    const c = new Client(app);
    const none = await c.req('GET', '/api/quiz/sessions/me?optional=1');
    expect(none.status).toBe(200);
    expect(none.body).toBeNull();
    expect((await c.req('GET', '/api/quiz/sessions/me')).status).toBe(401);
    await c.req('POST', '/api/quiz/sessions', { attribution: {} });
    const some = await c.req('GET', '/api/quiz/sessions/me?optional=1');
    expect(some.status).toBe(200);
    expect(some.body.progress).toBe(0);
  });

  it('admin: login certo não conta para o bloqueio; 5 erros seguidos bloqueiam', async () => {
    const adm = new Client(app);
    for (let i = 0; i < 8; i++) expect((await adm.req('POST', '/api/admin/login', { password: 'adm' })).status).toBe(200);
    for (let i = 0; i < 5; i++) expect((await adm.req('POST', '/api/admin/login', { password: 'x' })).status).toBe(401);
    expect((await adm.req('POST', '/api/admin/login', { password: 'x' })).status).toBe(429);
  });

  it('checagens opcionais de acesso e admin respondem 200 sem login', async () => {
    const c = new Client(app);
    expect(await c.req('GET', '/api/access/me?optional=1')).toEqual({ status: 200, body: { maps: null } });
    expect((await c.req('GET', '/api/access/me')).status).toBe(401);
    expect(await c.req('GET', '/api/admin/me?optional=1')).toEqual({ status: 200, body: { ok: false } });
    await c.req('POST', '/api/admin/login', { password: 'adm' });
    expect((await c.req('GET', '/api/admin/me?optional=1')).body).toEqual({ ok: true });
  });
});

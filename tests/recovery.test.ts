import { describe, expect, it } from 'vitest';
import { analyticAnswers, Client, makeApp } from './helpers';

async function lead(c: Client, phone: string, optIn: boolean) {
  await c.req('POST', '/api/quiz/sessions', { consent: 'granted' });
  await c.req('PUT', '/api/quiz/sessions/me', { answers: analyticAnswers(), context: { moment: 'change', dailyTime: 30 } });
  const r = await c.req('POST', '/api/results', { consent: 'granted' });
  await c.req('POST', '/api/leads', { result_id: r.body.result_id, buyer_name: 'Ana Souza', buyer_phone: phone, contact_consent: true, marketing_opt_in: optIn });
  return r.body.result_id as string;
}

describe('recuperar lead pelo WhatsApp do admin', () => {
  it('mensagem pronta com nome, caminho, link do mapa e passo de hoje; oferta só para quem aceitou novidades', async () => {
    const app = await makeApp({ OFFER_MODE: 'free', DIAGNOSTIC_MODE: 'paid', DIAGNOSTIC_PRICE_CENTS: '1997' });
    const resultId = await lead(new Client(app), '11955556666', false);
    await lead(new Client(app), '11977778888', true);

    expect((await new Client(app).req('POST', '/api/admin/leads/x/recovery', {})).status).toBe(401);
    const adm = new Client(app);
    await adm.req('POST', '/api/admin/login', { password: 'adm' });
    const leads = (await adm.req('GET', '/api/admin/leads')).body.leads;
    const semOptIn = leads.find((l: any) => l.buyer_phone === '5511955556666');
    const comOptIn = leads.find((l: any) => l.buyer_phone === '5511977778888');
    expect(semOptIn.contacted_at).toBeNull();

    const a = await adm.req('POST', `/api/admin/leads/${semOptIn.id}/recovery`, {});
    expect(a.status).toBe(200);
    expect(a.body.text).toContain('Oi, Ana!');
    expect(a.body.text).toContain(semOptIn.career);
    expect(a.body.text).toContain('/acesso?t=');
    expect(a.body.text).toContain('Um passo para fazer hoje');
    expect(a.body.text).not.toContain('R$');
    expect(a.body.wa_url).toMatch(/^https:\/\/wa\.me\/5511955556666\?text=/);

    const b = await adm.req('POST', `/api/admin/leads/${comOptIn.id}/recovery`, {});
    expect(b.body.offer).toBe(true);
    expect(b.body.text).toContain('R$ 19,97');

    // O link abre o mapa da pessoa em outro aparelho.
    const phone = new Client(app);
    const token = new URL(a.body.link).searchParams.get('t');
    const ex = await phone.req('POST', '/api/access/exchange', { token });
    expect(ex.status).toBe(200);
    expect((await phone.req('GET', `/api/results/${resultId}/full`)).status).toBe(200);

    const after = (await adm.req('GET', '/api/admin/leads')).body.leads.find((l: any) => l.id === semOptIn.id);
    expect(after.contacted_at).not.toBeNull();
  });

  it('lista "Pix não pago" e mensagem para gerar um Pix novo', async () => {
    const app = await makeApp({ OFFER_MODE: 'free', DIAGNOSTIC_MODE: 'paid', DIAGNOSTIC_PRICE_CENTS: '1790' });
    const c = new Client(app);
    const resultId = await lead(c, '11955556666', false);
    await lead(new Client(app), '11977778888', false);
    const adm = new Client(app);
    await adm.req('POST', '/api/admin/login', { password: 'adm' });
    expect((await adm.req('GET', '/api/admin/leads?pix=1')).body.leads).toHaveLength(0);

    await c.req('POST', '/api/diagnostic/orders', { result_id: resultId });
    const pix = (await adm.req('GET', '/api/admin/leads?pix=1')).body.leads;
    expect(pix).toHaveLength(1);
    expect(pix[0].buyer_phone).toBe('5511955556666');
    expect(pix[0].pix_unpaid_at).toBeTruthy();

    const r = await adm.req('POST', `/api/admin/leads/${pix[0].id}/recovery`, { kind: 'pix' });
    expect(r.body.text).toContain('gerou o Pix');
    expect(r.body.text).toContain('R$ 17,90');
    expect(r.body.text).toContain('/acesso?t=');
  });
});

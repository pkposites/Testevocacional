import { describe, expect, it } from 'vitest';
import { Client, makeApp } from './helpers';

const TOKEN = 'r'.repeat(32);
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

describe('gasto da Meta no painel', () => {
  it('rotina envia o gasto do dia; o painel "hoje" mostra o total e cada envio substitui o anterior', async () => {
    const app = await makeApp({ OFFER_MODE: 'free', REPORT_TOKEN: TOKEN });
    const bot = new Client(app);
    const h = { 'x-report-token': TOKEN };
    const body = (v: number, l: number) => ({ day: today, campaigns: [{ id: '1', name: 'MC | Vendas', spend: v }, { id: '2', name: 'MC | Leads grátis', spend: l }] });

    expect((await new Client(app).req('PUT', '/api/admin/ad-spend', body(1, 1))).status).toBe(401);
    expect((await bot.req('PUT', '/api/admin/ad-spend', { day: 'ontem', campaigns: [] }, h)).status).toBe(400);
    expect((await bot.req('PUT', '/api/admin/ad-spend', body(10.5, 20), h)).body.ad_spend.cents).toBe(3050);
    const r = await bot.req('PUT', '/api/admin/ad-spend', body(25.08, 31.22), h);
    expect(r.body.ad_spend.cents).toBe(5630);

    const adm = new Client(app);
    await adm.req('POST', '/api/admin/login', { password: 'adm' });
    const a = await adm.req('GET', `/api/admin/analytics?from=${today}&to=${today}`);
    expect(a.body.ad_spend.cents).toBe(5630);
    expect(a.body.ad_spend.campaigns.map((c: any) => c.cents)).toEqual([3122, 2508]);
    // Outro período não leva o gasto de hoje.
    expect((await adm.req('GET', '/api/admin/analytics?from=2020-01-01&to=2020-01-02')).body.ad_spend.cents).toBe(0);
  });
});

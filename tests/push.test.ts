import { describe, expect, it, vi } from 'vitest';

const sent: { endpoint: string; payload: any }[] = [];
let failWith: number | null = null;
vi.mock('web-push', () => ({
  default: {
    sendNotification: vi.fn(async (sub: any, payload: string) => {
      if (failWith) { const e: any = new Error('gone'); e.statusCode = failWith; throw e; }
      sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
    }),
  },
}));

import { analyticAnswers, Client, makeApp } from './helpers';

const SUB = { endpoint: 'https://web.push.apple.com/abc123456789', keys: { p256dh: 'BKey', auth: 'Auth' } };

describe('notificações do painel', () => {
  it('admin inscreve o aparelho e recebe aviso de novo lead; inscrição revogada é removida', async () => {
    const app = await makeApp({ OFFER_MODE: 'free', VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' });
    const anon = new Client(app);
    expect((await anon.req('POST', '/api/admin/push/subscribe', { subscription: SUB })).status).toBe(401);

    const adm = new Client(app);
    await adm.req('POST', '/api/admin/login', { password: 'adm' });
    expect((await adm.req('GET', '/api/admin/push/key')).body).toEqual({ enabled: true, public_key: 'pub' });
    expect((await adm.req('POST', '/api/admin/push/subscribe', { subscription: { endpoint: 'http://x' } })).status).toBe(400);
    expect((await adm.req('POST', '/api/admin/push/subscribe', { subscription: SUB })).status).toBe(200);
    expect((await adm.req('POST', '/api/admin/push/test')).body.sent).toBe(1);

    sent.length = 0;
    const c = new Client(app);
    await c.req('POST', '/api/quiz/sessions', { attribution: { utm_content: 'AD12' } });
    await c.req('PUT', '/api/quiz/sessions/me', { answers: analyticAnswers(), context: { moment: 'first', dailyTime: 15 } });
    const r = await c.req('POST', '/api/results', {});
    await c.req('POST', '/api/leads', { result_id: r.body.result_id, buyer_name: 'Carla Dias', buyer_phone: '11987654321', contact_consent: true });
    expect(sent).toHaveLength(1);
    expect(sent[0].payload.title).toBe('🟢 Novo lead');
    expect(sent[0].payload.body).toMatch(/^Carla · .+ · AD12$/);
    expect(sent[0].payload.body).not.toContain('98765');

    // Reenvio do mesmo formulário não notifica de novo.
    await c.req('POST', '/api/leads', { result_id: r.body.result_id, buyer_name: 'Carla', buyer_phone: '11987654321', contact_consent: true });
    expect(sent).toHaveLength(1);

    failWith = 410;
    await adm.req('POST', '/api/admin/push/test');
    failWith = null;
    expect(Number((await app.db.query('select count(*) n from push_subscriptions'))[0].n)).toBe(0);
  });

  it('sem chaves VAPID o lead funciona normalmente', async () => {
    const app = await makeApp({ OFFER_MODE: 'free' });
    const c = new Client(app);
    await c.req('POST', '/api/quiz/sessions', {});
    await c.req('PUT', '/api/quiz/sessions/me', { answers: analyticAnswers(), context: { moment: 'first', dailyTime: 15 } });
    const r = await c.req('POST', '/api/results', {});
    expect((await c.req('POST', '/api/leads', { result_id: r.body.result_id, buyer_name: 'Ana', buyer_phone: '11987654321', contact_consent: true })).status).toBe(200);
  });
});

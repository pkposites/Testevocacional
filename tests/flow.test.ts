import { beforeEach, describe, expect, it } from 'vitest';
import { sentEmails } from '../server/email';
import { fakeStore } from '../server/payments/fake';
import type { App } from '../server/services';
import { analyticAnswers, Client, fakeWebhook, lastResourceId, makeApp, reachPix } from './helpers';

let app: App;
beforeEach(async () => {
  app = await makeApp();
});

const count = async (sql: string, p: unknown[] = []) => Number((await app.db.query(sql, p))[0].n);

describe('teste e prévia', () => {
  it('salva, retoma e edita respostas; nova revisão recalcula', async () => {
    const c = new Client(app);
    await c.req('POST', '/api/quiz/sessions', {});
    await c.req('PUT', '/api/quiz/sessions/me', { answers: { Q01: 3 } });
    let me = await c.req('GET', '/api/quiz/sessions/me');
    expect(me.body.answers).toEqual({ Q01: 3 });
    expect(me.body.progress).toBe(1);
    await c.req('PUT', '/api/quiz/sessions/me', { answers: analyticAnswers(), context: { moment: 'first', dailyTime: 15 } });
    const r1 = await c.req('POST', '/api/results');
    expect(r1.status).toBe(200);
    await c.req('PUT', '/api/quiz/sessions/me', { answers: { Q01: 5 } });
    const r2 = await c.req('POST', '/api/results');
    expect(r2.body.result_id).not.toBe(r1.body.result_id);
    me = await c.req('GET', '/api/quiz/sessions/me');
    expect(me.body.result.result_id).toBe(r2.body.result_id);
  });

  it('valida respostas (1–5 inteiras) e contexto obrigatório', async () => {
    const c = new Client(app);
    await c.req('POST', '/api/quiz/sessions', {});
    expect((await c.req('PUT', '/api/quiz/sessions/me', { answers: { Q01: 6 } })).status).toBe(400);
    expect((await c.req('PUT', '/api/quiz/sessions/me', { answers: { Q99: 1 } })).status).toBe(400);
    expect((await c.req('PUT', '/api/quiz/sessions/me', { context: { currentArea: 'x'.repeat(81) } })).status).toBe(400);
    await c.req('PUT', '/api/quiz/sessions/me', { answers: analyticAnswers() });
    expect((await c.req('POST', '/api/results')).body.code).toBe('incomplete_context');
  });

  it('a prévia não contém ranking nem conteúdo pago', async () => {
    const c = new Client(app);
    await c.req('POST', '/api/quiz/sessions', {});
    await c.req('PUT', '/api/quiz/sessions/me', { answers: analyticAnswers(), context: { moment: 'first', dailyTime: 15 } });
    const r = await c.req('POST', '/api/results');
    const s = JSON.stringify(r.body);
    expect(s).not.toMatch(/Análise de dados|Gestão de tráfego|ranked|affinity|days/);
    expect(r.body.summary.topDimensions).toHaveLength(2);
  });
});

describe('pagamento e liberação', () => {
  it('fluxo completo: Pix → webhook → acesso, e-mail e Purchase únicos', async () => {
    const c = new Client(app);
    const { resultId, order } = await reachPix(c);
    expect(order.status).toBe('pending');
    expect(order.next_action).toBe('pay_pix');
    expect(order.pix.qr_code).toMatch(/^000201/);
    expect(order.amount_cents).toBe(1450);

    // Antes de pagar: rota privada responde 403.
    expect((await c.req('GET', `/api/results/${resultId}/full`)).status).toBe(403);

    const rid = await lastResourceId(app, order.order_id);
    fakeStore.setStatus(rid, 'paid');
    const wh = await fakeWebhook(app, rid, 'evt-1');
    expect(wh.status).toBe(200);
    // Webhook repetido e outro evento do mesmo recurso não duplicam nada.
    await fakeWebhook(app, rid, 'evt-1');
    await fakeWebhook(app, rid, 'evt-2');

    expect(await count(`select count(*) n from entitlements where order_id = $1`, [order.order_id])).toBe(1);
    expect(await count(`select count(*) n from events where name = 'Purchase' and order_id = $1`, [order.order_id])).toBe(1);
    expect(await count(`select count(*) n from email_outbox where order_id = $1 and status = 'sent'`, [order.order_id])).toBe(1);
    expect(sentEmails).toHaveLength(1);

    const st = await c.req('GET', `/api/orders/${order.order_id}/status`);
    expect(st.body.status).toBe('paid');
    expect(st.body.next_action).toBe('open_map');
    const full = await c.req('GET', `/api/results/${resultId}/full`);
    expect(full.status).toBe(200);
    expect(full.body.map.cards).toHaveLength(5);
    expect(full.body.map.cards[0].days).toHaveLength(7);
    expect(full.body.buyer_first_name).toBe('Ana');

    // Recarregar e reenviar o pedido não recria nem cobra de novo.
    const again = await c.req('POST', '/api/orders', { result_id: resultId, buyer_name: 'Ana', buyer_email: 'ana@example.com' });
    expect(again.body.order_id).toBe(order.order_id);
    expect(again.body.status).toBe('paid');
    expect(await count('select count(*) n from orders')).toBe(1);
  });

  it('retorno do cliente reconcilia sem webhook (webhook atrasado)', async () => {
    const c = new Client(app);
    const { resultId, order } = await reachPix(c);
    fakeStore.setStatus(await lastResourceId(app, order.order_id), 'paid');
    const st = await c.req('GET', `/api/orders/${order.order_id}/status`);
    expect(st.body.status).toBe('paid');
    expect((await c.req('GET', `/api/results/${resultId}/full`)).status).toBe(200);
  });

  it('Pix pendente, URL adulterada e webhook inválido não liberam', async () => {
    const c = new Client(app);
    const { resultId, order } = await reachPix(c);
    const rid = await lastResourceId(app, order.order_id);
    await fakeWebhook(app, rid); // ainda pendente
    expect((await c.req('GET', `/api/results/${resultId}/full`)).status).toBe(403);

    fakeStore.setStatus(rid, 'paid');
    const forged = await (await import('../server/app')).handle(app, new Request('http://localhost:5173/api/webhooks/fake', {
      method: 'POST', headers: { 'x-fake-signature': 'deadbeef' }, body: JSON.stringify({ event_id: 'x', data: { id: rid } }),
    }));
    expect(forged.status).toBe(401);
    expect(await count('select count(*) n from entitlements')).toBe(0);

    // Outro navegador sem vínculo não vê o pedido nem o mapa.
    const intruso = new Client(app);
    expect((await intruso.req('GET', `/api/orders/${order.order_id}/status`)).status).toBe(404);
    expect((await intruso.req('GET', `/api/results/${resultId}/full`)).status).toBe(403);
    expect((await intruso.req('GET', `/api/results/not-a-uuid/full`)).status).toBe(403);
  });

  it('valor divergente bloqueia liberação automática', async () => {
    const c = new Client(app);
    const { order } = await reachPix(c);
    const rid = await lastResourceId(app, order.order_id);
    fakeStore.set(rid, { status: 'paid', amountCents: 100 });
    const res = await (await fakeWebhook(app, rid)).json();
    expect(res.code).toBe('review');
    expect(await count('select count(*) n from entitlements')).toBe(0);
    const st = await c.req('GET', `/api/orders/${order.order_id}/status`);
    expect(st.body.next_action).toBe('contact_support');
  });

  it('pagamento sem pedido correspondente vira alerta, sem acesso', async () => {
    const { applyProviderState } = await import('../server/reconcile');
    const r = await applyProviderState(app.db, app.cfg, 'fake', { resourceId: 'X1', externalReference: '00000000-0000-0000-0000-000000000000', status: 'paid', rawStatus: 'paid', amountCents: 1450, currency: 'BRL' });
    expect(r.code).toBe('orphan');
    expect(await count(`select count(*) n from payments where flag = 'orphan'`)).toBe(1);
  });

  it('eventos fora de ordem: pending antigo não rebaixa paid; aprovação antiga não desfaz reembolso', async () => {
    const c = new Client(app);
    const { resultId, order } = await reachPix(c);
    const rid = await lastResourceId(app, order.order_id);
    fakeStore.setStatus(rid, 'paid');
    await fakeWebhook(app, rid);
    const { applyProviderState } = await import('../server/reconcile');
    const base = { resourceId: rid, externalReference: order.order_id, rawStatus: '', amountCents: 1450, currency: 'BRL' };
    await applyProviderState(app.db, app.cfg, 'fake', { ...base, status: 'pending' });
    expect((await c.req('GET', `/api/orders/${order.order_id}/status`)).body.status).toBe('paid');

    // Reembolso confirmado revoga.
    await applyProviderState(app.db, app.cfg, 'fake', { ...base, status: 'refunded' });
    expect((await c.req('GET', `/api/results/${resultId}/full`)).status).toBe(403);
    // Notificação antiga de aprovação não reativa.
    const r = await applyProviderState(app.db, app.cfg, 'fake', { ...base, status: 'paid' });
    expect(r.released).toBe(false);
    expect((await c.req('GET', `/api/results/${resultId}/full`)).status).toBe(403);
    expect(await count(`select count(*) n from entitlements where state = 'revoked'`)).toBe(1);
  });

  it('Pix expirado: nova tentativa gera outro Pix e cancela o anterior; dois pagos → duplicidade', async () => {
    const c = new Client(app);
    const { order } = await reachPix(c);
    const rid1 = await lastResourceId(app, order.order_id);
    await app.db.query(`update payments set expires_at = now() - interval '1 minute' where provider_resource_id = $1`, [rid1]);
    const st = await c.req('GET', `/api/orders/${order.order_id}/status`);
    expect(st.body.status).toBe('expired');
    expect(st.body.next_action).toBe('retry');
    const retry = await c.req('POST', `/api/orders/${order.order_id}/retry`);
    expect(retry.body.status).toBe('pending');
    const rid2 = await lastResourceId(app, order.order_id);
    expect(rid2).not.toBe(rid1);
    expect(fakeStore.get(rid1)!.status).toBe('cancelled');
    expect(await count(`select count(*) n from payments where order_id = $1 and normalized_status = 'pending'`, [order.order_id])).toBe(1);

    // Caso extremo: os dois foram pagos de fato.
    fakeStore.setStatus(rid2, 'paid');
    await fakeWebhook(app, rid2);
    fakeStore.setStatus(rid1, 'paid');
    await fakeWebhook(app, rid1);
    expect(await count('select count(*) n from entitlements')).toBe(1);
    expect(await count(`select count(*) n from payments where flag = 'duplicate'`)).toBe(1);
  });

  it('falha no e-mail não desfaz a compra e permite reenvio pelo admin', async () => {
    let fail = true;
    app.sendEmail = async () => {
      if (fail) throw new Error('smtp down');
    };
    const c = new Client(app);
    const { resultId, order } = await reachPix(c);
    const rid = await lastResourceId(app, order.order_id);
    fakeStore.setStatus(rid, 'paid');
    await fakeWebhook(app, rid);
    expect((await c.req('GET', `/api/results/${resultId}/full`)).status).toBe(200);
    expect(await count(`select count(*) n from email_outbox where status = 'failed'`)).toBe(1);

    fail = false;
    const adm = new Client(app);
    expect((await adm.req('POST', '/api/admin/login', { password: 'errada' })).status).toBe(401);
    expect((await adm.req('GET', '/api/admin/alerts')).status).toBe(401);
    await adm.req('POST', '/api/admin/login', { password: 'adm' });
    const alerts = await adm.req('GET', '/api/admin/alerts');
    expect(alerts.body.pending_emails).toHaveLength(1);
    expect((await adm.req('POST', `/api/admin/orders/${order.order_id}/resend`, { operator: 'robson' })).status).toBe(200);
    expect(await count(`select count(*) n from email_outbox where status = 'sent'`)).toBe(2);
  });
});

describe('recuperação de acesso', () => {
  it('aba fechada: link do e-mail abre o mapa em outro navegador; token é de uso único', async () => {
    const c = new Client(app);
    const { resultId, order } = await reachPix(c);
    const rid = await lastResourceId(app, order.order_id);
    fakeStore.setStatus(rid, 'paid');
    await fakeWebhook(app, rid);
    const token = new URL(/https?:\/\/\S+/.exec(sentEmails[0].text)![0]).searchParams.get('t')!;

    const outro = new Client(app);
    const ex = await outro.req('POST', '/api/access/exchange', { token });
    expect(ex.status).toBe(200);
    expect(ex.body.maps[0].result_id).toBe(resultId);
    expect((await outro.req('GET', `/api/results/${resultId}/full`)).status).toBe(200);
    expect((await new Client(app).req('POST', '/api/access/exchange', { token })).status).toBe(410);
  });

  it('recuperação responde igual com ou sem compra e só envia para compradores', async () => {
    const c = new Client(app);
    const { order } = await reachPix(c, 'bia@example.com');
    const rid = await lastResourceId(app, order.order_id);
    fakeStore.setStatus(rid, 'paid');
    await fakeWebhook(app, rid);
    sentEmails.length = 0;
    const a = await new Client(app).req('POST', '/api/access/recover', { email: 'BIA@example.com' });
    const b = await new Client(app).req('POST', '/api/access/recover', { email: 'ninguem@example.com' });
    expect(a.body).toEqual(b.body);
    expect(sentEmails.map((m) => m.to)).toEqual(['bia@example.com']);
  });

  it('progresso, escolha e reflexão são salvos e validados', async () => {
    const c = new Client(app);
    const { resultId, order } = await reachPix(c);
    const rid = await lastResourceId(app, order.order_id);
    fakeStore.setStatus(rid, 'paid');
    await fakeWebhook(app, rid);
    const full = await c.req('GET', `/api/results/${resultId}/full`);
    const careerId = full.body.map.cards[1].careerId;
    expect((await c.req('PUT', '/api/progress', { result_id: resultId, career_id: careerId, day: 1, checked: true })).status).toBe(200);
    expect((await c.req('PUT', '/api/progress', { result_id: resultId, career_id: '99', day: 1, checked: true })).status).toBe(400);
    expect((await c.req('PUT', '/api/progress', { result_id: resultId, career_id: careerId, day: 8, checked: true })).status).toBe(400);
    expect((await c.req('PUT', '/api/reflection', { result_id: resultId, career_id: careerId, interest: 4, repeat_wish: 5, difficulty: 3, decision: 'explore_more' })).status).toBe(200);
    const again = await c.req('GET', `/api/results/${resultId}/full`);
    expect(again.body.selected_career_id).toBe(careerId);
    expect(again.body.progress).toEqual([{ career_id: careerId, day: 1, checked: true }]);
    expect(again.body.reflections[0].decision).toBe('explore_more');
    expect(await count(`select count(*) n from events where name in ('PlanStart','ResultAccess')`)).toBe(2);
  });

  it('novo teste não sobrescreve o mapa comprado', async () => {
    const c = new Client(app);
    const { resultId, order } = await reachPix(c);
    const rid = await lastResourceId(app, order.order_id);
    fakeStore.setStatus(rid, 'paid');
    await fakeWebhook(app, rid);
    await c.req('GET', `/api/orders/${order.order_id}/status`); // abre sessão de acesso
    await c.req('POST', '/api/quiz/sessions', {}); // novo teste
    await c.req('PUT', '/api/quiz/sessions/me', { answers: Object.fromEntries(Object.keys(analyticAnswers()).map((k) => [k, 3])), context: { moment: 'first', dailyTime: 15 } });
    await c.req('POST', '/api/results');
    expect((await c.req('GET', `/api/results/${resultId}/full`)).status).toBe(200);
  });
});

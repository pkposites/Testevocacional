import { describe, expect, it } from 'vitest';
import { loadConfig } from '../server/config';
import { hmacHex } from '../server/http';
import { createMercadoPago, mapMpOrder, normalizeMpStatus, verifyMpSignature } from '../server/payments/mercadopago';

const cfg = loadConfig({ APP_ENV: 'test', PAYMENT_PROVIDER: 'mercadopago', MP_ACCESS_TOKEN: 'TEST-token', MP_WEBHOOK_SECRET: 'segredo' });

const pixOrder = {
  id: 'ORD01JQ4S4KY8HWQ6NA5PXB65B3D3',
  type: 'online',
  external_reference: '11111111-2222-3333-4444-555555555555',
  status: 'action_required',
  status_detail: 'waiting_transfer',
  total_amount: '14.50',
  currency: 'BRL',
  user_id: '123456',
  transactions: {
    payments: [{
      id: 'PAY01', status: 'action_required', status_detail: 'waiting_transfer', amount: '14.50',
      date_of_expiration: '2026-10-02T12:30:00.000-03:00',
      payment_method: { id: 'pix', type: 'bank_transfer', qr_code: '00020126580014br.gov.bcb.pix...', qr_code_base64: 'iVBORw0KGgo=', ticket_url: 'https://www.mercadopago.com.br/payments/1/ticket' },
    }],
  },
};

describe('Mercado Pago Orders + Pix', () => {
  it('cria order com Pix, valor em string e chave de idempotência', async () => {
    let captured: { url: string; init: RequestInit } | undefined;
    const mp = createMercadoPago(cfg, (async (url: string, init: RequestInit) => {
      captured = { url, init };
      return new Response(JSON.stringify(pixOrder), { status: 201 });
    }) as any);
    const r = await mp.createCheckout({ orderId: pixOrder.external_reference, publicRef: 'MC-X', attempt: 1, amountCents: 1450, buyerEmail: 'a@b.com', buyerName: 'Ana', description: 'Mapa', attribution: {} });
    expect(captured!.url).toBe('https://api.mercadopago.com/v1/orders');
    const h = captured!.init.headers as Record<string, string>;
    expect(h.Authorization).toBe('Bearer TEST-token');
    expect(h['X-Idempotency-Key']).toBe(`${pixOrder.external_reference}-1`);
    const body = JSON.parse(String(captured!.init.body));
    expect(body.total_amount).toBe('14.50');
    expect(body.external_reference).toBe(pixOrder.external_reference);
    expect(body.transactions.payments[0]).toEqual({ amount: '14.50', payment_method: { id: 'pix', type: 'bank_transfer' }, expiration_time: 'PT30M' });
    expect(r.kind).toBe('pix');
    if (r.kind === 'pix') {
      expect(r.state.status).toBe('pending');
      expect(r.state.amountCents).toBe(1450);
      expect(r.state.pix?.qrCode).toMatch(/^000201/);
    }
  });

  it('normaliza estados; desconhecido nunca vira pago', () => {
    expect(normalizeMpStatus({ status: 'processed', status_detail: 'accredited' })).toBe('paid');
    expect(normalizeMpStatus({ status: 'action_required', status_detail: 'waiting_transfer' })).toBe('pending');
    expect(normalizeMpStatus({ status: 'expired' })).toBe('expired');
    expect(normalizeMpStatus({ status: 'canceled' })).toBe('cancelled');
    expect(normalizeMpStatus({ status: 'refunded' })).toBe('refunded');
    expect(normalizeMpStatus({ status: 'processed', status_detail: 'partially_refunded' })).toBe('refunded');
    expect(normalizeMpStatus({ status: 'charged_back' })).toBe('disputed');
    expect(normalizeMpStatus({ status: 'failed' })).toBe('rejected');
    expect(normalizeMpStatus({ status: 'algo_novo' })).toBe('pending');
    expect(normalizeMpStatus({ status: 'processed', status_detail: 'in_review' })).toBe('pending');
  });

  it('mapeia order paga', () => {
    const st = mapMpOrder({ ...pixOrder, status: 'processed', status_detail: 'accredited' });
    expect(st).toMatchObject({ status: 'paid', amountCents: 1450, currency: 'BRL', collectorId: '123456', externalReference: pixOrder.external_reference });
  });

  it('assinatura x-signature (HMAC-SHA256 do manifesto)', () => {
    const ts = '1704908010';
    const manifest = `id:ord01jq4s4ky8hwq6na5pxb65b3d3;request-id:req-1;ts:${ts};`;
    const v1 = hmacHex('sha256', 'segredo', manifest);
    expect(verifyMpSignature({ secret: 'segredo', xSignature: `ts=${ts},v1=${v1}`, xRequestId: 'req-1', dataId: 'ORD01JQ4S4KY8HWQ6NA5PXB65B3D3' })).toBe(true);
    expect(verifyMpSignature({ secret: 'outro', xSignature: `ts=${ts},v1=${v1}`, xRequestId: 'req-1', dataId: 'ORD01JQ4S4KY8HWQ6NA5PXB65B3D3' })).toBe(false);
    expect(verifyMpSignature({ secret: 'segredo', xSignature: `ts=${ts},v1=${v1}`, xRequestId: 'req-2', dataId: 'ORD01JQ4S4KY8HWQ6NA5PXB65B3D3' })).toBe(false);
    expect(verifyMpSignature({ secret: 'segredo', xSignature: null, xRequestId: 'req-1', dataId: 'x' })).toBe(false);
  });

  it('webhook: usa data.id da query e só aceita tópico order', async () => {
    const mp = createMercadoPago(cfg, fetch);
    const ts = '1704908010';
    const v1 = hmacHex('sha256', 'segredo', `id:ord01abc;request-id:r1;ts:${ts};`);
    const req = new Request('https://x/api/webhooks/mercadopago?data.id=ORD01ABC&type=order', {
      method: 'POST', headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': 'r1' },
    });
    const p = await mp.verifyWebhook(req, '{"action":"order.processed","type":"order","data":{"id":"ORD01ABC"}}', new URL(req.url));
    expect(p).toMatchObject({ valid: true, eventKey: 'r1', resourceId: 'ORD01ABC' });
    const other = new Request('https://x/api/webhooks/mercadopago?data.id=123&type=payment', { method: 'POST' });
    const q = await mp.verifyWebhook(other, '{}', new URL(other.url));
    expect(q.valid).toBe(false);
    expect(q.resourceId).toBeUndefined();
  });

  it('falha de rede vira erro de provedor, não recusa financeira', async () => {
    const mp = createMercadoPago(cfg, (async () => {
      throw new TypeError('fetch failed');
    }) as any);
    await expect(mp.fetchState('ORD1')).rejects.toThrow(/Falha de rede/);
  });

  it('produção exige credenciais e bloqueia provedor fake', () => {
    expect(() => loadConfig({ APP_ENV: 'production', PAYMENT_PROVIDER: 'fake', PUBLIC_BASE_URL: 'https://a.b', APP_SECRET: 'x'.repeat(40), DATABASE_URL: 'postgres://x' })).toThrow();
    expect(() => loadConfig({ APP_ENV: 'production', PAYMENT_PROVIDER: 'mercadopago', PUBLIC_BASE_URL: 'https://a.b', APP_SECRET: 'x'.repeat(40), DATABASE_URL: 'postgres://x' })).toThrow(/MP_ACCESS_TOKEN/);
  });
});

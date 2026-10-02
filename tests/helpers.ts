import { QUESTIONS } from '../shared/quiz';
import { handle } from '../server/app';
import { loadConfig } from '../server/config';
import { createPgliteDb } from '../server/db';
import { createMessageSender, sentMessages } from '../server/whatsapp';
import { hmacHex } from '../server/http';
import { createProvider } from '../server/payments';
import { fakeStore } from '../server/payments/fake';
import type { App } from '../server/services';

export const BASE = 'http://localhost:5173';

export async function makeApp(env: Record<string, string> = {}): Promise<App> {
  const cfg = loadConfig({ APP_ENV: 'test', PAYMENT_PROVIDER: 'fake', ADMIN_PASSWORD: 'adm', PUBLIC_BASE_URL: BASE, ...env });
  sentMessages.length = 0;
  fakeStore.reset();
  return { cfg, db: await createPgliteDb(), provider: createProvider(cfg), messages: createMessageSender(cfg), fetchImpl: fetch };
}

/** Cliente HTTP com "pote de cookies", como um navegador. */
export class Client {
  jar = new Map<string, string>();
  constructor(public app: App) {}
  async req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const h = new Headers({ 'content-type': 'application/json', ...headers });
    if (this.jar.size) h.set('cookie', [...this.jar].map(([k, v]) => `${k}=${v}`).join('; '));
    const res = await handle(this.app, new Request(BASE + path, { method, headers: h, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) }));
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(';');
      const i = kv.indexOf('=');
      const k = kv.slice(0, i);
      const v = kv.slice(i + 1);
      if (/Max-Age=0/.test(c)) this.jar.delete(k);
      else this.jar.set(k, v);
    }
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }
}

export const analyticAnswers = () =>
  Object.fromEntries(QUESTIONS.map((q) => [q.id, q.dimension === 'A' || q.dimension === 'O' ? 5 : q.dimension === 'C' ? 2 : 1]));

/** Leva um cliente do início até o Pix gerado. */
export async function reachPix(c: Client, phone = '(11) 98765-4321') {
  await c.req('POST', '/api/quiz/sessions', { attribution: { utm_source: 'meta', utm_campaign: 't1' } });
  await c.req('PUT', '/api/quiz/sessions/me', { answers: analyticAnswers(), context: { moment: 'change', dailyTime: 30 } });
  const r = await c.req('POST', '/api/results');
  const o = await c.req('POST', '/api/orders', { result_id: r.body.result_id, buyer_name: 'Ana', buyer_phone: phone }, { 'idempotency-key': `k-${Math.random()}` });
  return { resultId: r.body.result_id as string, order: o.body };
}

export function fakeWebhook(app: App, resourceId: string, eventId = `e-${Math.random()}`) {
  const raw = JSON.stringify({ event_id: eventId, data: { id: resourceId } });
  return handle(app, new Request(BASE + '/api/webhooks/fake', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-fake-signature': hmacHex('sha256', app.cfg.appSecret, raw) },
    body: raw,
  }));
}

export async function lastResourceId(app: App, orderId: string) {
  const rows = await app.db.query('select provider_resource_id from payments where order_id = $1 order by created_at desc', [orderId]);
  return rows[0].provider_resource_id as string;
}

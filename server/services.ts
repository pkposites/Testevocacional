import type { AppConfig } from './config';
import { one, type Db } from './db';
import { accessEmail, type EmailSender } from './email';
import { newToken, sha256 } from './http';
import type { PaymentProvider } from './payments/types';
import { applyProviderState, type ApplyResult } from './reconcile';

export type App = {
  db: Db;
  cfg: AppConfig;
  provider: PaymentProvider;
  sendEmail: EmailSender;
  fetchImpl: typeof fetch;
};

/** Limite simples por janela fixa, persistido no banco (funções serverless não compartilham memória). */
export async function rateLimit(db: Db, key: string, limit: number, windowSec: number): Promise<boolean> {
  const row = await one<{ count: number }>(
    db,
    `insert into rate_limits (key, window_start, count) values ($1, now(), 1)
     on conflict (key) do update set
       count = case when rate_limits.window_start < now() - ($2 || ' seconds')::interval then 1 else rate_limits.count + 1 end,
       window_start = case when rate_limits.window_start < now() - ($2 || ' seconds')::interval then now() else rate_limits.window_start end
     returning count`,
    [key, String(windowSec)],
  );
  return (row?.count ?? 0) <= limit;
}

export async function issueAccessToken(db: Db, email: string, purpose: 'purchase' | 'recover', ttlMinutes: number): Promise<string> {
  const token = newToken();
  await db.query(
    `insert into access_tokens (token_hash, buyer_email, purpose, expires_at) values ($1,$2,$3, now() + ($4 || ' minutes')::interval)`,
    [sha256(token), email, purpose, String(ttlMinutes)],
  );
  return token;
}

function ttlText(minutes: number) {
  if (minutes < 120) return `${minutes} minutos`;
  const h = Math.round(minutes / 60);
  return h % 24 === 0 ? `${h / 24} dias` : `${h} horas`;
}

/** Envia e-mails pendentes (de um pedido ou todos). Falha não desfaz a compra: fica registrada para reenvio. */
export async function drainOutbox(app: App, orderId?: string): Promise<void> {
  const rows = await app.db.query(
    `select e.*, o.buyer_name from email_outbox e left join orders o on o.id = e.order_id
     where e.status in ('pending','failed') and e.attempts < 5 ${orderId ? 'and e.order_id = $1' : ''} order by e.created_at limit 20`,
    orderId ? [orderId] : [],
  );
  for (const r of rows) {
    const claimed = await one(app.db, `update email_outbox set attempts = attempts + 1 where id = $1 and status <> 'sent' and attempts = $2 returning id`, [r.id, r.attempts]);
    if (!claimed) continue;
    try {
      const minutes = app.cfg.purchaseLinkTtlHours * 60;
      const token = await issueAccessToken(app.db, r.to_email, 'purchase', minutes);
      const link = `${app.cfg.publicBaseUrl}/acesso?t=${encodeURIComponent(token)}`;
      const msg = accessEmail({ name: r.buyer_name, link, kind: 'purchase', support: app.cfg.supportContact, ttlText: ttlText(minutes) });
      await app.sendEmail({ to: r.to_email, ...msg });
      await app.db.query(`update email_outbox set status = 'sent', sent_at = now(), last_error = null where id = $1`, [r.id]);
    } catch (e) {
      await app.db.query(`update email_outbox set status = 'failed', last_error = $2 where id = $1`, [r.id, String((e as Error).message).slice(0, 300)]);
    }
  }
}

/** Purchase via API de Conversões (opcional). Sem e-mail, nome ou respostas: só IP/UA/fbp/fbc. */
export async function sendMetaPurchase(app: App, orderId: string): Promise<void> {
  const { pixelId, capiToken, testEventCode } = app.cfg.meta;
  if (!pixelId || !capiToken) return;
  const o = await one(app.db, `select * from orders where id = $1`, [orderId]);
  if (!o) return;
  const a = (o.attribution ?? {}) as Record<string, string>;
  if (a.consent !== 'granted') return; // respeita a escolha de rastreamento
  const body: any = {
    data: [
      {
        event_name: 'Purchase',
        event_time: Math.floor(new Date(o.paid_at ?? Date.now()).getTime() / 1000),
        event_id: `purchase_${o.id}`,
        action_source: 'website',
        event_source_url: `${app.cfg.publicBaseUrl}/`,
        user_data: { client_ip_address: a.ip, client_user_agent: a.ua, fbp: a.fbp, fbc: a.fbc },
        custom_data: { currency: 'BRL', value: o.amount_cents / 100 },
      },
    ],
  };
  if (testEventCode) body.test_event_code = testEventCode;
  try {
    await app.fetchImpl(`https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${encodeURIComponent(capiToken)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
  } catch (e) {
    console.error('Meta CAPI falhou', (e as Error).message);
  }
}

export async function afterApply(app: App, r: ApplyResult) {
  if (r.released && r.orderId) {
    await drainOutbox(app, r.orderId);
    await sendMetaPurchase(app, r.orderId);
  }
}

/** Consulta o recurso no provedor e aplica. Usado por webhook, retorno do cliente (com limite) e admin. */
export async function reconcilePayment(app: App, resourceId: string): Promise<ApplyResult | null> {
  const st = await app.provider.fetchState(resourceId);
  if (!st) return null;
  const r = await applyProviderState(app.db, app.cfg, app.provider.name, st);
  await afterApply(app, r);
  return r;
}

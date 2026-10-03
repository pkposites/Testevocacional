import type { AppConfig } from './config';
import { one, type Db } from './db';
import { eventIds, META_EVENT_NAMES, type MetaEventKey } from '../shared/events';
import type { MessageSender } from './whatsapp';
import { hmacHex, newToken, sha256 } from './http';
import type { PaymentProvider } from './payments/types';
import { applyProviderState, type ApplyResult } from './reconcile';
import { notifyAdmins } from './push';

export type App = {
  db: Db;
  cfg: AppConfig;
  provider: PaymentProvider;
  messages: MessageSender;
  fetchImpl: typeof fetch;
};

/** Pedidos do Diagnóstico usam o prefixo DG- (o mapa usa MC-); mesma tabela, sem mudar o esquema. */
export const DIAGNOSTIC_PREFIX = 'DG-';
export const isDiagnosticRef = (ref: unknown) => typeof ref === 'string' && ref.startsWith(DIAGNOSTIC_PREFIX);
/** Filtro SQL: só pedidos do mapa (alias opcional da tabela orders). */
export const MAP_ONLY = (alias = '') => `${alias ? alias + '.' : ''}public_ref not like 'DG-%'`;

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

export async function issueAccessToken(db: Db, phone: string, purpose: 'purchase' | 'recover', ttlMinutes: number): Promise<string> {
  const token = newToken();
  await db.query(
    `insert into access_tokens (token_hash, buyer_phone, purpose, expires_at) values ($1,$2,$3, now() + ($4 || ' minutes')::interval)`,
    [sha256(token), phone, purpose, String(ttlMinutes)],
  );
  return token;
}

/** Link de acesso de uso único para o comprador. */
export async function accessLink(app: App, phone: string, purpose: 'purchase' | 'recover', ttlMinutes = app.cfg.purchaseLinkTtlHours * 60) {
  const token = await issueAccessToken(app.db, phone, purpose, ttlMinutes);
  return `${app.cfg.publicBaseUrl}/acesso?t=${encodeURIComponent(token)}`;
}

/** Envia mensagens pendentes (de um pedido ou todas). Falha não desfaz a compra: fica registrada para reenvio. */
export async function drainOutbox(app: App, orderId?: string): Promise<void> {
  if (!app.messages.enabled) return; // sem API de WhatsApp: o admin envia pelo próprio WhatsApp
  const rows = await app.db.query(
    `select m.*, o.buyer_name, o.public_ref from message_outbox m left join orders o on o.id = m.order_id
     where m.status in ('pending','failed') and m.attempts < 5 ${orderId ? 'and m.order_id = $1' : ''} order by m.created_at limit 20`,
    orderId ? [orderId] : [],
  );
  for (const r of rows) {
    const claimed = await one(app.db, `update message_outbox set attempts = attempts + 1 where id = $1 and status <> 'sent' and attempts = $2 returning id`, [r.id, r.attempts]);
    if (!claimed) continue;
    try {
      const link = await accessLink(app, r.to_phone, 'purchase');
      await app.messages.send({ to: r.to_phone, name: String(r.buyer_name ?? '').split(' ')[0], link, kind: r.kind === 'free' ? 'free' : isDiagnosticRef(r.public_ref) ? 'diagnostic' : 'purchase' });
      await app.db.query(`update message_outbox set status = 'sent', sent_at = now(), last_error = null where id = $1`, [r.id]);
    } catch (e) {
      await app.db.query(`update message_outbox set status = 'failed', last_error = $2 where id = $1`, [r.id, String((e as Error).message).slice(0, 300)]);
    }
  }
}

/**
 * Evento para a API de Conversões (opcional, com META_PIXEL_ID + META_CAPI_TOKEN). Usa o mesmo event_id do
 * navegador para a Meta deduplicar. Sem telefone, nome ou respostas: só IP/UA/fbp/fbc, e só com consentimento.
 */
export async function sendMetaEvent(
  app: App,
  e: { key: MetaEventKey; eventId: string; attribution: Record<string, string> | null | undefined; valueCents?: number; at?: Date | string | null },
): Promise<void> {
  const { pixelId, capiToken, testEventCode, relayUrl, relaySecret } = app.cfg.meta;
  const viaRelay = !!(relayUrl && relaySecret);
  if (!viaRelay && !(pixelId && capiToken)) return;
  const a = e.attribution ?? {};
  if (a.consent !== 'granted') return; // respeita a escolha de rastreamento
  const data: any = {
    event_name: META_EVENT_NAMES[e.key],
    event_time: Math.floor(new Date(e.at ?? Date.now()).getTime() / 1000),
    event_id: e.eventId,
    action_source: 'website',
    event_source_url: `${app.cfg.publicBaseUrl}/`,
    user_data: { client_ip_address: a.ip, client_user_agent: a.ua, fbp: a.fbp, fbc: a.fbc },
  };
  if (e.valueCents !== undefined) data.custom_data = { currency: 'BRL', value: e.valueCents / 100 };
  const body: any = { data: [data] };
  if (testEventCode) body.test_event_code = testEventCode;
  const raw = JSON.stringify(body);
  try {
    if (viaRelay) {
      // O token fica no Worker; aqui só assinamos o pedido.
      const ts = String(Math.floor(Date.now() / 1000));
      const res = await app.fetchImpl(`${relayUrl}/meta/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-mc-timestamp': ts, 'x-mc-signature': hmacHex('sha256', relaySecret!.trim(), `${ts}.${raw}`) },
        body: raw,
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) console.error('Meta CAPI (Worker) recusou', res.status, (await res.text()).slice(0, 300));
    } else {
      await app.fetchImpl(`https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${encodeURIComponent(capiToken!)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: raw,
        signal: AbortSignal.timeout(5000),
      });
    }
  } catch (err) {
    console.error('Meta CAPI falhou', (err as Error).message);
  }
}

export async function sendMetaPurchase(app: App, orderId: string): Promise<void> {
  const o = await one(app.db, `select * from orders where id = $1`, [orderId]);
  if (!o || o.amount_cents <= 0) return;
  await sendMetaEvent(app, { key: 'Purchase', eventId: eventIds.purchase(o.id), attribution: o.attribution, valueCents: o.amount_cents, at: o.paid_at });
}

export async function afterApply(app: App, r: ApplyResult) {
  if (r.released && r.orderId) {
    await drainOutbox(app, r.orderId);
    await sendMetaPurchase(app, r.orderId);
    const o = await one(app.db, 'select buyer_name, amount_cents, public_ref from orders where id = $1', [r.orderId]);
    if (o && o.amount_cents > 0) {
      const brl = (o.amount_cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      await notifyAdmins(app, { title: `💰 Venda: ${brl}`, body: `${String(o.buyer_name).split(' ')[0]} comprou (${o.public_ref}).`, url: '/admin', tag: `sale-${r.orderId}` });
    }
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

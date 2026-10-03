// Notificações push para o painel admin instalado como app (iPhone/Android/desktop).
// As chaves VAPID ficam nas variáveis do Netlify; a inscrição de cada aparelho fica no banco.
import webpush from 'web-push';
import type { App } from './services';

let tableReady = false;
async function ensureTable(app: App) {
  if (tableReady) return;
  await app.db.query(`create table if not exists push_subscriptions (
    endpoint text primary key,
    keys jsonb not null,
    created_at timestamptz not null default now()
  )`);
  tableReady = true;
}

export const pushEnabled = (app: App) => !!(app.cfg.push.publicKey && app.cfg.push.privateKey);

export async function savePushSubscription(app: App, sub: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }) {
  const endpoint = typeof sub?.endpoint === 'string' ? sub.endpoint : '';
  const p256dh = typeof sub?.keys?.p256dh === 'string' ? sub.keys.p256dh : '';
  const auth = typeof sub?.keys?.auth === 'string' ? sub.keys.auth : '';
  if (!/^https:\/\/\S{10,1000}$/.test(endpoint) || !p256dh || !auth) return false;
  await ensureTable(app);
  await app.db.query(
    `insert into push_subscriptions (endpoint, keys) values ($1, $2::jsonb) on conflict (endpoint) do update set keys = excluded.keys`,
    [endpoint, JSON.stringify({ p256dh, auth })],
  );
  return true;
}

export async function removePushSubscription(app: App, endpoint: string) {
  await ensureTable(app);
  await app.db.query('delete from push_subscriptions where endpoint = $1', [endpoint]);
}

/** Envia para todos os aparelhos inscritos. Nunca derruba a requisição que disparou (lead, venda). */
export async function notifyAdmins(app: App, msg: { title: string; body: string; url?: string; tag?: string }): Promise<number> {
  if (!pushEnabled(app)) return 0;
  try {
    await ensureTable(app);
    const subs = await app.db.query('select endpoint, keys from push_subscriptions');
    if (!subs.length) return 0;
    const payload = JSON.stringify({ title: msg.title, body: msg.body, url: msg.url ?? '/admin', tag: msg.tag });
    const opts = {
      vapidDetails: { subject: app.cfg.push.subject, publicKey: app.cfg.push.publicKey!, privateKey: app.cfg.push.privateKey! },
      TTL: 3600,
      timeout: 4000,
    };
    let sent = 0;
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload, opts);
        sent++;
      } catch (e: any) {
        // Aparelho desinstalou ou revogou: remove a inscrição.
        if (e?.statusCode === 404 || e?.statusCode === 410) await removePushSubscription(app, s.endpoint).catch(() => undefined);
        else console.error('push falhou', e?.statusCode ?? '', String(e?.message ?? e).slice(0, 200));
      }
    }));
    return sent;
  } catch (e) {
    console.error('push indisponível', (e as Error).message);
    return 0;
  }
}

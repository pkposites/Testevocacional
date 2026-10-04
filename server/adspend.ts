// Gasto diário em anúncios (Meta), enviado pela rotina de acompanhamento a cada 3 h.
// Um registro por dia e campanha: cada envio substitui o valor do dia (o gasto do dia só cresce).
import type { App } from './services';
import type { Db } from './db';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Por banco (os testes abrem um banco novo por app).
const ready = new WeakSet<object>();

async function ensureTable(db: Db) {
  if (ready.has(db)) return;
  await db.query(`create table if not exists ad_spend (
    day date not null,
    campaign_id text not null,
    campaign_name text not null default '',
    spend_cents integer not null default 0,
    updated_at timestamptz not null default now(),
    primary key (day, campaign_id)
  )`);
  ready.add(db);
}

export type SpendInput = { id?: unknown; name?: unknown; spend?: unknown; spend_cents?: unknown };

export async function saveAdSpend(app: App, day: unknown, campaigns: unknown): Promise<number> {
  if (typeof day !== 'string' || !DATE_RE.test(day)) return -1;
  if (!Array.isArray(campaigns) || campaigns.length === 0 || campaigns.length > 50) return -1;
  const rows: { id: string; name: string; cents: number }[] = [];
  for (const c of campaigns as SpendInput[]) {
    const id = typeof c?.id === 'string' ? c.id.trim().slice(0, 64) : '';
    const cents = c?.spend_cents !== undefined ? Number(c.spend_cents) : Math.round(Number(c?.spend) * 100);
    if (!id || !Number.isFinite(cents) || cents < 0 || cents > 100_000_000) return -1;
    rows.push({ id, name: typeof c.name === 'string' ? c.name.slice(0, 200) : '', cents: Math.round(cents) });
  }
  await ensureTable(app.db);
  for (const r of rows) {
    await app.db.query(
      `insert into ad_spend (day, campaign_id, campaign_name, spend_cents, updated_at) values ($1, $2, $3, $4, now())
       on conflict (day, campaign_id) do update set campaign_name = excluded.campaign_name, spend_cents = excluded.spend_cents, updated_at = now()`,
      [day, r.id, r.name, r.cents],
    );
  }
  return rows.length;
}

export async function adSpendForRange(db: Db, from: string, to: string) {
  await ensureTable(db);
  const rows = await db.query(
    `select campaign_id, max(campaign_name) as name, sum(spend_cents)::int as cents, max(updated_at) as updated_at
     from ad_spend where day between $1::date and $2::date group by campaign_id order by 3 desc`,
    [from, to],
  );
  const cents = rows.reduce((s, r) => s + Number(r.cents), 0);
  const updated = rows.map((r) => new Date(r.updated_at).getTime()).sort((a, b) => b - a)[0];
  return {
    cents,
    updated_at: updated ? new Date(updated).toISOString() : null,
    campaigns: rows.map((r) => ({ id: r.campaign_id, name: r.name, cents: Number(r.cents) })),
  };
}

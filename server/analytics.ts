// Painel de análise: números agregados por período (fuso de Brasília). Nada de dados pessoais.
import { QUESTIONS } from '../shared/quiz';
import type { Db } from './db';

const TZ = 'America/Sao_Paulo';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type Range = { from: string; to: string }; // datas locais, inclusivas

export function parseRange(from: string | null, to: string | null): Range {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  const f = from && DATE_RE.test(from) ? from : today;
  const t = to && DATE_RE.test(to) ? to : today;
  return f <= t ? { from: f, to: t } : { from: t, to: f };
}

const n = (v: unknown) => Number(v ?? 0);

export async function buildAnalytics(db: Db, range: Range) {
  // [$1, $2): meia-noite local do primeiro dia até a meia-noite seguinte ao último.
  const bounds = `($1::date::timestamp at time zone '${TZ}')`;
  const boundsEnd = `(($2::date + 1)::timestamp at time zone '${TZ}')`;
  const p = [range.from, range.to];

  const eventRows = await db.query(
    `select name, count(*)::int as total, count(distinct coalesce(session_id::text, order_id::text, event_id))::int as uniq
     from events where ts >= ${bounds} and ts < ${boundsEnd} group by name`,
    p,
  );
  const ev = (name: string, k: 'total' | 'uniq' = 'uniq') => n(eventRows.find((r) => r.name === name)?.[k]);

  const qCols = QUESTIONS.map((q) => `count(*) filter (where jsonb_exists(s.answers, '${q.id}'))::int as "${q.id}"`).join(', ');
  const quiz = (await db.query(
    `select count(*)::int as sessions,
       count(*) filter (where s.answers <> '{}'::jsonb)::int as started,
       ${qCols},
       count(*) filter (where jsonb_exists(s.context, 'moment') and jsonb_exists(s.context, 'dailyTime'))::int as context_done,
       count(*) filter (where exists (select 1 from results r where r.session_id = s.id))::int as with_result
     from quiz_sessions s where s.created_at >= ${bounds} and s.created_at < ${boundsEnd}`,
    p,
  ))[0];

  const minutesToResult = (await db.query(
    `select percentile_cont(0.5) within group (order by extract(epoch from (r.first_at - s.created_at)) / 60) as med
     from quiz_sessions s join (select session_id, min(created_at) as first_at from results group by session_id) r on r.session_id = s.id
     where s.created_at >= ${bounds} and s.created_at < ${boundsEnd}`,
    p,
  ))[0]?.med;

  const daily = await db.query(
    `with days as (select to_char(d, 'YYYY-MM-DD') as day from generate_series($1::date, $2::date, interval '1 day') d),
     e as (select to_char((ts at time zone '${TZ}')::date, 'YYYY-MM-DD') as day, name,
             count(distinct coalesce(session_id::text, order_id::text, event_id))::int as c
           from events where ts >= ${bounds} and ts < ${boundsEnd} group by 1, 2),
     o as (select to_char((paid_at at time zone '${TZ}')::date, 'YYYY-MM-DD') as day, sum(amount_cents)::int as revenue
           from orders where paid_at >= ${bounds} and paid_at < ${boundsEnd} and status in ('paid','refunded','disputed') group by 1)
     select d.day,
       coalesce((select c from e where e.day = d.day and name = 'PageView'), 0) as visits,
       coalesce((select c from e where e.day = d.day and name = 'GameStart'), 0) as started,
       coalesce((select c from e where e.day = d.day and name = 'GameComplete'), 0) as completed,
       coalesce((select c from e where e.day = d.day and name = 'InitiateCheckout'), 0) as checkouts,
       coalesce((select c from e where e.day = d.day and name = 'Purchase'), 0) as purchases,
       coalesce(o.revenue, 0) as revenue_cents
     from days d left join o on o.day = d.day order by d.day`,
    p,
  );

  const orders = (await db.query(
    `select count(*)::int as created,
       count(*) filter (where exists (select 1 from payments pp where pp.order_id = o.id))::int as pix_generated,
       count(*) filter (where o.status in ('paid','refunded','disputed'))::int as paid,
       count(*) filter (where o.status in ('expired','cancelled'))::int as expired,
       count(*) filter (where o.status in ('refunded','disputed'))::int as refunded,
       percentile_cont(0.5) within group (order by extract(epoch from (o.paid_at - o.created_at)) / 60)
         filter (where o.paid_at is not null) as med_minutes_to_pay
     from orders o where o.created_at >= ${bounds} and o.created_at < ${boundsEnd}`,
    p,
  ))[0];

  const revenue = (await db.query(
    `select coalesce(sum(amount_cents) filter (where status = 'paid'), 0)::int as net_cents,
       coalesce(sum(amount_cents), 0)::int as gross_cents, count(*)::int as purchases
     from orders where paid_at >= ${bounds} and paid_at < ${boundsEnd} and status in ('paid','refunded','disputed')`,
    p,
  ))[0];

  const sources = await db.query(
    `with s as (
       select id, answers,
         coalesce(nullif(attribution->>'utm_content', ''), nullif(attribution->>'utm_source', ''), '(sem UTM / direto)') as source,
         coalesce(attribution->>'utm_term', '') as adset
       from quiz_sessions where created_at >= ${bounds} and created_at < ${boundsEnd}),
     r as (select distinct session_id from results),
     o as (select session_id, count(*)::int as orders,
             count(*) filter (where status in ('paid','refunded','disputed'))::int as paid,
             coalesce(sum(amount_cents) filter (where status = 'paid'), 0)::int as revenue
           from orders group by session_id)
     select s.source, s.adset, count(*)::int as sessions,
       count(*) filter (where s.answers <> '{}'::jsonb)::int as started,
       count(r.session_id)::int as completed,
       coalesce(sum(o.orders), 0)::int as orders,
       coalesce(sum(o.paid), 0)::int as paid,
       coalesce(sum(o.revenue), 0)::int as revenue_cents
     from s left join r on r.session_id = s.id left join o on o.session_id = s.id
     group by 1, 2 order by sessions desc limit 30`,
    p,
  );

  const profile = {
    moments: await db.query(
      `select coalesce(context->>'moment', '(sem)') as key, count(*)::int as c from results
       where created_at >= ${bounds} and created_at < ${boundsEnd} group by 1 order by c desc`, p),
    dailyTime: await db.query(
      `select coalesce(context->>'dailyTime', '(sem)') as key, count(*)::int as c from results
       where created_at >= ${bounds} and created_at < ${boundsEnd} group by 1 order by c desc`, p),
    preferences: await db.query(
      `select (snapshot->'summary'->'topDimensions'->0->>'label') || ' + ' || (snapshot->'summary'->'topDimensions'->1->>'label') as key,
         count(*)::int as c,
         count(*) filter (where (snapshot->>'broadProfile')::boolean)::int as broad
       from results where created_at >= ${bounds} and created_at < ${boundsEnd} group by 1 order by c desc limit 10`, p),
    topCareer: await db.query(
      `select r.snapshot->'cards'->0->>'name' as key, count(*)::int as c,
         count(o.id) filter (where o.status in ('paid','refunded','disputed'))::int as paid
       from results r left join orders o on o.result_id = r.id
       where r.created_at >= ${bounds} and r.created_at < ${boundsEnd} group by 1 order by c desc`, p),
    broad: n((await db.query(
      `select count(*) filter (where (snapshot->>'broadProfile')::boolean)::int as c from results
       where created_at >= ${bounds} and created_at < ${boundsEnd}`, p))[0]?.c),
  };

  const delivery = (await db.query(
    `select count(*)::int as entitlements,
       count(*) filter (where first_access_at is not null)::int as accessed,
       count(*) filter (where exists (select 1 from progress g where g.entitlement_id = e.id and g.checked))::int as plan_started,
       count(*) filter (where (select count(*) from progress g where g.entitlement_id = e.id and g.checked) >= 7)::int as plan_done,
       coalesce(avg((select count(*) from progress g where g.entitlement_id = e.id and g.checked)), 0)::float as avg_days
     from entitlements e where e.created_at >= ${bounds} and e.created_at < ${boundsEnd}`,
    p,
  ))[0];
  const decisions = await db.query(
    `select decision as key, count(*)::int as c from reflections f join entitlements e on e.id = f.entitlement_id
     where e.created_at >= ${bounds} and e.created_at < ${boundsEnd} and decision is not null group by 1 order by c desc`,
    p,
  );

  const consent = await db.query(
    `select consent_state as key, count(*)::int as c from events
     where name = 'PageView' and ts >= ${bounds} and ts < ${boundsEnd} group by 1`,
    p,
  );

  const started = n(quiz.started);
  return {
    range,
    funnel: [
      { key: 'visits', label: 'Visitas na página inicial', value: ev('PageView', 'total') },
      { key: 'started', label: 'Começaram o teste', value: started },
      { key: 'completed', label: 'Terminaram as 12 perguntas', value: n(quiz.Q12) },
      { key: 'result', label: 'Viram a prévia', value: n(quiz.with_result) },
      { key: 'checkout_click', label: 'Clicaram em desbloquear', value: ev('CheckoutClick') },
      { key: 'pix', label: 'Geraram o Pix', value: n(orders.pix_generated) },
      { key: 'paid', label: 'Pagaram', value: n(orders.paid) },
    ],
    questions: [
      ...QUESTIONS.map((q, i) => ({ key: q.id, label: `P${i + 1}`, text: q.text, value: n(quiz[q.id]) })),
      { key: 'context', label: 'Contexto', text: 'Momento de carreira e tempo por dia', value: n(quiz.context_done) },
      { key: 'result', label: 'Prévia', text: 'Resultado calculado e prévia exibida', value: n(quiz.with_result) },
    ],
    quiz: { sessions: n(quiz.sessions), started, medianMinutesToResult: minutesToResult == null ? null : Number(minutesToResult) },
    daily: daily.map((d) => ({
      day: d.day, visits: n(d.visits), started: n(d.started), completed: n(d.completed),
      checkouts: n(d.checkouts), purchases: n(d.purchases), revenueCents: n(d.revenue_cents),
    })),
    orders: {
      created: n(orders.created), pixGenerated: n(orders.pix_generated), paid: n(orders.paid), expired: n(orders.expired),
      refunded: n(orders.refunded), medianMinutesToPay: orders.med_minutes_to_pay == null ? null : Number(orders.med_minutes_to_pay),
    },
    revenue: { grossCents: n(revenue.gross_cents), netCents: n(revenue.net_cents), purchases: n(revenue.purchases) },
    sources: sources.map((s) => ({
      source: s.source, adset: s.adset, sessions: n(s.sessions), started: n(s.started), completed: n(s.completed),
      orders: n(s.orders), paid: n(s.paid), revenueCents: n(s.revenue_cents),
    })),
    profile,
    delivery: { ...delivery, avg_days: Number(delivery.avg_days ?? 0), decisions },
    consent,
  };
}

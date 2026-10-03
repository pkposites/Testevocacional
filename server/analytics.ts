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

// Testes feitos no aparelho do admin (marcados como internos) não entram nos números.
const S_OK = (a = '') => `coalesce(${a}attribution->>'internal', '') <> '1'`;
const R_OK = (a = '') => `${a}session_id not in (select id from quiz_sessions where attribution->>'internal' = '1')`;
const O_OK = S_OK;

export async function buildAnalytics(db: Db, range: Range, mode: 'free' | 'paid' = 'paid') {
  // [$1, $2): meia-noite local do primeiro dia até a meia-noite seguinte ao último.
  const bounds = `($1::date::timestamp at time zone '${TZ}')`;
  const boundsEnd = `(($2::date + 1)::timestamp at time zone '${TZ}')`;
  const p = [range.from, range.to];

  const eventRowsP = db.query(
    `select name, count(*)::int as total, count(distinct coalesce(session_id::text, order_id::text, event_id))::int as uniq
     from events where ts >= ${bounds} and ts < ${boundsEnd} group by name`,
    p,
  );

  const qCols = QUESTIONS.map((q) => `count(*) filter (where jsonb_exists(s.answers, '${q.id}'))::int as "${q.id}"`).join(', ');
  const quizP = db.query(
    `select count(*)::int as sessions,
       count(*) filter (where s.answers <> '{}'::jsonb)::int as started,
       ${qCols},
       count(*) filter (where jsonb_exists(s.context, 'moment') and jsonb_exists(s.context, 'dailyTime'))::int as context_done,
       count(*) filter (where exists (select 1 from results r where r.session_id = s.id))::int as with_result
     from quiz_sessions s where s.created_at >= ${bounds} and s.created_at < ${boundsEnd} and ${S_OK('s.')}`,
    p,
  ).then((r) => r[0]);

  const minutesToResultP = db.query(
    `select percentile_cont(0.5) within group (order by extract(epoch from (r.first_at - s.created_at)) / 60) as med
     from quiz_sessions s join (select session_id, min(created_at) as first_at from results group by session_id) r on r.session_id = s.id
     where s.created_at >= ${bounds} and s.created_at < ${boundsEnd} and ${S_OK('s.')}`,
    p,
  ).then((r) => r[0]?.med);

  const dailyP = db.query(
    `with days as (select to_char(d, 'YYYY-MM-DD') as day from generate_series($1::date, $2::date, interval '1 day') d),
     e as (select to_char((ts at time zone '${TZ}')::date, 'YYYY-MM-DD') as day, name,
             count(distinct coalesce(session_id::text, order_id::text, event_id))::int as c
           from events where ts >= ${bounds} and ts < ${boundsEnd} group by 1, 2),
     o as (select to_char((paid_at at time zone '${TZ}')::date, 'YYYY-MM-DD') as day, sum(amount_cents)::int as revenue
           from orders where paid_at >= ${bounds} and paid_at < ${boundsEnd} and status in ('paid','refunded','disputed') and amount_cents > 0 and ${O_OK()} group by 1)
     select d.day,
       coalesce((select c from e where e.day = d.day and name = 'PageView'), 0) as visits,
       coalesce((select c from e where e.day = d.day and name = 'GameStart'), 0) as started,
       coalesce((select c from e where e.day = d.day and name = 'GameComplete'), 0) as completed,
       coalesce((select c from e where e.day = d.day and name = 'InitiateCheckout'), 0) as checkouts,
       coalesce((select c from e where e.day = d.day and name = 'Purchase'), 0) as purchases,
       coalesce((select c from e where e.day = d.day and name = 'Lead'), 0) as leads,
       coalesce((select c from e where e.day = d.day and name = 'DiagnosticInterest'), 0) as interested,
       coalesce(o.revenue, 0) as revenue_cents
     from days d left join o on o.day = d.day order by d.day`,
    p,
  );

  const ordersP = db.query(
    `select count(*)::int as created,
       count(*) filter (where exists (select 1 from payments pp where pp.order_id = o.id))::int as pix_generated,
       count(*) filter (where o.status in ('paid','refunded','disputed') and o.provider <> 'free')::int as paid,
       count(*) filter (where o.provider = 'free')::int as leads,
       count(*) filter (where o.provider = 'free' and o.diagnostic_interest_at is not null)::int as interested,
       count(*) filter (where o.provider = 'free' and o.public_name_ok)::int as public_name_ok,
       count(*) filter (where o.status in ('expired','cancelled'))::int as expired,
       count(*) filter (where o.status in ('refunded','disputed'))::int as refunded,
       percentile_cont(0.5) within group (order by extract(epoch from (o.paid_at - o.created_at)) / 60)
         filter (where o.paid_at is not null) as med_minutes_to_pay
     from orders o where o.created_at >= ${bounds} and o.created_at < ${boundsEnd} and ${O_OK('o.')}`,
    p,
  ).then((r) => r[0]);

  const revenueP = db.query(
    `select coalesce(sum(amount_cents) filter (where status = 'paid'), 0)::int as net_cents,
       coalesce(sum(amount_cents), 0)::int as gross_cents, count(*)::int as purchases
     from orders where paid_at >= ${bounds} and paid_at < ${boundsEnd} and status in ('paid','refunded','disputed') and amount_cents > 0 and ${O_OK()}`,
    p,
  ).then((r) => r[0]);

  const sourcesP = db.query(
    `with s as (
       select id, answers,
         coalesce(nullif(attribution->>'utm_content', ''), nullif(attribution->>'utm_source', ''), '(sem UTM / direto)') as source,
         coalesce(attribution->>'utm_term', '') as adset
       from quiz_sessions where created_at >= ${bounds} and created_at < ${boundsEnd} and ${S_OK()}),
     r as (select distinct session_id from results),
     o as (select session_id, count(*) filter (where provider <> 'free')::int as orders,
             count(*) filter (where status in ('paid','refunded','disputed') and provider <> 'free')::int as paid,
             count(*) filter (where provider = 'free')::int as leads,
             count(*) filter (where provider = 'free' and diagnostic_interest_at is not null)::int as interested,
             coalesce(sum(amount_cents) filter (where status = 'paid'), 0)::int as revenue
           from orders group by session_id)
     select s.source, s.adset, count(*)::int as sessions,
       count(*) filter (where s.answers <> '{}'::jsonb)::int as started,
       count(r.session_id)::int as completed,
       coalesce(sum(o.orders), 0)::int as orders,
       coalesce(sum(o.paid), 0)::int as paid,
       coalesce(sum(o.leads), 0)::int as leads,
       coalesce(sum(o.interested), 0)::int as interested,
       coalesce(sum(o.revenue), 0)::int as revenue_cents
     from s left join r on r.session_id = s.id left join o on o.session_id = s.id
     group by 1, 2 order by sessions desc limit 30`,
    p,
  );

  const profileP = Promise.all([
    /* moments */ db.query(
      `select coalesce(context->>'moment', '(sem)') as key, count(*)::int as c from results
       where created_at >= ${bounds} and created_at < ${boundsEnd} and ${R_OK()} group by 1 order by c desc`, p),
    /* dailyTime */ db.query(
      `select coalesce(context->>'dailyTime', '(sem)') as key, count(*)::int as c from results
       where created_at >= ${bounds} and created_at < ${boundsEnd} and ${R_OK()} group by 1 order by c desc`, p),
    /* preferences */ db.query(
      `select (snapshot->'summary'->'topDimensions'->0->>'label') || ' + ' || (snapshot->'summary'->'topDimensions'->1->>'label') as key,
         count(*)::int as c,
         count(*) filter (where (snapshot->>'broadProfile')::boolean)::int as broad
       from results where created_at >= ${bounds} and created_at < ${boundsEnd} and ${R_OK()} group by 1 order by c desc limit 10`, p),
    /* topCareer */ db.query(
      `select r.snapshot->'cards'->0->>'name' as key, count(*)::int as c,
         count(o.id) filter (where o.status in ('paid','refunded','disputed') and o.provider <> 'free')::int as paid,
         count(o.id) filter (where o.provider = 'free')::int as leads,
         count(o.id) filter (where o.diagnostic_interest_at is not null)::int as interested
       from results r left join orders o on o.result_id = r.id
       where r.created_at >= ${bounds} and r.created_at < ${boundsEnd} and ${R_OK('r.')} group by 1 order by c desc`, p),
    db.query(
      `select count(*) filter (where (snapshot->>'broadProfile')::boolean)::int as c from results
       where created_at >= ${bounds} and created_at < ${boundsEnd} and ${R_OK()}`, p).then((r) => n(r[0]?.c)),
  ]).then(([moments, dailyTime, preferences, topCareer, broad]) => ({ moments, dailyTime, preferences, topCareer, broad }));

  const deliveryP = db.query(
    `select count(*)::int as entitlements,
       count(*) filter (where first_access_at is not null)::int as accessed,
       count(*) filter (where exists (select 1 from progress g where g.entitlement_id = e.id and g.checked))::int as plan_started,
       count(*) filter (where (select count(*) from progress g where g.entitlement_id = e.id and g.checked) >= 7)::int as plan_done,
       coalesce(avg((select count(*) from progress g where g.entitlement_id = e.id and g.checked)), 0)::float as avg_days
     from entitlements e where e.created_at >= ${bounds} and e.created_at < ${boundsEnd}
       and e.order_id not in (select id from orders where attribution->>'internal' = '1')`,
    p,
  ).then((r) => r[0]);
  const decisionsP = db.query(
    `select decision as key, count(*)::int as c from reflections f join entitlements e on e.id = f.entitlement_id
     where e.created_at >= ${bounds} and e.created_at < ${boundsEnd} and decision is not null group by 1 order by c desc`,
    p,
  );

  const consentP = db.query(
    `select consent_state as key, count(*)::int as c from events
     where name = 'PageView' and ts >= ${bounds} and ts < ${boundsEnd} group by 1`,
    p,
  );

  // Todas as consultas rodam em paralelo (cada ida ao banco custa uma viagem de rede).
  const [eventRows, quiz, minutesToResult, daily, orders, revenue, sources, profile, delivery, decisions, consent] = await Promise.all([eventRowsP, quizP, minutesToResultP, dailyP, ordersP, revenueP, sourcesP, profileP, deliveryP, decisionsP, consentP]);
  const ev = (name: string, k: 'total' | 'uniq' = 'uniq') => n(eventRows.find((r) => r.name === name)?.[k]);
  const started = n(quiz.started);
  return {
    range,
    mode,
    funnel: [
      { key: 'visits', label: 'Visitas na página inicial', value: ev('PageView', 'total') },
      { key: 'started', label: 'Começaram o teste', value: started },
      { key: 'completed', label: `Terminaram as ${QUESTIONS.length} perguntas`, value: n(quiz[QUESTIONS[QUESTIONS.length - 1].id]) },
      { key: 'result', label: 'Viram a prévia', value: n(quiz.with_result) },
      ...(mode === 'free'
        ? [
            { key: 'leads', label: 'Deixaram nome e WhatsApp', value: n(orders.leads) },
            { key: 'interested', label: 'Clicaram na oferta do roteiro', value: n(orders.interested) },
            { key: 'pix', label: 'Geraram o Pix do roteiro', value: n(orders.pix_generated) },
            { key: 'paid', label: 'Compraram o roteiro', value: n(orders.paid) },
          ]
        : [
            { key: 'checkout_click', label: 'Clicaram em desbloquear', value: ev('CheckoutClick') },
            { key: 'pix', label: 'Geraram o Pix', value: n(orders.pix_generated) },
            { key: 'paid', label: 'Pagaram', value: n(orders.paid) },
          ]),
    ],
    leads: { total: n(orders.leads), interested: n(orders.interested), publicNameOk: n(orders.public_name_ok) },
    questions: [
      ...QUESTIONS.map((q, i) => ({ key: q.id, label: `P${i + 1}`, text: q.text, value: n(quiz[q.id]) })),
      { key: 'context', label: 'Contexto', text: 'Momento de carreira e tempo por dia', value: n(quiz.context_done) },
      { key: 'result', label: 'Prévia', text: 'Resultado calculado e prévia exibida', value: n(quiz.with_result) },
    ],
    quiz: { sessions: n(quiz.sessions), started, medianMinutesToResult: minutesToResult == null ? null : Number(minutesToResult) },
    daily: daily.map((d) => ({
      day: d.day, visits: n(d.visits), started: n(d.started), completed: n(d.completed),
      checkouts: n(d.checkouts), purchases: n(d.purchases), revenueCents: n(d.revenue_cents),
      leads: n(d.leads), interested: n(d.interested),
    })),
    orders: {
      created: n(orders.created), pixGenerated: n(orders.pix_generated), paid: n(orders.paid), expired: n(orders.expired),
      refunded: n(orders.refunded), medianMinutesToPay: orders.med_minutes_to_pay == null ? null : Number(orders.med_minutes_to_pay),
    },
    revenue: { grossCents: n(revenue.gross_cents), netCents: n(revenue.net_cents), purchases: n(revenue.purchases) },
    sources: sources.map((s) => ({
      source: s.source, adset: s.adset, sessions: n(s.sessions), started: n(s.started), completed: n(s.completed),
      orders: n(s.orders), paid: n(s.paid), leads: n(s.leads), interested: n(s.interested), revenueCents: n(s.revenue_cents),
    })),
    profile,
    delivery: { ...delivery, avg_days: Number(delivery.avg_days ?? 0), decisions },
    consent,
  };
}

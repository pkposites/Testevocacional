// Rotas internas /api. Independente de plataforma: recebe Request e devolve Response.
import { randomBytes } from 'node:crypto';
import { CURRENT_AREA_MAX, DAILY_TIMES, MOMENTS, QUESTIONS, QUIZ_VERSION, isCompleteAnswers, isCompleteContext, type Answers, type QuizContext } from '../shared/quiz';
import { one } from './db';
import { ApiError, clientIp, cookie, errorResponse, hmacHex, json, newToken, normalizePhone, parseCookies, readJson, requestId, safeEqual, sha256, type Ctx } from './http';
import { fakeStore } from './payments/fake';
import { ProviderNetworkError, type ProviderPaymentState } from './payments/types';
import { buildAnalytics, parseRange } from './analytics';
import { applyProviderState } from './reconcile';
import { computeResult, type ResultSnapshot } from './scoring';
import { normalizeBrPhone } from '../shared/phone';
import { eventIds } from '../shared/events';
import { accessLink, afterApply, drainOutbox, rateLimit, reconcilePayment, sendMetaEvent, type App } from './services';
import { accessText } from './whatsapp';

const S_COOKIE = 'mc_s';
const A_COOKIE = 'mc_a';
const ADM_COOKIE = 'mc_adm';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RECOVER_TTL_MIN = 30;
const ACCESS_SESSION_DAYS = 30;
const RECONCILE_MIN_INTERVAL_SEC = 8;

type Handler = (app: App, ctx: Ctx) => Promise<Response>;
type Route = { method: string; pattern: RegExp; keys: string[]; handler: Handler };

const routes: Route[] = [];
function route(method: string, path: string, handler: Handler) {
  const keys: string[] = [];
  const pattern = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '/?$');
  routes.push({ method, pattern, keys, handler });
}

export async function handle(app: App, req: Request): Promise<Response> {
  const url = new URL(req.url);
  const ctx: Ctx = { req, url, requestId: requestId(), cookies: parseCookies(req.headers.get('cookie')), setCookies: [], params: {} };
  try {
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = r.pattern.exec(url.pathname);
      if (!m) continue;
      r.keys.forEach((k, i) => (ctx.params[k] = decodeURIComponent(m[i + 1])));
      if (req.method !== 'GET' && !url.pathname.startsWith('/api/webhooks/')) checkOrigin(app, req);
      return await r.handler(app, ctx);
    }
    throw new ApiError(404, 'not_found', 'Rota não encontrada.');
  } catch (e) {
    return errorResponse(ctx, e);
  }
}

/** CSRF: requisições de escrita com cookie precisam vir da nossa origem. */
function checkOrigin(app: App, req: Request) {
  const origin = req.headers.get('origin');
  if (!origin) return; // clientes sem navegador (curl/testes) não enviam cookies de terceiros
  const allowed = new URL(app.cfg.publicBaseUrl).origin;
  if (origin !== allowed && app.cfg.env === 'production') throw new ApiError(403, 'bad_origin', 'Origem não permitida.');
}

const secure = (app: App) => app.cfg.publicBaseUrl.startsWith('https://');

// ---------- sessões ----------

// Sessões gravadas antes da correção do driver podem ter jsonb gigante (string que crescia a cada resposta).
// Nunca carregamos esses valores: o banco troca por {} (pg_column_size não descompacta o valor).
const SAFE_JSON = (col: string) =>
  `case when pg_column_size(${col}) > 16384 or jsonb_typeof(${col}) <> 'object' then '{}'::jsonb else ${col} end as ${col}, ` +
  `(pg_column_size(${col}) > 16384 or jsonb_typeof(${col}) <> 'object') as ${col}_bad`;

function cleanAnswers(v: unknown): Answers {
  const out: Answers = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const q of QUESTIONS) {
    const x = (v as any)[q.id];
    if (Number.isInteger(x) && x >= 1 && x <= 5) out[q.id] = x;
  }
  return out;
}

function cleanContext(v: unknown): QuizContext {
  try {
    return validateContext(v);
  } catch {
    return {};
  }
}

async function getQuizSession(app: App, ctx: Ctx): Promise<any | undefined> {
  const tok = ctx.cookies[S_COOKIE];
  if (!tok) return undefined;
  const s = await one(
    app.db,
    `select id, session_token_hash, quiz_version, answer_revision, created_at, updated_at, ${SAFE_JSON('answers')}, ${SAFE_JSON('context')}, ${SAFE_JSON('attribution')}
     from quiz_sessions where session_token_hash = $1`,
    [sha256(tok)],
  );
  if (!s) return undefined;
  const answers = cleanAnswers(s.answers);
  const context = cleanContext(s.context);
  const attribution = s.attribution_bad ? {} : s.attribution;
  const dirty = s.answers_bad || s.context_bad || s.attribution_bad
    || JSON.stringify(answers) !== JSON.stringify(s.answers) || JSON.stringify(context) !== JSON.stringify(s.context);
  if (dirty) {
    // Conserta a linha na hora (só esta sessão), sem depender da correção em lote.
    await app.db.query(`update quiz_sessions set answers = $2::jsonb, context = $3::jsonb, attribution = $4::jsonb, updated_at = now() where id = $1`, [
      s.id, JSON.stringify(answers), JSON.stringify(context), JSON.stringify(attribution),
    ]);
  }
  return { id: s.id, session_token_hash: s.session_token_hash, quiz_version: s.quiz_version, answer_revision: s.answer_revision,
    created_at: s.created_at, updated_at: s.updated_at, answers, context, attribution };
}

async function requireQuizSession(app: App, ctx: Ctx) {
  const s = await getQuizSession(app, ctx);
  if (!s) throw new ApiError(401, 'no_session', 'Sessão não encontrada. Comece o teste novamente.');
  return s;
}

async function getAccessPhone(app: App, ctx: Ctx): Promise<string | undefined> {
  const tok = ctx.cookies[A_COOKIE];
  if (!tok) return undefined;
  const row = await one(app.db, 'select buyer_phone from access_sessions where token_hash = $1 and expires_at > now()', [sha256(tok)]);
  return row?.buyer_phone;
}

async function startAccessSession(app: App, ctx: Ctx, phone: string) {
  const tok = newToken();
  await app.db.query(
    `insert into access_sessions (token_hash, buyer_phone, expires_at) values ($1,$2, now() + interval '${ACCESS_SESSION_DAYS} days')`,
    [sha256(tok), phone],
  );
  ctx.setCookies.push(cookie(A_COOKIE, tok, { maxAgeSec: ACCESS_SESSION_DAYS * 86400, secure: secure(app) }));
}

async function limit(app: App, ctx: Ctx, bucket: string, max: number, windowSec: number) {
  const ok = await rateLimit(app.db, `${bucket}:${clientIp(ctx.req)}`, max, windowSec);
  if (!ok) throw new ApiError(429, 'rate_limited', 'Muitas tentativas. Aguarde um pouco e tente de novo.');
}

async function recordEvent(app: App, e: { eventId: string; name: string; sessionId?: string; orderId?: string; attribution?: unknown; consent?: string }) {
  await app.db.query(
    `insert into events (event_id, session_id, order_id, name, attribution, consent_state) values ($1,$2,$3,$4,$5::jsonb,$6) on conflict (event_id) do nothing`,
    [e.eventId, e.sessionId ?? null, e.orderId ?? null, e.name, JSON.stringify(e.attribution ?? {}), e.consent ?? 'unknown'],
  );
}

/** Dados técnicos para a API de Conversões (sem dados pessoais) + escolha de cookies. */
function trackingContext(ctx: Ctx, body: any): Record<string, string> {
  const out: Record<string, string> = {
    ip: clientIp(ctx.req),
    ua: (ctx.req.headers.get('user-agent') ?? '').slice(0, 300),
  };
  if (typeof body?.fbp === 'string' && body.fbp) out.fbp = body.fbp.slice(0, 100);
  if (typeof body?.fbc === 'string' && body.fbc) out.fbc = body.fbc.slice(0, 200);
  if (body?.consent === 'granted' || body?.consent === 'denied') out.consent = body.consent;
  return out;
}

function firstName(v: unknown): string {
  const t = String(v ?? '').trim().split(/\s+/)[0] ?? '';
  const clean = t.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ'-]/g, '').slice(0, 20);
  return clean ? clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase() : '';
}

function cleanAttribution(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!v || typeof v !== 'object') return out;
  const allowed = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'landing_path', 'referrer'];
  for (const k of allowed) {
    const x = (v as any)[k];
    if (typeof x === 'string' && x) out[k] = x.slice(0, 200);
  }
  return out;
}

// ---------- configuração pública ----------

route('GET', '/api/config', async (app, ctx) =>
  json(ctx, 200, {
    price_cents: app.cfg.priceCents,
    currency: app.cfg.currency,
    provider: app.cfg.paymentProvider,
    delivery_mode: app.cfg.deliveryMode,
    manual_delivery_sla: app.cfg.deliveryMode === 'manual' ? app.cfg.manualDeliverySla : null,
    support_contact: app.cfg.supportContact,
    seller: app.cfg.seller,
    meta_pixel_id: app.cfg.meta.pixelId ?? null,
    quiz_version: QUIZ_VERSION,
    dev_tools: app.cfg.paymentProvider === 'fake' && app.cfg.env !== 'production',
    whatsapp_auto: app.messages.enabled,
    offer_mode: app.cfg.offerMode,
  }),
);

// ---------- teste ----------

route('POST', '/api/quiz/sessions', async (app, ctx) => {
  await limit(app, ctx, 'session', 30, 600);
  const body = await readJson(ctx);
  const tok = newToken();
  const row = await one(
    app.db,
    `insert into quiz_sessions (session_token_hash, quiz_version, attribution) values ($1,$2,$3::jsonb) returning id, quiz_version`,
    [sha256(tok), QUIZ_VERSION, JSON.stringify({ ...cleanAttribution(body.attribution), ...trackingContext(ctx, body) })],
  );
  ctx.setCookies.push(cookie(S_COOKIE, tok, { maxAgeSec: 90 * 86400, secure: secure(app) }));
  return json(ctx, 201, { session_id: row!.id, quiz_version: row!.quiz_version });
});

async function sessionView(app: App, s: any) {
  const result = await one(app.db, 'select id, snapshot from results where session_id = $1 and answer_revision = $2', [s.id, s.answer_revision]);
  const paid = await one(
    app.db,
    `select o.id, o.result_id from orders o join entitlements e on e.order_id = o.id and e.state = 'active' where o.session_id = $1 order by o.paid_at desc limit 1`,
    [s.id],
  );
  const openOrder = result
    ? await one(app.db, `select id, status from orders where result_id = $1 and status in ('created','pending','expired','cancelled') order by created_at desc limit 1`, [result.id])
    : undefined;
  return {
    session_id: s.id,
    quiz_version: s.quiz_version,
    answers: s.answers,
    context: s.context,
    revision: s.answer_revision,
    progress: QUESTIONS.filter((q) => s.answers[q.id]).length,
    result: result ? { result_id: result.id, summary: (result.snapshot as ResultSnapshot).summary } : null,
    open_order: openOrder ? { order_id: openOrder.id, status: openOrder.status } : null,
    purchased_result_id: paid?.result_id ?? null,
  };
}

route('GET', '/api/quiz/sessions/me', async (app, ctx) => {
  // ?optional=1: "ainda não começou" é uma resposta normal (200 + null), não um erro no console.
  if (ctx.url.searchParams.get('optional') === '1') {
    const s = await getQuizSession(app, ctx);
    return json(ctx, 200, s ? await sessionView(app, s) : null);
  }
  const s = await requireQuizSession(app, ctx);
  return json(ctx, 200, await sessionView(app, s));
});

function validateAnswers(v: unknown): Answers {
  if (!v || typeof v !== 'object') return {};
  const out: Answers = {};
  for (const [k, x] of Object.entries(v)) {
    if (!QUESTIONS.some((q) => q.id === k)) throw new ApiError(400, 'invalid_answer', `Pergunta desconhecida: ${k}`);
    if (x === null || x === undefined) continue;
    if (!Number.isInteger(x) || (x as number) < 1 || (x as number) > 5) throw new ApiError(400, 'invalid_answer', `Resposta inválida em ${k}`);
    out[k] = x as number;
  }
  return out;
}

function validateContext(v: unknown): QuizContext {
  if (!v || typeof v !== 'object') return {};
  const c = v as any;
  const out: QuizContext = {};
  if (c.moment !== undefined && c.moment !== null) {
    if (!MOMENTS.some((m) => m.value === c.moment)) throw new ApiError(400, 'invalid_context', 'Momento de carreira inválido.');
    out.moment = c.moment;
  }
  if (c.dailyTime !== undefined && c.dailyTime !== null) {
    if (!DAILY_TIMES.some((t) => t.value === c.dailyTime)) throw new ApiError(400, 'invalid_context', 'Tempo por dia inválido.');
    out.dailyTime = c.dailyTime;
  }
  if (typeof c.currentArea === 'string') {
    const a = c.currentArea.trim();
    if (a.length > CURRENT_AREA_MAX) throw new ApiError(400, 'invalid_context', `Área atual: até ${CURRENT_AREA_MAX} caracteres.`);
    if (a) out.currentArea = a;
  }
  return out;
}

route('PUT', '/api/quiz/sessions/me', async (app, ctx) => {
  const s = await requireQuizSession(app, ctx);
  const body = await readJson(ctx);
  const answers = { ...s.answers, ...validateAnswers(body.answers) };
  const context = body.context !== undefined ? validateContext(body.context) : s.context;
  const changed = JSON.stringify(answers) !== JSON.stringify(s.answers);
  const updated = await one(
    app.db,
    `update quiz_sessions set answers = $2::jsonb, context = $3::jsonb, answer_revision = answer_revision + $4, updated_at = now() where id = $1 returning *`,
    [s.id, JSON.stringify(answers), JSON.stringify(context), changed ? 1 : 0],
  );
  if (Object.keys(s.answers).length === 0 && Object.keys(answers).length > 0) {
    await recordEvent(app, { eventId: `gamestart_${s.id}`, name: 'GameStart', sessionId: s.id, attribution: s.attribution });
  }
  return json(ctx, 200, { revision: updated!.answer_revision, progress: QUESTIONS.filter((q) => answers[q.id]).length });
});

route('POST', '/api/results', async (app, ctx) => {
  let s = await requireQuizSession(app, ctx);
  const body = await readJson(ctx);
  const tracking = trackingContext(ctx, body);
  if (tracking.consent || tracking.fbp || tracking.fbc) {
    s = await one(app.db, `update quiz_sessions set attribution = attribution || $2::jsonb where id = $1 returning *`, [s.id, JSON.stringify(tracking)]);
  }
  if (!isCompleteAnswers(s.answers)) throw new ApiError(400, 'incomplete', 'Responda as 12 perguntas.');
  if (!isCompleteContext(s.context)) throw new ApiError(400, 'incomplete_context', 'Informe seu momento de carreira e o tempo disponível.');
  let row = await one(app.db, 'select id, snapshot from results where session_id = $1 and answer_revision = $2', [s.id, s.answer_revision]);
  if (!row) {
    const r = computeResult(s.answers, s.context);
    row = await one(
      app.db,
      `insert into results (session_id, answer_revision, answers, context, scores, ranked_career_ids, result_version, content_version, snapshot)
       values ($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,$7,$8,$9::jsonb)
       on conflict (session_id, answer_revision) do update set session_id = excluded.session_id
       returning id, snapshot`,
      [s.id, s.answer_revision, JSON.stringify(s.answers), JSON.stringify(s.context), JSON.stringify(r.scores), JSON.stringify(r.rankedCareerIds),
        r.snapshot.resultVersion, r.snapshot.contentVersion, JSON.stringify(r.snapshot)],
    );
    const eventId = eventIds.gameComplete(s.id, s.answer_revision);
    await recordEvent(app, { eventId, name: 'GameComplete', sessionId: s.id, attribution: s.attribution, consent: s.attribution?.consent });
    await sendMetaEvent(app, { key: 'GameComplete', eventId, attribution: s.attribution });
  }
  const snap = row!.snapshot as ResultSnapshot;
  // Somente a prévia: nada de ranking, caminhos ou planos antes da liberação.
  return json(ctx, 200, {
    result_id: row!.id,
    summary: snap.summary,
    broad_profile: snap.broadProfile,
    event_id: eventIds.gameComplete(s.id, s.answer_revision),
  });
});

// ---------- pedidos e checkout ----------

function publicRef() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = randomBytes(6);
  return 'MC-' + [...b].map((x) => alphabet[x % alphabet.length]).join('');
}

async function orderView(app: App, order: any) {
  const pay = await one(
    app.db,
    `select * from payments where order_id = $1 and coalesce(flag,'') not like 'duplicate' order by created_at desc limit 1`,
    [order.id],
  );
  const now = Date.now();
  const pixExpired = !!pay && pay.normalized_status === 'pending' && pay.expires_at && new Date(pay.expires_at).getTime() < now;
  let status: string = order.status;
  if (status === 'pending' && pixExpired) status = 'expired';
  const next_action =
    status === 'paid' ? 'open_map'
      : status === 'refunded' || status === 'disputed' ? 'contact_support'
        : status === 'expired' || status === 'cancelled' ? 'retry'
          : app.cfg.paymentProvider === 'kiwify' ? 'redirect' : 'pay_pix';
  const reviewHold = !!pay?.flag && pay.flag.includes('mismatch');
  return {
    order_id: order.id,
    public_ref: order.public_ref,
    result_id: order.result_id,
    status,
    next_action: reviewHold ? 'contact_support' : next_action,
    amount_cents: order.amount_cents,
    currency: order.currency,
    provider: order.provider,
    pix:
      pay && pay.normalized_status === 'pending' && !pixExpired && pay.pix_qr_code
        ? { qr_code: pay.pix_qr_code, qr_base64: pay.pix_qr_base64, ticket_url: pay.pix_ticket_url, expires_at: pay.expires_at }
        : null,
    checkout_url: order.provider === 'kiwify' && status !== 'paid' ? order.attribution?.checkout_url ?? null : null,
    delivery_mode: app.cfg.deliveryMode,
  };
}

/** Cria (ou reaproveita) uma tentativa de pagamento. Só um checkout pendente por pedido. */
async function ensureCheckout(app: App, order: any, forceNew = false): Promise<void> {
  if (order.status === 'paid' || order.status === 'refunded' || order.status === 'disputed') return;
  const open = await one(
    app.db,
    `select * from payments where order_id = $1 and normalized_status = 'pending' order by created_at desc limit 1`,
    [order.id],
  );
  if (open && !forceNew && (!open.expires_at || new Date(open.expires_at).getTime() > Date.now() + 60_000)) return;
  if (open) {
    // Antes de gerar outro Pix: confirma que o anterior não foi pago e o cancela no provedor.
    const r = await reconcilePayment(app, open.provider_resource_id).catch(() => null);
    if (r?.released || r?.code === 'already_paid') return;
    await app.provider.cancel?.(open.provider_resource_id);
    await reconcilePayment(app, open.provider_resource_id).catch(() => null);
  }
  const attempts = await one<{ n: number }>(app.db, 'select count(*)::int as n from payments where order_id = $1', [order.id]);
  let result;
  try {
    result = await app.provider.createCheckout({
      orderId: order.id,
      publicRef: order.public_ref,
      attempt: (attempts?.n ?? 0) + 1,
      amountCents: order.amount_cents,
      buyerPhone: order.buyer_phone,
      buyerName: order.buyer_name,
      description: 'Mapa da Carreira — 5 caminhos e plano de 7 dias',
      attribution: order.attribution ?? {},
    });
  } catch (e) {
    // Falha de rede/provedor não é recusa financeira: pedido e respostas ficam preservados.
    console.error('createCheckout falhou', (e as Error).message);
    throw new ApiError(502, e instanceof ProviderNetworkError ? 'provider_unavailable' : 'provider_error',
      'Não conseguimos gerar o Pix agora. Suas respostas estão salvas; tente novamente em instantes.');
  }
  if (result.kind === 'redirect') {
    await app.db.query(
      `update orders set status = 'pending', attribution = attribution || $2::jsonb, updated_at = now() where id = $1 and status in ('created','expired','cancelled')`,
      [order.id, JSON.stringify({ checkout_url: result.url })],
    );
    return;
  }
  const st = result.state;
  await app.db.tx(async (t) => {
    await t.query(
      `insert into payments (order_id, provider, provider_resource_id, provider_payment_id, normalized_status, raw_status, verified_amount_cents, currency,
         pix_qr_code, pix_qr_base64, pix_ticket_url, expires_at)
       values ($1,$2,$3,$4,'pending',$5,$6,$7,$8,$9,$10,$11) on conflict (provider, provider_resource_id) do nothing`,
      [order.id, app.provider.name, st.resourceId, st.paymentId ?? null, st.rawStatus, st.amountCents ?? null, st.currency ?? null,
        st.pix?.qrCode ?? null, st.pix?.qrBase64 ?? null, st.pix?.ticketUrl ?? null, st.pix?.expiresAt ?? null],
    );
    await t.query(`update orders set status = 'pending', updated_at = now() where id = $1 and status in ('created','expired','cancelled')`, [order.id]);
  });
}

route('POST', '/api/orders', async (app, ctx) => {
  if (app.cfg.offerMode === 'free') throw new ApiError(409, 'free_mode', 'O mapa está gratuito: use o cadastro com nome e WhatsApp.');
  const s = await requireQuizSession(app, ctx);
  await limit(app, ctx, 'orders', 20, 600);
  const body = await readJson(ctx);
  const resultId = String(body.result_id ?? '');
  if (!UUID_RE.test(resultId)) throw new ApiError(400, 'invalid_result', 'Resultado inválido.');
  const result = await one(app.db, 'select id, session_id, answer_revision from results where id = $1', [resultId]);
  if (!result || result.session_id !== s.id) throw new ApiError(404, 'result_not_found', 'Resultado não encontrado nesta sessão.');
  if (result.answer_revision !== s.answer_revision) throw new ApiError(409, 'stale_result', 'Suas respostas mudaram. Veja a prévia atualizada antes de comprar.');
  const name = String(body.buyer_name ?? '').trim().slice(0, 60);
  if (name.length < 2) throw new ApiError(400, 'invalid_name', 'Informe seu primeiro nome.');
  const phone = normalizePhone(body.buyer_phone);
  const idemKey = ctx.req.headers.get('idempotency-key')?.slice(0, 100) || null;

  // Pedido pago para este resultado: não recriar.
  let order = await one(app.db, `select * from orders where result_id = $1 and status in ('paid','refunded','disputed') order by created_at limit 1`, [resultId]);
  if (!order && idemKey) order = await one(app.db, 'select * from orders where idempotency_key = $1 and session_id = $2', [idemKey, s.id]);
  if (!order) {
    order = await one(app.db, `select * from orders where result_id = $1 and status in ('created','pending','expired','cancelled') order by created_at desc limit 1`, [resultId]);
    if (order && (order.buyer_phone !== phone || order.buyer_name !== name)) {
      order = await one(app.db, `update orders set buyer_phone = $2, buyer_name = $3, marketing_opt_in = $4, updated_at = now() where id = $1 returning *`,
        [order.id, phone, name, !!body.marketing_opt_in]);
    }
  }
  if (!order) {
    const attribution = {
      ...s.attribution,
      ip: clientIp(ctx.req),
      ua: (ctx.req.headers.get('user-agent') ?? '').slice(0, 300),
      ...(typeof body.fbp === 'string' ? { fbp: body.fbp.slice(0, 100) } : {}),
      ...(typeof body.fbc === 'string' ? { fbc: body.fbc.slice(0, 200) } : {}),
      consent: body.consent === 'granted' ? 'granted' : 'denied',
    };
    order = await one(
      app.db,
      `insert into orders (public_ref, result_id, session_id, provider, amount_cents, currency, buyer_name, buyer_phone, marketing_opt_in, idempotency_key, attribution)
       values ($1,$2,$3,$4,$5,'BRL',$6,$7,$8,$9,$10::jsonb)
       on conflict (idempotency_key) do update set updated_at = now() returning *`,
      [publicRef(), resultId, s.id, app.cfg.paymentProvider, app.cfg.priceCents, name, phone, !!body.marketing_opt_in, idemKey, JSON.stringify(attribution)],
    );
  }
  await ensureCheckout(app, order);
  order = await one(app.db, 'select * from orders where id = $1', [order!.id]);
  await recordEvent(app, { eventId: `ic_${order!.id}`, name: 'InitiateCheckout', sessionId: s.id, orderId: order!.id, attribution: s.attribution });
  return json(ctx, 200, await orderView(app, order));
});

async function authorizeOrder(app: App, ctx: Ctx): Promise<{ order: any; viaSession: boolean }> {
  const id = ctx.params.id;
  if (!UUID_RE.test(id)) throw new ApiError(404, 'order_not_found', 'Pedido não encontrado.');
  const order = await one(app.db, 'select * from orders where id = $1', [id]);
  if (!order) throw new ApiError(404, 'order_not_found', 'Pedido não encontrado.');
  const s = await getQuizSession(app, ctx);
  if (s && s.id === order.session_id) return { order, viaSession: true };
  const phone = await getAccessPhone(app, ctx);
  if (phone && phone === order.buyer_phone) return { order, viaSession: false };
  throw new ApiError(404, 'order_not_found', 'Pedido não encontrado.');
}

route('GET', '/api/orders/:id/status', async (app, ctx) => {
  let { order, viaSession } = await authorizeOrder(app, ctx);
  // Reconciliação controlada: cobre webhook atrasado sem martelar o provedor.
  if (order.status === 'pending' || order.status === 'created' || order.status === 'expired') {
    const due = !order.last_reconciled_at || Date.now() - new Date(order.last_reconciled_at).getTime() > RECONCILE_MIN_INTERVAL_SEC * 1000;
    if (due) {
      await app.db.query('update orders set last_reconciled_at = now() where id = $1', [order.id]);
      const pays = await app.db.query(`select provider_resource_id from payments where order_id = $1 and normalized_status = 'pending'`, [order.id]);
      for (const p of pays) await reconcilePayment(app, p.provider_resource_id).catch((e) => console.error('reconcile', (e as Error).message));
      order = await one(app.db, 'select * from orders where id = $1', [order.id]);
    }
  }
  // Pagamento confirmado na aba de origem: abre sessão de acesso para retornos futuros.
  if (order.status === 'paid' && viaSession && !(await getAccessPhone(app, ctx))) await startAccessSession(app, ctx, order.buyer_phone);
  return json(ctx, 200, await orderView(app, order));
});

route('POST', '/api/orders/:id/retry', async (app, ctx) => {
  await limit(app, ctx, 'retry', 10, 600);
  const { order } = await authorizeOrder(app, ctx);
  if (order.status === 'paid') return json(ctx, 200, await orderView(app, order));
  await ensureCheckout(app, order, true);
  return json(ctx, 200, await orderView(app, await one(app.db, 'select * from orders where id = $1', [order.id])));
});

// ---------- modo gratuito: nome + WhatsApp liberam o mapa ----------

route('POST', '/api/leads', async (app, ctx) => {
  if (app.cfg.offerMode !== 'free') throw new ApiError(409, 'paid_mode', 'O mapa completo está disponível pelo pagamento.');
  const s = await requireQuizSession(app, ctx);
  await limit(app, ctx, 'leads', 20, 600);
  const body = await readJson(ctx);
  const resultId = String(body.result_id ?? '');
  if (!UUID_RE.test(resultId)) throw new ApiError(400, 'invalid_result', 'Resultado inválido.');
  const result = await one(app.db, 'select id, session_id, answer_revision from results where id = $1', [resultId]);
  if (!result || result.session_id !== s.id) throw new ApiError(404, 'result_not_found', 'Resultado não encontrado nesta sessão.');
  if (result.answer_revision !== s.answer_revision) throw new ApiError(409, 'stale_result', 'Suas respostas mudaram. Veja a prévia atualizada.');
  const name = String(body.buyer_name ?? '').trim().slice(0, 60);
  if (name.length < 2) throw new ApiError(400, 'invalid_name', 'Informe seu primeiro nome.');
  const phone = normalizePhone(body.buyer_phone);
  if (body.contact_consent !== true) throw new ApiError(400, 'consent_required', 'Para liberar o mapa, aceite receber seu resultado pelo WhatsApp.');
  const publicNameOk = body.public_name_ok === true;

  const attribution = { ...s.attribution, ...trackingContext(ctx, body) };
  let created = false;
  const order = await app.db.tx(async (t) => {
    const existing = await one(t, `select * from orders where result_id = $1 order by created_at limit 1 for update`, [resultId]);
    if (existing) {
      return one(t, `update orders set buyer_name = $2, buyer_phone = $3, public_name_ok = $4, contact_consent = true, updated_at = now() where id = $1 returning *`,
        [existing.id, name, phone, publicNameOk]);
    }
    created = true;
    const o = await one(
      t,
      `insert into orders (public_ref, result_id, session_id, provider, amount_cents, currency, buyer_name, buyer_phone, marketing_opt_in,
         contact_consent, public_name_ok, status, paid_at, attribution)
       values ($1,$2,$3,'free',0,'BRL',$4,$5,$6,true,$7,'paid',now(),$8::jsonb) returning *`,
      [publicRef(), resultId, s.id, name, phone, !!body.marketing_opt_in, publicNameOk, JSON.stringify(attribution)],
    );
    await t.query(`insert into entitlements (order_id, result_id, buyer_phone, state) values ($1,$2,$3,'active') on conflict (order_id) do nothing`, [o!.id, resultId, phone]);
    await t.query(`insert into events (event_id, session_id, order_id, name, attribution, consent_state) values ($1,$2,$3,'Lead',$4::jsonb,$5) on conflict (event_id) do nothing`,
      [eventIds.lead(o!.id), s.id, o!.id, JSON.stringify(cleanAttribution(attribution)), attribution.consent ?? 'unknown']);
    if (app.messages.enabled) await t.query(`insert into message_outbox (order_id, kind, to_phone) values ($1,'free',$2)`, [o!.id, phone]);
    return o;
  });
  // Abre a sessão de acesso deste aparelho para o número informado.
  if ((await getAccessPhone(app, ctx)) !== phone) await startAccessSession(app, ctx, phone);
  if (created) {
    await sendMetaEvent(app, { key: 'Lead', eventId: eventIds.lead(order!.id), attribution });
    await drainOutbox(app, order!.id);
  }
  return json(ctx, 200, { order_id: order!.id, public_ref: order!.public_ref, result_id: resultId, event_id: eventIds.lead(order!.id) });
});

route('POST', '/api/interest', async (app, ctx) => {
  const body = await readJson(ctx);
  const ent = await authorizeResult(app, ctx, String(body.result_id ?? ''));
  const order = await one(
    app.db,
    `update orders set diagnostic_interest_at = coalesce(diagnostic_interest_at, now()), updated_at = now() where id = $1 returning *`,
    [ent.order_id],
  );
  const eventId = eventIds.interest(order!.id);
  const ins = await one(app.db,
    `insert into events (event_id, session_id, order_id, name, attribution, consent_state) values ($1,$2,$3,'DiagnosticInterest',$4::jsonb,$5)
     on conflict (event_id) do nothing returning id`,
    [eventId, order!.session_id, order!.id, JSON.stringify(cleanAttribution(order!.attribution)), order!.attribution?.consent ?? 'unknown']);
  if (ins) await sendMetaEvent(app, { key: 'DiagnosticInterest', eventId, attribution: order!.attribution });
  return json(ctx, 200, { ok: true, event_id: eventId, interested_at: order!.diagnostic_interest_at });
});

/** Notificações de prova social com dados REAIS: primeiro nome só de quem autorizou. */
route('GET', '/api/social-proof', async (app, ctx) => {
  await limit(app, ctx, 'social', 60, 600);
  const rows = await app.db.query(
    `select o.buyer_name, o.public_name_ok, r.snapshot->'cards'->0->>'name' as career,
       extract(epoch from (now() - o.created_at)) / 60 as minutes
     from orders o join results r on r.id = o.result_id
     where o.status in ('paid','refunded','disputed') and o.created_at > now() - interval '72 hours'
     order by o.created_at desc limit 8`,
  );
  const today = await one<{ n: number }>(app.db,
    `select count(*)::int as n from results where created_at >= (now() at time zone 'America/Sao_Paulo')::date::timestamp at time zone 'America/Sao_Paulo'`);
  return new Response(JSON.stringify({
    items: rows.map((r) => ({ name: r.public_name_ok ? firstName(r.buyer_name) || null : null, career: r.career, minutes_ago: Math.max(0, Math.round(Number(r.minutes))) })),
    results_today: today?.n ?? 0,
  }), { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=60' } });
});

// ---------- webhooks ----------

route('POST', '/api/webhooks/:provider', async (app, ctx) => {
  const providerName = ctx.params.provider;
  if (providerName !== app.provider.name) throw new ApiError(404, 'not_found', 'Provedor inativo.');
  const raw = await ctx.req.text();
  if (raw.length > 100_000) throw new ApiError(413, 'payload_too_large', 'Payload muito grande.');
  const parsed = await app.provider.verifyWebhook(ctx.req, raw, ctx.url);
  let payload: unknown = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = { raw: raw.slice(0, 2000) };
  }
  const ins = await one(
    app.db,
    `insert into webhook_events (provider, event_key, resource_id, signature_valid, payload) values ($1,$2,$3,$4,$5::jsonb)
     on conflict (provider, event_key) do nothing returning id`,
    // Evento inválido recebe chave própria: não pode ocupar a chave de um evento legítimo.
    [providerName, parsed.valid ? parsed.eventKey || `nokey:${requestId()}` : `invalid:${requestId()}`, parsed.resourceId ?? null, parsed.valid, JSON.stringify(payload)],
  );
  if (!parsed.valid) throw new ApiError(401, 'invalid_signature', 'Assinatura inválida.');
  if (!ins) {
    const prev = await one(app.db, 'select processed_at from webhook_events where provider = $1 and event_key = $2', [providerName, parsed.eventKey]);
    if (prev?.processed_at) return json(ctx, 200, { ok: true, duplicate: true });
  }
  const mark = (code: string) =>
    app.db.query(`update webhook_events set processed_at = now(), result_code = $3 where provider = $1 and event_key = $2`, [providerName, parsed.eventKey, code]);
  if (!parsed.resourceId) {
    await mark('ignored');
    return json(ctx, 200, { ok: true, ignored: true });
  }
  let st: ProviderPaymentState | null;
  try {
    st = await app.provider.fetchState(parsed.resourceId);
  } catch (e) {
    await app.db.query(`update webhook_events set result_code = 'fetch_failed' where provider = $1 and event_key = $2`, [providerName, parsed.eventKey]);
    throw e; // 500: o provedor reenviará
  }
  if (!st) st = parsed.inlineState ?? null; // provedor sem consulta: estado do payload assinado
  if (!st) {
    await mark('resource_not_found');
    return json(ctx, 200, { ok: true, not_found: true });
  }
  const r = await applyProviderState(app.db, app.cfg, providerName, st);
  await mark(r.code);
  await afterApply(app, r);
  return json(ctx, 200, { ok: true, code: r.code });
});

// ---------- acesso ----------

route('POST', '/api/access/recover', async (app, ctx) => {
  await limit(app, ctx, 'recover', 8, 900);
  const body = await readJson(ctx);
  const phone = normalizePhone(body.phone);
  if (!(await rateLimit(app.db, `recover-phone:${sha256(phone)}`, 6, 3600))) {
    throw new ApiError(429, 'rate_limited', 'Muitas tentativas para este número. Aguarde um pouco ou fale com o suporte.');
  }
  const rawRef = String(body.order_ref ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (rawRef) {
    // WhatsApp + código do pedido: abre o acesso direto, sem depender de mensagem.
    const ref = `MC-${rawRef.replace(/^MC/, '')}`;
    const ent = await one(
      app.db,
      `select e.id from entitlements e join orders o on o.id = e.order_id where e.buyer_phone = $1 and o.public_ref = $2 and e.state = 'active'`,
      [phone, ref],
    );
    if (!ent) throw new ApiError(404, 'not_found', 'Não encontramos uma compra com esse WhatsApp e código. Confira os dados ou fale com o suporte.');
    await startAccessSession(app, ctx, phone);
    return json(ctx, 200, { ok: true, maps: await listMaps(app, phone) });
  }
  if (!app.messages.enabled) throw new ApiError(400, 'code_required', 'Informe também o código do pedido (começa com MC-).');
  const ent = await one(app.db, `select o.buyer_name from entitlements e join orders o on o.id = e.order_id where e.buyer_phone = $1 and e.state = 'active' limit 1`, [phone]);
  if (ent) {
    try {
      const link = await accessLink(app, phone, 'recover', RECOVER_TTL_MIN);
      await app.messages.send({ to: phone, name: String(ent.buyer_name).split(' ')[0], link, kind: 'recover' });
    } catch (e) {
      console.error('Envio de recuperação falhou', (e as Error).message);
    }
  }
  // Resposta genérica: não revela se o número tem compra.
  return json(ctx, 200, { ok: true, message: 'Se houver uma compra com este WhatsApp, enviaremos o link de acesso em instantes.' });
});

route('POST', '/api/access/exchange', async (app, ctx) => {
  await limit(app, ctx, 'exchange', 20, 900);
  const body = await readJson(ctx);
  const token = typeof body.token === 'string' ? body.token : '';
  if (!token) throw new ApiError(400, 'invalid_token', 'Link inválido.');
  const row = await one(
    app.db,
    `update access_tokens set used_at = now() where token_hash = $1 and used_at is null and expires_at > now() returning buyer_phone`,
    [sha256(token)],
  );
  if (!row) throw new ApiError(410, 'token_expired', 'Este link expirou ou já foi usado. Peça um novo link de acesso.');
  await startAccessSession(app, ctx, row.buyer_phone);
  return json(ctx, 200, { ok: true, maps: await listMaps(app, row.buyer_phone) });
});

async function listMaps(app: App, phone: string) {
  const rows = await app.db.query(
    `select e.result_id, o.public_ref, o.paid_at from entitlements e join orders o on o.id = e.order_id
     where e.buyer_phone = $1 and e.state = 'active' order by o.paid_at desc`,
    [phone],
  );
  return rows.map((r) => ({ result_id: r.result_id, public_ref: r.public_ref, paid_at: r.paid_at }));
}

route('GET', '/api/access/me', async (app, ctx) => {
  const phone = await getAccessPhone(app, ctx);
  if (!phone) throw new ApiError(401, 'no_access', 'Acesso não encontrado.');
  return json(ctx, 200, { maps: await listMaps(app, phone) });
});

route('POST', '/api/access/logout', async (app, ctx) => {
  const tok = ctx.cookies[A_COOKIE];
  if (tok) await app.db.query('delete from access_sessions where token_hash = $1', [sha256(tok)]);
  ctx.setCookies.push(cookie(A_COOKIE, '', { maxAgeSec: 0, secure: secure(app) }));
  return json(ctx, 200, { ok: true });
});

// ---------- entrega paga ----------

async function authorizeResult(app: App, ctx: Ctx, resultId: string) {
  if (!UUID_RE.test(resultId)) throw new ApiError(403, 'forbidden', 'Acesso não liberado para este mapa.');
  const ent = await one(
    app.db,
    `select e.*, o.session_id, o.buyer_name, o.public_ref from entitlements e join orders o on o.id = e.order_id
     where e.result_id = $1 and e.state = 'active' order by e.created_at limit 1`,
    [resultId],
  );
  if (!ent) throw new ApiError(403, 'forbidden', 'Acesso não liberado para este mapa.');
  const s = await getQuizSession(app, ctx);
  const phone = await getAccessPhone(app, ctx);
  const ok = (s && s.id === ent.session_id) || (phone && phone === ent.buyer_phone);
  if (!ok) throw new ApiError(403, 'forbidden', 'Acesso não liberado para este mapa.');
  return ent;
}

route('GET', '/api/results/:id/full', async (app, ctx) => {
  const ent = await authorizeResult(app, ctx, ctx.params.id);
  const res = await one(app.db, 'select snapshot, result_version, content_version, created_at from results where id = $1', [ent.result_id]);
  const progress = await app.db.query('select career_id, day, checked from progress where entitlement_id = $1', [ent.id]);
  const reflections = await app.db.query('select career_id, interest, repeat_wish, difficulty, decision from reflections where entitlement_id = $1', [ent.id]);
  if (!ent.first_access_at) {
    await app.db.query('update entitlements set first_access_at = now() where id = $1 and first_access_at is null', [ent.id]);
    await recordEvent(app, { eventId: `resultaccess_${ent.order_id}`, name: 'ResultAccess', orderId: ent.order_id, sessionId: ent.session_id });
  }
  return json(ctx, 200, {
    result_id: ent.result_id,
    public_ref: ent.public_ref,
    buyer_first_name: String(ent.buyer_name).split(' ')[0],
    selected_career_id: ent.selected_career_id,
    offer_mode: app.cfg.offerMode,
    diagnostic_interest: !!(await one(app.db, 'select diagnostic_interest_at from orders where id = $1', [ent.order_id]))?.diagnostic_interest_at,
    result_version: res!.result_version,
    content_version: res!.content_version,
    map: res!.snapshot,
    progress,
    reflections,
  });
});

function careerInResult(snapshot: ResultSnapshot, careerId: unknown): string {
  const id = String(careerId ?? '');
  if (!snapshot.cards.some((c) => c.careerId === id)) throw new ApiError(400, 'invalid_career', 'Caminho não pertence a este mapa.');
  return id;
}

route('PUT', '/api/selection', async (app, ctx) => {
  const body = await readJson(ctx);
  const ent = await authorizeResult(app, ctx, String(body.result_id ?? ''));
  const res = await one(app.db, 'select snapshot from results where id = $1', [ent.result_id]);
  const careerId = careerInResult(res!.snapshot, body.career_id);
  await app.db.query('update entitlements set selected_career_id = $2 where id = $1', [ent.id, careerId]);
  return json(ctx, 200, { ok: true, selected_career_id: careerId });
});

route('PUT', '/api/progress', async (app, ctx) => {
  const body = await readJson(ctx);
  const ent = await authorizeResult(app, ctx, String(body.result_id ?? ''));
  const res = await one(app.db, 'select snapshot from results where id = $1', [ent.result_id]);
  const careerId = careerInResult(res!.snapshot, body.career_id);
  const day = Number(body.day);
  if (!Number.isInteger(day) || day < 1 || day > 7) throw new ApiError(400, 'invalid_day', 'Dia inválido.');
  const checked = body.checked === true;
  await app.db.query(
    `insert into progress (entitlement_id, career_id, day, checked) values ($1,$2,$3,$4)
     on conflict (entitlement_id, career_id, day) do update set checked = excluded.checked, updated_at = now()`,
    [ent.id, careerId, day, checked],
  );
  if (!ent.selected_career_id) await app.db.query('update entitlements set selected_career_id = $2 where id = $1 and selected_career_id is null', [ent.id, careerId]);
  if (checked) await recordEvent(app, { eventId: `planstart_${ent.order_id}`, name: 'PlanStart', orderId: ent.order_id, sessionId: ent.session_id });
  return json(ctx, 200, { ok: true });
});

route('PUT', '/api/reflection', async (app, ctx) => {
  const body = await readJson(ctx);
  const ent = await authorizeResult(app, ctx, String(body.result_id ?? ''));
  const res = await one(app.db, 'select snapshot from results where id = $1', [ent.result_id]);
  const careerId = careerInResult(res!.snapshot, body.career_id);
  const score = (v: unknown) => (v === null || v === undefined ? null : Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5 ? v : (() => { throw new ApiError(400, 'invalid_score', 'Nota de 1 a 5.'); })());
  const decision = body.decision ?? null;
  if (decision !== null && !['explore_more', 'know_better', 'try_other'].includes(decision)) throw new ApiError(400, 'invalid_decision', 'Decisão inválida.');
  await app.db.query(
    `insert into reflections (entitlement_id, career_id, interest, repeat_wish, difficulty, decision) values ($1,$2,$3,$4,$5,$6)
     on conflict (entitlement_id, career_id) do update set interest = excluded.interest, repeat_wish = excluded.repeat_wish,
       difficulty = excluded.difficulty, decision = excluded.decision, updated_at = now()`,
    [ent.id, careerId, score(body.interest), score(body.repeat_wish), score(body.difficulty), decision],
  );
  return json(ctx, 200, { ok: true });
});

// ---------- eventos do navegador ----------

const BROWSER_EVENTS = new Set(['PageView', 'ViewResult', 'CheckoutClick']);

route('POST', '/api/events', async (app, ctx) => {
  await limit(app, ctx, 'events', 120, 600);
  const body = await readJson(ctx, 4096);
  const name = String(body.name ?? '');
  const eventId = String(body.event_id ?? '').slice(0, 100);
  if (!BROWSER_EVENTS.has(name) || !eventId) throw new ApiError(400, 'invalid_event', 'Evento inválido.');
  const s = await getQuizSession(app, ctx);
  await recordEvent(app, {
    eventId,
    name,
    sessionId: s?.id,
    attribution: cleanAttribution(body.attribution),
    consent: ['granted', 'denied'].includes(body.consent) ? body.consent : 'unknown',
  });
  return json(ctx, 202, { ok: true });
});

// ---------- admin ----------

function adminToken(app: App, exp: number) {
  return `${exp}.${hmacHex('sha256', app.cfg.appSecret, `admin:${exp}`)}`;
}

function requireAdmin(app: App, ctx: Ctx) {
  const v = ctx.cookies[ADM_COOKIE] ?? '';
  const [expS, sig] = v.split('.');
  const exp = Number(expS);
  if (!app.cfg.admin.password || !sig || !Number.isFinite(exp) || exp < Date.now() || !safeEqual(adminToken(app, exp), v)) {
    throw new ApiError(401, 'admin_required', 'Login de administrador necessário.');
  }
}

route('POST', '/api/admin/login', async (app, ctx) => {
  await limit(app, ctx, 'admin-login', 5, 900);
  const body = await readJson(ctx);
  const pw = String(body.password ?? '').trim();
  if (!app.cfg.admin.password || !safeEqual(sha256(pw), sha256(app.cfg.admin.password.trim()))) throw new ApiError(401, 'invalid_login', 'Senha incorreta.');
  const exp = Date.now() + 8 * 3600_000;
  ctx.setCookies.push(cookie(ADM_COOKIE, adminToken(app, exp), { maxAgeSec: 8 * 3600, secure: secure(app), path: '/api/admin' }));
  return json(ctx, 200, { ok: true });
});

route('GET', '/api/admin/me', async (app, ctx) => {
  requireAdmin(app, ctx);
  return json(ctx, 200, { ok: true });
});

/** Diagnóstico do banco: correção única, dados ainda quebrados e sessões presas. */
route('GET', '/api/admin/db-health', async (app, ctx) => {
  requireAdmin(app, ctx);
  const safe = async (sql: string) => {
    try {
      return await app.db.query(sql);
    } catch (e) {
      return { error: (e as Error).message };
    }
  };
  const [repair, broken, stuck] = await Promise.all([
    safe(`select name, applied_at from app_repairs`),
    safe(`select count(*)::int as n from quiz_sessions where jsonb_typeof(answers) <> 'object' or jsonb_typeof(context) <> 'object' or jsonb_typeof(attribution) <> 'object'`),
    safe(`select pid, state, now() - xact_start as idade, wait_event_type, left(query, 120) as consulta
          from pg_stat_activity
          where datname = current_database() and pid <> pg_backend_pid() and xact_start is not null and now() - xact_start > interval '30 seconds'
          order by xact_start limit 10`),
  ]);
  return json(ctx, 200, { repair, broken, stuck });
});

route('POST', '/api/admin/logout', async (app, ctx) => {
  ctx.setCookies.push(cookie(ADM_COOKIE, '', { maxAgeSec: 0, secure: secure(app), path: '/api/admin' }));
  return json(ctx, 200, { ok: true });
});

route('GET', '/api/admin/orders', async (app, ctx) => {
  requireAdmin(app, ctx);
  const raw = (ctx.url.searchParams.get('q') ?? '').trim();
  const q = normalizeBrPhone(raw) ?? raw.toLowerCase();
  const rows = await app.db.query(
    `select o.id, o.public_ref, o.buyer_phone, o.status, o.amount_cents, o.provider, o.created_at, o.paid_at
     from orders o
     where $1 = '' or o.buyer_phone = $1 or lower(o.public_ref) = $1 or o.id::text = $1
        or exists (select 1 from payments p where p.order_id = o.id and (lower(p.provider_resource_id) = $1 or lower(coalesce(p.provider_payment_id,'')) = $1))
     order by o.created_at desc limit 50`,
    [q],
  );
  return json(ctx, 200, { orders: rows });
});

route('GET', '/api/admin/analytics', async (app, ctx) => {
  requireAdmin(app, ctx);
  const range = parseRange(ctx.url.searchParams.get('from'), ctx.url.searchParams.get('to'));
  const t0 = Date.now();
  const data = await buildAnalytics(app.db, range, app.cfg.offerMode);
  const res = json(ctx, 200, data);
  res.headers.set('server-timing', `db;dur=${Date.now() - t0}`);
  return res;
});

route('GET', '/api/admin/leads', async (app, ctx) => {
  requireAdmin(app, ctx);
  const onlyInterest = ctx.url.searchParams.get('interest') === '1';
  const rows = await app.db.query(
    `select o.id, o.public_ref, o.buyer_name, o.buyer_phone, o.created_at, o.diagnostic_interest_at, o.public_name_ok, o.marketing_opt_in,
       r.snapshot->'cards'->0->>'name' as career, r.context->>'moment' as moment, r.context->>'dailyTime' as daily_time,
       o.attribution->>'utm_content' as utm_content, o.attribution->>'utm_term' as utm_term,
       (select count(*) from progress g join entitlements e on e.id = g.entitlement_id where e.order_id = o.id and g.checked)::int as days_done
     from orders o join results r on r.id = o.result_id
     where o.provider = 'free' ${onlyInterest ? 'and o.diagnostic_interest_at is not null' : ''}
     order by coalesce(o.diagnostic_interest_at, o.created_at) desc limit 1000`,
  );
  return json(ctx, 200, { leads: rows });
});

route('GET', '/api/admin/alerts', async (app, ctx) => {
  requireAdmin(app, ctx);
  const flagged = await app.db.query(`select id, order_id, provider, provider_resource_id, normalized_status, flag, verified_amount_cents, updated_at from payments where flag is not null order by updated_at desc limit 50`);
  const messages = app.messages.enabled
    ? await app.db.query(`select m.id, m.order_id, o.public_ref, m.kind, m.status, m.attempts, m.last_error, m.created_at from message_outbox m left join orders o on o.id = m.order_id where m.status <> 'sent' order by m.created_at desc limit 50`)
    : [];
  const webhooks = await app.db.query(`select provider, event_key, resource_id, signature_valid, result_code, received_at from webhook_events where signature_valid = false or result_code in ('fetch_failed','orphan','review','duplicate') or processed_at is null order by received_at desc limit 50`);
  return json(ctx, 200, { flagged_payments: flagged, pending_messages: messages, webhook_issues: webhooks });
});

route('GET', '/api/admin/orders/:id', async (app, ctx) => {
  requireAdmin(app, ctx);
  const id = ctx.params.id;
  if (!UUID_RE.test(id)) throw new ApiError(404, 'order_not_found', 'Pedido não encontrado.');
  const order = await one(app.db, 'select * from orders where id = $1', [id]);
  if (!order) throw new ApiError(404, 'order_not_found', 'Pedido não encontrado.');
  const { attribution, ...safeOrder } = order;
  const payments = await app.db.query(`select id, provider, provider_resource_id, provider_payment_id, normalized_status, raw_status, verified_amount_cents, currency, flag, expires_at, verified_at, created_at from payments where order_id = $1 order by created_at`, [id]);
  const entitlement = await one(app.db, 'select id, state, created_at, revoked_at, first_access_at from entitlements where order_id = $1', [id]);
  const messages = await app.db.query('select id, kind, status, attempts, last_error, created_at, sent_at from message_outbox where order_id = $1 order by created_at', [id]);
  const audit = await app.db.query('select operator, action, payment_ref, note, created_at from admin_audit where order_id = $1 order by created_at', [id]);
  return json(ctx, 200, { order: { ...safeOrder, utm: cleanAttribution(attribution) }, payments, entitlement, messages, audit, whatsapp_auto: app.messages.enabled });
});

async function adminOrder(app: App, ctx: Ctx) {
  requireAdmin(app, ctx);
  const id = ctx.params.id;
  const order = UUID_RE.test(id) ? await one(app.db, 'select * from orders where id = $1', [id]) : undefined;
  if (!order) throw new ApiError(404, 'order_not_found', 'Pedido não encontrado.');
  return order;
}

route('POST', '/api/admin/orders/:id/reconcile', async (app, ctx) => {
  const order = await adminOrder(app, ctx);
  const pays = await app.db.query('select provider_resource_id from payments where order_id = $1', [order.id]);
  const results = [];
  for (const p of pays) results.push(await reconcilePayment(app, p.provider_resource_id));
  return json(ctx, 200, { results });
});

route('POST', '/api/admin/orders/:id/resend', async (app, ctx) => {
  const order = await adminOrder(app, ctx);
  const body = await readJson(ctx);
  const ent = await one(app.db, `select id from entitlements where order_id = $1 and state = 'active'`, [order.id]);
  if (!ent) throw new ApiError(409, 'not_paid', 'Pedido sem acesso ativo.');
  await app.db.query(`insert into admin_audit (operator, action, order_id, note) values ($1,'resend',$2,$3)`, [String(body.operator ?? 'admin').slice(0, 60), order.id, null]);
  if (app.messages.enabled) {
    await app.db.query(`insert into message_outbox (order_id, kind, to_phone) values ($1,'resend',$2)`, [order.id, order.buyer_phone]);
    await drainOutbox(app, order.id);
    return json(ctx, 200, { ok: true, sent: true });
  }
  // Sem API: devolve o link e um atalho para enviar pelo WhatsApp do operador.
  const link = await accessLink(app, order.buyer_phone, 'purchase');
  const text = accessText({ name: String(order.buyer_name).split(' ')[0], link, kind: 'purchase' }, app.cfg.supportContact);
  return json(ctx, 200, { ok: true, sent: false, link, wa_url: `https://wa.me/${order.buyer_phone}?text=${encodeURIComponent(text)}` });
});

route('POST', '/api/admin/orders/:id/manual-release', async (app, ctx) => {
  const order = await adminOrder(app, ctx);
  const body = await readJson(ctx);
  const operator = String(body.operator ?? '').trim().slice(0, 60);
  const paymentRef = String(body.payment_ref ?? '').trim().slice(0, 100);
  if (!operator || !paymentRef) throw new ApiError(400, 'missing_fields', 'Informe operador e ID do pagamento conferido no provedor.');
  // Com provedor consultável, a liberação manual ainda passa pela verificação do recurso.
  const st = await app.provider.fetchState(paymentRef).catch(() => null);
  let r;
  if (st) {
    if (st.externalReference && st.externalReference !== order.id && st.externalReference !== order.public_ref) {
      throw new ApiError(409, 'reference_mismatch', 'Este pagamento pertence a outro pedido.');
    }
    r = await applyProviderState(app.db, app.cfg, app.provider.name, { ...st, externalReference: order.id });
  } else {
    if (body.force_manual !== true) {
      throw new ApiError(409, 'not_verified', 'Pagamento não encontrado na API do provedor. Confira no painel do provedor e marque "conferência manual" para liberar.');
    }
    // Conferência manual fora do sistema (ex.: Kiwify sem referência, modalidade manual).
    r = await applyProviderState(app.db, app.cfg, `${app.provider.name}:manual`, {
      resourceId: paymentRef, externalReference: order.id, status: 'paid', rawStatus: 'manual_verified',
      amountCents: order.amount_cents, currency: 'BRL',
    });
  }
  await app.db.query(`insert into admin_audit (operator, action, order_id, payment_ref, note) values ($1,'manual_release',$2,$3,$4)`,
    [operator, order.id, paymentRef, String(body.note ?? '').slice(0, 500) || null]);
  await afterApply(app, r);
  return json(ctx, 200, { result: r });
});

route('POST', '/api/admin/orders/:id/revoke', async (app, ctx) => {
  const order = await adminOrder(app, ctx);
  const body = await readJson(ctx);
  const operator = String(body.operator ?? '').trim().slice(0, 60);
  if (!operator) throw new ApiError(400, 'missing_fields', 'Informe o operador.');
  const status = body.reason === 'disputed' ? 'disputed' : 'refunded';
  await app.db.tx(async (t) => {
    await t.query(`update orders set status = $2, updated_at = now() where id = $1`, [order.id, status]);
    await t.query(`update entitlements set state = 'revoked', revoked_at = coalesce(revoked_at, now()) where order_id = $1`, [order.id]);
    await t.query(`insert into admin_audit (operator, action, order_id, note) values ($1,'revoke',$2,$3)`, [operator, order.id, String(body.note ?? '').slice(0, 500) || null]);
  });
  return json(ctx, 200, { ok: true });
});

// ---------- ferramentas de desenvolvimento (somente provedor fake) ----------

route('POST', '/api/dev/fake-pay/:orderId', async (app, ctx) => {
  if (app.cfg.env === 'production' || app.provider.name !== 'fake') throw new ApiError(404, 'not_found', 'Rota não encontrada.');
  const body = await readJson(ctx);
  const pay = await one(
    app.db,
    `select p.provider_resource_id, o.id as order_id, o.amount_cents from payments p join orders o on o.id = p.order_id
     where p.order_id = $1 order by p.created_at desc limit 1`,
    [ctx.params.orderId],
  );
  if (!pay) throw new ApiError(404, 'not_found', 'Sem pagamento.');
  fakeStore.ensure({ resourceId: pay.provider_resource_id, externalReference: pay.order_id, status: 'pending', rawStatus: 'pending', amountCents: pay.amount_cents, currency: 'BRL' });
  fakeStore.setStatus(pay.provider_resource_id, body.status ?? 'paid');
  // Simula o webhook assinado do provedor.
  const raw = JSON.stringify({ event_id: `dev-${Date.now()}`, data: { id: pay.provider_resource_id } });
  const res = await handle(app, new Request(`${app.cfg.publicBaseUrl}/api/webhooks/fake`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-fake-signature': hmacHex('sha256', app.cfg.appSecret, raw) },
    body: raw,
  }));
  return json(ctx, res.status, await res.json());
});

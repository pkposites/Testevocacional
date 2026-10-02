// Mercado Pago — API de Orders (POST/GET /v1/orders) com Pix exibido na nossa página.
// Formatos conferidos no SDK oficial `mercadopago` v3.6.1 (clients/order). Antes do lançamento,
// validar com uma compra real controlada: nomes de status e o cálculo da assinatura do webhook.
import { hmacHex, safeEqual } from '../http';
import type { AppConfig } from '../config';
import {
  centsToDecimal, ProviderNetworkError, toCents,
  type CheckoutResult, type CreateCheckoutInput, type NormalizedStatus, type PaymentProvider, type ProviderPaymentState, type WebhookParse,
} from './types';

type MpOrder = {
  id?: string;
  external_reference?: string;
  status?: string;
  status_detail?: string;
  user_id?: string | number;
  total_amount?: string;
  total_paid_amount?: string;
  currency?: string;
  transactions?: {
    payments?: Array<{
      id?: string;
      status?: string;
      status_detail?: string;
      amount?: string;
      paid_amount?: string;
      date_of_expiration?: string;
      expiration_time?: string;
      payment_method?: { id?: string; type?: string; qr_code?: string; qr_code_base64?: string; ticket_url?: string };
    }>;
    refunds?: Array<{ status?: string }>;
    chargebacks?: Array<{ status?: string }>;
  };
};

/** Normaliza status da Order. Desconhecido nunca vira pago. */
export function normalizeMpStatus(o: MpOrder): NormalizedStatus {
  const s = (o.status ?? '').toLowerCase();
  const d = (o.status_detail ?? '').toLowerCase();
  const p = o.transactions?.payments?.[0];
  const ps = (p?.status ?? '').toLowerCase();
  const pd = (p?.status_detail ?? '').toLowerCase();

  if (s === 'charged_back' || d.includes('charged_back') || d.includes('in_dispute') || (o.transactions?.chargebacks?.length ?? 0) > 0) return 'disputed';
  if (s === 'refunded' || d.includes('refunded') || ps === 'refunded' || pd.includes('refunded')) return 'refunded';
  if (s === 'processed' && (d === 'accredited' || d === '' || pd === 'accredited')) return 'paid';
  if (s === 'expired' || pd === 'expired') return 'expired';
  if (s === 'canceled' || s === 'cancelled') return 'cancelled';
  if (s === 'failed' || s === 'rejected' || ps === 'rejected' || ps === 'failed') return 'rejected';
  return 'pending';
}

export function mapMpOrder(o: MpOrder): ProviderPaymentState {
  const p = o.transactions?.payments?.[0];
  const pm = p?.payment_method;
  return {
    resourceId: String(o.id),
    paymentId: p?.id,
    externalReference: o.external_reference,
    status: normalizeMpStatus(o),
    rawStatus: [o.status, o.status_detail].filter(Boolean).join('/'),
    amountCents: toCents(o.total_amount),
    currency: o.currency,
    collectorId: o.user_id !== undefined ? String(o.user_id) : undefined,
    pix: pm?.qr_code
      ? { qrCode: pm.qr_code, qrBase64: pm.qr_code_base64, ticketUrl: pm.ticket_url, expiresAt: p?.date_of_expiration }
      : undefined,
  };
}

/**
 * Assinatura x-signature: "ts=<ts>,v1=<hmac>". Manifesto: "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
 * com data.id da query string (minúsculo se alfanumérico) e HMAC-SHA256 com a chave secreta do webhook.
 */
export function verifyMpSignature(opts: { secret: string; xSignature: string | null; xRequestId: string | null; dataId: string | null }): boolean {
  if (!opts.xSignature) return false;
  const parts = Object.fromEntries(
    opts.xSignature.split(',').map((kv) => {
      const [k, ...rest] = kv.trim().split('=');
      return [k, rest.join('=')];
    }),
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;
  let manifest = '';
  if (opts.dataId) manifest += `id:${/^[a-z0-9]+$/i.test(opts.dataId) ? opts.dataId.toLowerCase() : opts.dataId};`;
  if (opts.xRequestId) manifest += `request-id:${opts.xRequestId};`;
  manifest += `ts:${ts};`;
  return safeEqual(hmacHex('sha256', opts.secret, manifest), v1.toLowerCase());
}

export function createMercadoPago(cfg: AppConfig, fetchImpl: typeof fetch = fetch): PaymentProvider {
  const base = cfg.mp.apiBase;
  const auth = () => {
    if (!cfg.mp.accessToken) throw new Error('MP_ACCESS_TOKEN não configurado');
    return { Authorization: `Bearer ${cfg.mp.accessToken}` };
  };

  async function call(path: string, init: RequestInit): Promise<any> {
    let res: Response;
    try {
      res = await fetchImpl(`${base}${path}`, { ...init, signal: AbortSignal.timeout(10_000) });
    } catch (e) {
      throw new ProviderNetworkError(`Falha de rede com Mercado Pago: ${(e as Error).message}`);
    }
    const text = await res.text();
    let body: any = undefined;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      /* corpo não-JSON */
    }
    if (res.status === 404) return null;
    if (!res.ok) {
      const msg = body?.errors?.[0]?.message ?? body?.message ?? text.slice(0, 200);
      if (res.status >= 500) throw new ProviderNetworkError(`Mercado Pago ${res.status}: ${msg}`);
      throw new Error(`Mercado Pago ${res.status}: ${msg}`);
    }
    return body;
  }

  return {
    name: 'mercadopago',

    async createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
      const amount = centsToDecimal(input.amountCents);
      const body = {
        type: 'online',
        processing_mode: 'automatic',
        external_reference: input.orderId,
        total_amount: amount,
        description: input.description,
        payer: { email: input.buyerEmail, first_name: input.buyerName },
        transactions: {
          payments: [
            {
              amount,
              payment_method: { id: 'pix', type: 'bank_transfer' },
              expiration_time: `PT${cfg.mp.pixExpirationMinutes}M`,
            },
          ],
        },
      };
      const order: MpOrder = await call('/v1/orders', {
        method: 'POST',
        headers: { ...auth(), 'Content-Type': 'application/json', 'X-Idempotency-Key': `${input.orderId}-${input.attempt}` },
        body: JSON.stringify(body),
      });
      if (!order?.id) throw new Error('Mercado Pago não retornou o ID da order');
      const state = mapMpOrder(order);
      if (!state.pix) throw new Error('Mercado Pago não retornou o QR Code do Pix. Confirme se o Pix está habilitado na conta.');
      if (!state.pix.expiresAt) {
        state.pix.expiresAt = new Date(Date.now() + cfg.mp.pixExpirationMinutes * 60_000).toISOString();
      }
      return { kind: 'pix', state };
    },

    async fetchState(resourceId: string) {
      const order: MpOrder | null = await call(`/v1/orders/${encodeURIComponent(resourceId)}`, { method: 'GET', headers: auth() });
      return order ? mapMpOrder(order) : null;
    },

    async cancel(resourceId: string) {
      await call(`/v1/orders/${encodeURIComponent(resourceId)}/cancel`, {
        method: 'POST',
        headers: { ...auth(), 'X-Idempotency-Key': `cancel-${resourceId}` },
      }).catch(() => undefined); // já paga/expirada: a reconciliação resolve
    },

    async verifyWebhook(req: Request, rawBody: string, url: URL): Promise<WebhookParse> {
      let body: any = {};
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        /* ignora */
      }
      const dataId = url.searchParams.get('data.id') ?? (body?.data?.id != null ? String(body.data.id) : null);
      const xRequestId = req.headers.get('x-request-id');
      const xSignature = req.headers.get('x-signature');
      const valid = !!cfg.mp.webhookSecret && verifyMpSignature({ secret: cfg.mp.webhookSecret, xSignature, xRequestId, dataId });
      const type = url.searchParams.get('type') ?? body?.type ?? '';
      const ts = /ts=([^,]+)/.exec(xSignature ?? '')?.[1] ?? '';
      return {
        valid,
        eventKey: xRequestId ?? `${type}:${dataId}:${body?.action ?? ''}:${ts}`,
        // Só tratamos notificações de Order; outros tópicos são registrados e ignorados.
        resourceId: dataId && (type === '' || type === 'order') ? dataId : undefined,
      };
    },
  };
}

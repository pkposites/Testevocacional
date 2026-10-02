// Kiwify — checkout hospedado (redirecionamento). Adaptador reserva, não ativo no lançamento.
// A especificação pede para NÃO presumir o campo da referência: confirmar em um evento real de teste
// e ajustar KIWIFY_REF_FIELD / KIWIFY_AMOUNT_FIELD. Sem referência confiável → conferência manual.
import { hmacHex, safeEqual } from '../http';
import type { AppConfig } from '../config';
import type { CheckoutResult, CreateCheckoutInput, NormalizedStatus, PaymentProvider, WebhookParse } from './types';

const pick = (obj: any, path: string) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

export function normalizeKiwifyStatus(s: string): NormalizedStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'paid':
    case 'approved':
      return 'paid';
    case 'refunded':
      return 'refunded';
    case 'chargedback':
    case 'chargeback':
      return 'disputed';
    case 'refused':
      return 'rejected';
    default:
      return 'pending';
  }
}

export function createKiwify(cfg: AppConfig, env: Record<string, string | undefined> = process.env): PaymentProvider {
  return {
    name: 'kiwify',
    async createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
      if (!cfg.kiwify.checkoutUrl) throw new Error('KIWIFY_CHECKOUT_URL não configurado');
      const u = new URL(cfg.kiwify.checkoutUrl);
      u.searchParams.set('s1', input.publicRef);
      for (const [k, v] of Object.entries(input.attribution)) if (k.startsWith('utm_')) u.searchParams.set(k, v);
      return { kind: 'redirect', url: u.toString() };
    },
    async fetchState() {
      return null; // sem consulta no MVP; liberação depende do webhook assinado
    },
    async verifyWebhook(_req: Request, rawBody: string, url: URL): Promise<WebhookParse> {
      const sig = url.searchParams.get('signature') ?? '';
      const valid = !!cfg.kiwify.webhookToken && !!sig && safeEqual(hmacHex('sha1', cfg.kiwify.webhookToken, rawBody), sig.toLowerCase());
      let body: any = {};
      try {
        body = JSON.parse(rawBody);
      } catch {
        /* ignora */
      }
      const orderId = String(body?.order_id ?? '');
      const status = normalizeKiwifyStatus(body?.order_status);
      const amountField = env.KIWIFY_AMOUNT_FIELD ?? 'Commissions.charge_amount';
      const amount = Number(pick(body, amountField));
      const productOk = !cfg.kiwify.productId || pick(body, 'Product.product_id') === cfg.kiwify.productId;
      return {
        valid,
        eventKey: `${orderId}:${body?.order_status ?? ''}:${body?.updated_at ?? ''}`,
        resourceId: orderId || undefined,
        inlineState: orderId
          ? {
              resourceId: orderId,
              externalReference: pick(body, cfg.kiwify.refField),
              status,
              rawStatus: String(body?.order_status ?? ''),
              amountCents: Number.isFinite(amount) && productOk ? amount : undefined,
              currency: 'BRL',
            }
          : undefined,
      };
    },
  };
}

// Provedor falso para desenvolvimento e testes automatizados. Bloqueado em produção (config.ts).
import { hmacHex, safeEqual } from '../http';
import type { CheckoutResult, CreateCheckoutInput, NormalizedStatus, PaymentProvider, ProviderPaymentState, WebhookParse } from './types';

const store = new Map<string, ProviderPaymentState>();
let seq = 0;

export const fakeStore = {
  get: (id: string) => store.get(id),
  set(id: string, patch: Partial<ProviderPaymentState>) {
    const cur = store.get(id);
    if (cur) store.set(id, { ...cur, ...patch });
  },
  setStatus(id: string, status: NormalizedStatus) {
    this.set(id, { status, rawStatus: status });
  },
  all: () => [...store.values()],
  reset: () => store.clear(),
};

export function createFake(secret: string): PaymentProvider {
  return {
    name: 'fake',
    async createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
      const id = `FAKE${++seq}${Date.now().toString(36)}`;
      const state: ProviderPaymentState = {
        resourceId: id,
        paymentId: `PAY${id}`,
        externalReference: input.orderId,
        status: 'pending',
        rawStatus: 'action_required/waiting_transfer',
        amountCents: input.amountCents,
        currency: 'BRL',
        pix: {
          qrCode: `00020126FAKEPIX${id}5204000053039865406${(input.amountCents / 100).toFixed(2)}5802BR6304ABCD`,
          expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
        },
      };
      store.set(id, state);
      return { kind: 'pix', state: { ...state } };
    },
    async fetchState(id: string) {
      const s = store.get(id);
      return s ? { ...s } : null;
    },
    async cancel(id: string) {
      const s = store.get(id);
      if (s && s.status === 'pending') store.set(id, { ...s, status: 'cancelled', rawStatus: 'canceled' });
    },
    async verifyWebhook(req: Request, rawBody: string): Promise<WebhookParse> {
      const sig = req.headers.get('x-fake-signature') ?? '';
      const valid = !!sig && safeEqual(hmacHex('sha256', secret, rawBody), sig);
      let body: any = {};
      try {
        body = JSON.parse(rawBody);
      } catch {
        /* ignora */
      }
      return { valid, eventKey: String(body?.event_id ?? ''), resourceId: body?.data?.id };
    },
  };
}

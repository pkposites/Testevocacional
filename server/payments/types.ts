// Contrato comum dos provedores. Trocar de provedor = trocar PAYMENT_PROVIDER.

export type NormalizedStatus = 'pending' | 'paid' | 'expired' | 'cancelled' | 'rejected' | 'refunded' | 'disputed';

export type ProviderPaymentState = {
  resourceId: string;
  paymentId?: string;
  externalReference?: string;
  status: NormalizedStatus;
  rawStatus: string;
  amountCents?: number;
  currency?: string;
  collectorId?: string;
  pix?: { qrCode: string; qrBase64?: string; ticketUrl?: string; expiresAt?: string };
};

export type CreateCheckoutInput = {
  orderId: string;
  publicRef: string;
  attempt: number;
  amountCents: number;
  buyerPhone: string;
  buyerName: string;
  description: string;
  attribution: Record<string, string>;
};

export type CheckoutResult =
  | { kind: 'pix'; state: ProviderPaymentState }
  | { kind: 'redirect'; url: string };

export type WebhookParse = {
  valid: boolean;
  eventKey: string;
  resourceId?: string;
  /** Estado já contido no payload (somente quando o provedor não oferece consulta). */
  inlineState?: ProviderPaymentState;
};

export interface PaymentProvider {
  name: 'mercadopago' | 'kiwify' | 'fake';
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult>;
  /** Consulta o recurso no provedor com a credencial privada. null = provedor sem consulta. */
  fetchState(resourceId: string): Promise<ProviderPaymentState | null>;
  /** Cancela uma cobrança pendente antes de criar outra tentativa. */
  cancel?(resourceId: string): Promise<void>;
  verifyWebhook(req: Request, rawBody: string, url: URL): Promise<WebhookParse>;
}

export class ProviderNetworkError extends Error {}

export const toCents = (v: string | number | undefined): number | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : undefined;
};

export const centsToDecimal = (c: number) => (c / 100).toFixed(2);

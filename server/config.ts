// Configuração lida das variáveis de ambiente do servidor. Nenhum segredo vai para o frontend.

export type AppConfig = {
  env: 'production' | 'development' | 'test';
  publicBaseUrl: string;
  paymentProvider: 'mercadopago' | 'kiwify' | 'fake';
  deliveryMode: 'automatic' | 'manual';
  manualDeliverySla: string;
  priceCents: number;
  currency: 'BRL';
  appSecret: string;
  databaseUrl?: string;
  mp: {
    accessToken?: string;
    webhookSecret?: string;
    expectedUserId?: string;
    pixExpirationMinutes: number;
    apiBase: string;
  };
  kiwify: {
    checkoutUrl?: string;
    webhookToken?: string;
    refField: string;
    productId?: string;
  };
  email: {
    provider: 'resend' | 'log';
    resendApiKey?: string;
    from: string;
  };
  supportContact: string;
  seller: { name: string; document: string; address: string };
  meta: { pixelId?: string; capiToken?: string; testEventCode?: string };
  admin: { password?: string };
  purchaseLinkTtlHours: number;
};

const req = (v: string | undefined, name: string, env: string) => {
  if (!v && env === 'production') throw new Error(`Variável obrigatória ausente: ${name}`);
  return v;
};

export function loadConfig(e: Record<string, string | undefined> = process.env): AppConfig {
  const env = (e.APP_ENV ?? (e.NODE_ENV === 'test' ? 'test' : 'development')) as AppConfig['env'];
  const provider = (e.PAYMENT_PROVIDER ?? (env === 'production' ? 'mercadopago' : 'fake')) as AppConfig['paymentProvider'];
  if (env === 'production' && provider === 'fake') throw new Error('PAYMENT_PROVIDER=fake não é permitido em produção');
  const priceCents = Number(e.PRODUCT_PRICE_CENTS ?? 1450);
  if (!Number.isInteger(priceCents) || priceCents <= 0) throw new Error('PRODUCT_PRICE_CENTS inválido');
  if ((e.CURRENCY ?? 'BRL') !== 'BRL') throw new Error('Somente BRL é suportado');

  const cfg: AppConfig = {
    env,
    publicBaseUrl: (req(e.PUBLIC_BASE_URL, 'PUBLIC_BASE_URL', env) ?? 'http://localhost:5173').replace(/\/$/, ''),
    paymentProvider: provider,
    deliveryMode: (e.DELIVERY_MODE ?? 'automatic') as AppConfig['deliveryMode'],
    manualDeliverySla: e.MANUAL_DELIVERY_SLA ?? 'até 12 horas',
    priceCents,
    currency: 'BRL',
    appSecret: req(e.APP_SECRET, 'APP_SECRET', env) ?? 'dev-secret-not-for-production',
    databaseUrl: e.USE_NETLIFY_DB === '1' ? e.DATABASE_URL : req(e.DATABASE_URL, 'DATABASE_URL', env),
    mp: {
      accessToken: e.MP_ACCESS_TOKEN,
      webhookSecret: e.MP_WEBHOOK_SECRET,
      expectedUserId: e.MP_EXPECTED_USER_ID,
      pixExpirationMinutes: Number(e.MP_PIX_EXPIRATION_MINUTES ?? 30),
      apiBase: e.MP_API_BASE ?? 'https://api.mercadopago.com',
    },
    kiwify: {
      checkoutUrl: e.KIWIFY_CHECKOUT_URL,
      webhookToken: e.KIWIFY_WEBHOOK_TOKEN,
      refField: e.KIWIFY_REF_FIELD ?? 'TrackingParameters.s1',
      productId: e.KIWIFY_PRODUCT_ID,
    },
    email: {
      provider: (e.EMAIL_PROVIDER ?? (e.RESEND_API_KEY ? 'resend' : 'log')) as 'resend' | 'log',
      resendApiKey: e.RESEND_API_KEY,
      from: e.EMAIL_FROM ?? 'Mapa da Carreira <nao-responda@example.com>',
    },
    supportContact: e.SUPPORT_CONTACT ?? 'suporte@example.com',
    seller: {
      name: e.SELLER_NAME ?? '[Nome do vendedor]',
      document: e.SELLER_DOCUMENT ?? '[CNPJ/CPF]',
      address: e.SELLER_ADDRESS ?? '',
    },
    meta: { pixelId: e.META_PIXEL_ID, capiToken: e.META_CAPI_TOKEN, testEventCode: e.META_TEST_EVENT_CODE },
    admin: { password: e.ADMIN_PASSWORD },
    purchaseLinkTtlHours: Number(e.PURCHASE_LINK_TTL_HOURS ?? 168),
  };

  if (env === 'production') {
    if (cfg.appSecret.length < 32) throw new Error('APP_SECRET precisa de pelo menos 32 caracteres');
    if (provider === 'mercadopago' && (!cfg.mp.accessToken || !cfg.mp.webhookSecret)) {
      throw new Error('MP_ACCESS_TOKEN e MP_WEBHOOK_SECRET são obrigatórios com Mercado Pago');
    }
    if (provider === 'kiwify' && (!cfg.kiwify.checkoutUrl || !cfg.kiwify.webhookToken)) {
      throw new Error('KIWIFY_CHECKOUT_URL e KIWIFY_WEBHOOK_TOKEN são obrigatórios com Kiwify');
    }
  }
  return cfg;
}

// Configuração lida das variáveis de ambiente do servidor. Nenhum segredo vai para o frontend.

export type AppConfig = {
  env: 'production' | 'development' | 'test';
  publicBaseUrl: string;
  paymentProvider: 'mercadopago' | 'kiwify' | 'fake';
  offerMode: 'free' | 'paid';
  deliveryMode: 'automatic' | 'manual';
  manualDeliverySla: string;
  priceCents: number;
  /** Diagnóstico (produto pago depois do mapa): waitlist = só lista de interesse; paid = cobra por Pix. */
  diagnosticMode: 'waitlist' | 'paid';
  diagnosticPriceCents: number;
  currency: 'BRL';
  appSecret: string;
  databaseUrl?: string;
  mp: {
    accessToken?: string;
    webhookSecret?: string;
    expectedUserId?: string;
    payerEmailTemplate?: string;
    pixExpirationMinutes: number;
    apiBase: string;
    /** Worker da Cloudflare que guarda o Access Token (preferido ao token no site). */
    relayUrl?: string;
    relaySecret?: string;
  };
  kiwify: {
    checkoutUrl?: string;
    webhookToken?: string;
    refField: string;
    productId?: string;
  };
  whatsapp: {
    provider: 'cloud' | 'none' | 'log';
    token?: string;
    phoneNumberId?: string;
    templateName?: string;
    templateLang: string;
  };
  supportContact: string;
  seller: { name: string; document: string; address: string };
  meta: { pixelId?: string; capiToken?: string; testEventCode?: string; relayUrl?: string; relaySecret?: string };
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
  const diagnosticPriceCents = Number(e.DIAGNOSTIC_PRICE_CENTS ?? 2990);
  if (!Number.isInteger(diagnosticPriceCents) || diagnosticPriceCents <= 0) throw new Error('DIAGNOSTIC_PRICE_CENTS inválido');
  if ((e.CURRENCY ?? 'BRL') !== 'BRL') throw new Error('Somente BRL é suportado');

  const cfg: AppConfig = {
    env,
    publicBaseUrl: (req(e.PUBLIC_BASE_URL, 'PUBLIC_BASE_URL', env) ?? 'http://localhost:5173').replace(/\/$/, ''),
    paymentProvider: provider,
    offerMode: (e.OFFER_MODE ?? 'free') === 'paid' ? 'paid' : 'free',
    deliveryMode: (e.DELIVERY_MODE ?? 'automatic') as AppConfig['deliveryMode'],
    manualDeliverySla: e.MANUAL_DELIVERY_SLA ?? 'até 12 horas',
    priceCents,
    diagnosticMode: e.DIAGNOSTIC_MODE === 'paid' ? 'paid' : 'waitlist',
    diagnosticPriceCents,
    currency: 'BRL',
    appSecret: req(e.APP_SECRET, 'APP_SECRET', env) ?? 'dev-secret-not-for-production',
    databaseUrl: e.USE_NETLIFY_DB === '1' ? e.DATABASE_URL : req(e.DATABASE_URL, 'DATABASE_URL', env),
    mp: {
      accessToken: e.MP_ACCESS_TOKEN,
      webhookSecret: e.MP_WEBHOOK_SECRET,
      expectedUserId: e.MP_EXPECTED_USER_ID,
      payerEmailTemplate: e.MP_PAYER_EMAIL_TEMPLATE,
      pixExpirationMinutes: Number(e.MP_PIX_EXPIRATION_MINUTES ?? 30),
      apiBase: e.MP_API_BASE ?? 'https://api.mercadopago.com',
      // Mesmo Worker e mesma assinatura usados para a Meta (MP_RELAY=1 liga).
      relayUrl: e.MP_RELAY === '1' ? (e.RELAY_URL ?? e.META_RELAY_URL)?.replace(/\/+$/, '') : undefined,
      relaySecret: e.MP_RELAY === '1' ? e.RELAY_SECRET ?? e.META_RELAY_SECRET : undefined,
    },
    kiwify: {
      checkoutUrl: e.KIWIFY_CHECKOUT_URL,
      webhookToken: e.KIWIFY_WEBHOOK_TOKEN,
      refField: e.KIWIFY_REF_FIELD ?? 'TrackingParameters.s1',
      productId: e.KIWIFY_PRODUCT_ID,
    },
    whatsapp: {
      provider: (e.WHATSAPP_PROVIDER ?? (e.WHATSAPP_TOKEN ? 'cloud' : env === 'production' ? 'none' : 'log')) as AppConfig['whatsapp']['provider'],
      token: e.WHATSAPP_TOKEN,
      phoneNumberId: e.WHATSAPP_PHONE_NUMBER_ID,
      templateName: e.WHATSAPP_TEMPLATE_NAME,
      templateLang: e.WHATSAPP_TEMPLATE_LANG ?? 'pt_BR',
    },
    supportContact: e.SUPPORT_CONTACT ?? 'suporte@example.com',
    seller: {
      name: e.SELLER_NAME ?? '[Nome do vendedor]',
      document: e.SELLER_DOCUMENT ?? '[CNPJ/CPF]',
      address: e.SELLER_ADDRESS ?? '',
    },
    meta: {
      pixelId: e.META_PIXEL_ID,
      capiToken: e.META_CAPI_TOKEN,
      testEventCode: e.META_TEST_EVENT_CODE,
      // Worker da Cloudflare que guarda o token (preferido ao token direto).
      relayUrl: e.META_RELAY_URL?.replace(/\/+$/, ''),
      relaySecret: e.META_RELAY_SECRET,
    },
    admin: { password: e.ADMIN_PASSWORD },
    purchaseLinkTtlHours: Number(e.PURCHASE_LINK_TTL_HOURS ?? 168),
  };

  if (cfg.whatsapp.provider === 'cloud' && (!cfg.whatsapp.token || !cfg.whatsapp.phoneNumberId || !cfg.whatsapp.templateName)) {
    throw new Error('WhatsApp cloud exige WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID e WHATSAPP_TEMPLATE_NAME');
  }
  if (env === 'production') {
    if (cfg.whatsapp.provider === 'log') throw new Error('WHATSAPP_PROVIDER=log não é permitido em produção');
    if (cfg.appSecret.length < 32) throw new Error('APP_SECRET precisa de pelo menos 32 caracteres');
    if (provider === 'mercadopago' && (!(cfg.mp.accessToken || (cfg.mp.relayUrl && cfg.mp.relaySecret)) || !cfg.mp.webhookSecret)) {
      throw new Error('Mercado Pago exige MP_WEBHOOK_SECRET e o token (MP_ACCESS_TOKEN ou MP_RELAY=1 com o Worker)');
    }
    if (provider === 'kiwify' && (!cfg.kiwify.checkoutUrl || !cfg.kiwify.webhookToken)) {
      throw new Error('KIWIFY_CHECKOUT_URL e KIWIFY_WEBHOOK_TOKEN são obrigatórios com Kiwify');
    }
  }
  return cfg;
}

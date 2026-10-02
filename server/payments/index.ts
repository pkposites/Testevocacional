import type { AppConfig } from '../config';
import { createFake } from './fake';
import { createKiwify } from './kiwify';
import { createMercadoPago } from './mercadopago';
import type { PaymentProvider } from './types';

export function createProvider(cfg: AppConfig, name = cfg.paymentProvider): PaymentProvider {
  if (name === 'mercadopago') return createMercadoPago(cfg);
  if (name === 'kiwify') return createKiwify(cfg);
  if (cfg.env === 'production') throw new Error('Provedor fake bloqueado em produção');
  return createFake(cfg.appSecret);
}
